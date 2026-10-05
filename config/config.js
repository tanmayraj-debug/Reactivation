require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  costPerDelivered: parseFloat(process.env.COST_PER_DELIVERED || '0.85'),

  timesMobile: {
    baseUrl: process.env.TIMESMOBILE_BASE_URL || '',
    apiKey: process.env.TIMESMOBILE_API_KEY || '',
  },

  approverWhatsAppNumber: process.env.APPROVER_WHATSAPP_NUMBER || '',

  lsq: {
    baseUrl: process.env.LSQ_BASE_URL || 'https://api-in21.leadsquared.com/v2',
    accessKey: process.env.LSQ_ACCESS_KEY || '',
    secretKey: process.env.LSQ_SECRET_KEY || '',
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
  },

  email: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.ALERT_FROM_EMAIL || '',
    digestRecipients: (process.env.DIGEST_RECIPIENTS || '').split(',').map(s => s.trim()).filter(Boolean),
  },

  // Charters, exactly as locked in the requirements doc
  charters: {
    rollup: ['DS Reactivation', 'DS Open Cases', 'Agentic'],
    granular: [
      'Referral',
      'Reactivation M-N Open Funnel',
      'Reactivation M-N Not Open Funnel',
      'Reactivation M0 Created',
      'Open Cases',
      'Agentic',
      'Masterclass',
    ],
    // granular -> rollup mapping (DS Reactivation = sum of all Reactivation variants)
    granularToRollup: {
      'Referral': null,
      'Reactivation M-N Open Funnel': 'DS Reactivation',
      'Reactivation M-N Not Open Funnel': 'DS Reactivation',
      'Reactivation M0 Created': 'DS Reactivation',
      'Open Cases': 'DS Open Cases',
      'Agentic': 'Agentic',
      'Masterclass': null,
    },
  },

  // Assigned Path A thresholds (still pending final confirmation - see requirements doc open items)
  assignedThresholds: {
    singleCampaignClicks: 3,
    crossCampaignClicks: 5,
    crossCampaignWindowDays: 3,
  },
  assignedFastConversionHours: 2,
};
