const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const config = require('./config/config');
const authService = require('./services/authService');

const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const templateRoutes = require('./routes/templates');
const cohortRoutes = require('./routes/cohorts');
const campaignRoutes = require('./routes/campaigns');
const funnelRoutes = require('./routes/funnel');
const budgetRoutes = require('./routes/budget');
const assignmentRoutes = require('./routes/assignment');
const plannerRoutes = require('./routes/planner');
const aiRoutes = require('./routes/ai');
const webhookRoutes = require('./routes/webhook');

const { runDailyPlannerCheck } = require('./jobs/plannerRunner');
const { runWeeklyDigest } = require('./jobs/weeklyDigest');
const alertService = require('./services/alertService');

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7 days
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/cohorts', cohortRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/funnel', funnelRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/assignment', assignmentRoutes);
app.use('/api/planner', plannerRoutes);
app.use('/api/ai', aiRoutes);
app.use('/webhook', webhookRoutes); // TimesMobile calls this directly - no auth, no /api prefix

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    timesMobileConfigured: Boolean(config.timesMobile.apiKey),
    lsqConfigured: Boolean(config.lsq.accessKey),
    anthropicConfigured: Boolean(config.anthropic.apiKey),
    approverNumberConfigured: Boolean(config.approverWhatsAppNumber),
    smtpConfigured: Boolean(config.email.host),
    needsBootstrap: authService.userCount() === 0,
  });
});

app.listen(config.port, () => {
  console.log(`WABA platform running on http://localhost:${config.port}`);
  console.log(`TimesMobile webhooks to configure (see README):`);
  console.log(`  Status:          ${config.publicBaseUrl || '<PUBLIC_BASE_URL>'}/webhook/timesmobile/status`);
  console.log(`  Inbound clicks:  ${config.publicBaseUrl || '<PUBLIC_BASE_URL>'}/webhook/timesmobile/inbound`);
  console.log(`  Template status: ${config.publicBaseUrl || '<PUBLIC_BASE_URL>'}/webhook/timesmobile/template-status`);
});

// --- Cron jobs ---
// Daily at 8am server time: planner reminder for entries due today
cron.schedule('0 8 * * *', () => {
  runDailyPlannerCheck().catch((e) => console.error('Planner job failed:', e));
});

// Every Monday at 8am: weekly digest
cron.schedule('0 8 * * 1', () => {
  runWeeklyDigest().catch((e) => console.error('Weekly digest job failed:', e));
});

// Every 6 hours: delivery-rate-drop check
cron.schedule('0 */6 * * *', () => {
  alertService.checkDeliveryRateDrop(config).catch((e) => console.error('Delivery-rate check failed:', e));
});

// Every 30 minutes: re-run Assigned qualification checks (clicks / fast-conversion)
cron.schedule('*/30 * * * *', () => {
  try {
    require('./services/assignmentService').runAllQualificationChecks();
  } catch (e) {
    console.error('Qualification check failed:', e);
  }
});
