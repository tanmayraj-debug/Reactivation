const GRANULAR_CHARTERS = ['Referral','Reactivation M-N Open Funnel','Reactivation M-N Not Open Funnel','Reactivation M0 Created','Open Cases','Agentic','Masterclass'];

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---------- Auth ----------
async function checkAuth() {
  try {
    const health = await api('/health');
    updateStatusBadge(health);
    if (health.needsBootstrap) {
      document.getElementById('bootstrapNotice').classList.remove('hidden');
      document.getElementById('loginForm').classList.add('hidden');
      return;
    }
    const me = await api('/auth/me');
    showApp();
  } catch (e) {
    // not logged in - show login screen (already default)
  }
}

function updateStatusBadge(health) {
  const badge = document.getElementById('statusBadge');
  const missing = [];
  if (!health.timesMobileConfigured) missing.push('TimesMobile');
  if (!health.lsqConfigured) missing.push('LSQ');
  if (!health.anthropicConfigured) missing.push('Claude');
  if (!health.approverNumberConfigured) missing.push('approver #');
  if (!health.smtpConfigured) missing.push('SMTP');
  if (missing.length) {
    badge.textContent = 'missing: ' + missing.join(', ');
    badge.className = 'badge warn';
  } else {
    badge.textContent = 'all systems configured';
    badge.className = 'badge ok';
  }
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  try {
    await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    showApp();
  } catch (e) {
    document.getElementById('loginError').textContent = e.message;
  }
}

async function doBootstrap() {
  const name = document.getElementById('bsName').value;
  const email = document.getElementById('bsEmail').value;
  const password = document.getElementById('bsPassword').value;
  try {
    await api('/auth/bootstrap', { method: 'POST', body: JSON.stringify({ email, password, name }) });
    showApp();
  } catch (e) {
    alert(e.message);
  }
}

async function doLogout() {
  await api('/auth/logout', { method: 'POST' });
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  initTabs();
  initAllPages();
}

// ---------- Tabs ----------
function initTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('page-' + btn.dataset.tab).classList.add('active');
    });
  });
}

function renderFunnelGrid(elId, funnel) {
  const el = document.getElementById(elId);
  const labels = { selected: 'Selected', sent: 'Sent', delivered: 'Delivered', read: 'Read', clicked: 'Clicked', assigned: 'Assigned', lead: 'Lead', trueChurn: 'True Churn', prospect: 'Prospect', sessionScheduled: 'Session Scheduled', sessionDone: 'Session Done', rfd: 'RFD' };
  el.innerHTML = Object.entries(labels).map(([key, label]) => `
    <div class="funnel-stat"><div class="num">${funnel[key] ?? 0}</div><div class="label">${label}</div></div>
  `).join('');
}

// ---------- Page 1: Dashboard ----------
async function loadDashboard() {
  const charters = [...document.querySelectorAll('.rollup-charter:checked')].map((c) => c.value);
  const dateFrom = document.getElementById('dashFrom').value;
  const dateTo = document.getElementById('dashTo').value;
  const q = new URLSearchParams({ charters: charters.join(','), dateFrom, dateTo });
  const funnel = await api('/funnel/rollup?' + q);
  renderFunnelGrid('dashFunnel', funnel);
}

// ---------- Page 2: Charter-wise ----------
function initCharterCheckboxes() {
  const box = document.getElementById('charterCheckboxes');
  box.innerHTML = GRANULAR_CHARTERS.map((c) => `<label><input type="checkbox" class="granular-charter" value="${c}" checked> ${c}</label>`).join(' ');
}

async function loadCharterFunnel() {
  const charters = [...document.querySelectorAll('.granular-charter:checked')].map((c) => c.value);
  const dateFrom = document.getElementById('charterFrom').value;
  const dateTo = document.getElementById('charterTo').value;
  const q = new URLSearchParams({ charters: charters.join(','), dateFrom, dateTo });
  const data = await api('/funnel/by-charter?' + q);
  const el = document.getElementById('charterResults');
  el.innerHTML = Object.entries(data).map(([charter, funnel]) => `
    <div class="card"><h3>${charter}</h3><div class="funnel-grid" id="cf-${charter.replace(/\W/g,'')}"></div></div>
  `).join('');
  for (const [charter, funnel] of Object.entries(data)) {
    renderFunnelGrid('cf-' + charter.replace(/\W/g, ''), funnel);
  }
}

// ---------- Page 3: Deep-dive ----------
function initDeepDiveCharterSelect() {
  const sel = document.getElementById('deepdiveCharter');
  sel.innerHTML = GRANULAR_CHARTERS.map((c) => `<option value="${c}">${c}</option>`).join('');
}

async function loadDeepDive() {
  const charter = document.getElementById('deepdiveCharter').value;
  const dateFrom = document.getElementById('deepdiveFrom').value;
  const dateTo = document.getElementById('deepdiveTo').value;
  if (!dateFrom || !dateTo) return alert('Pick a date range');
  const q = new URLSearchParams({ charter, dateFrom, dateTo });
  const data = await api('/funnel/deep-dive?' + q);
  const el = document.getElementById('deepdiveResults');
  el.innerHTML = `
    <div class="card"><h3>This range</h3><div class="funnel-grid" id="dd-current"></div></div>
    <div class="card"><h3>Same range, previous month</h3><div class="funnel-grid" id="dd-previous"></div></div>
    <div class="card"><h3>RFD by BDE (this range)</h3>
      <table><thead><tr><th>BDE</th><th>RFD count</th></tr></thead><tbody>
        ${data.rfdByBde.map(r => `<tr><td>${r.bde || '(unassigned)'}</td><td>${r.rfd_count}</td></tr>`).join('') || '<tr><td colspan="2">No data</td></tr>'}
      </tbody></table>
    </div>
    <div class="card"><h3>Live pipeline by BDE</h3>
      <table><thead><tr><th>BDE</th><th>Stage</th><th>Count</th></tr></thead><tbody>
        ${data.pipelineByBde.map(r => `<tr><td>${r.bde || '(unassigned)'}</td><td>${r.stage}</td><td>${r.c}</td></tr>`).join('') || '<tr><td colspan="3">No data</td></tr>'}
      </tbody></table>
    </div>
  `;
  renderFunnelGrid('dd-current', data.current);
  renderFunnelGrid('dd-previous', data.previous);
}

// ---------- Page 4: Budget ----------
async function loadBudget() {
  const data = await api('/budget/by-charter');
  const el = document.getElementById('budgetResults');
  el.innerHTML = `<table><thead><tr><th>Charter</th><th>Delivered</th><th>Spend</th><th>Week Budget</th><th>Month Budget</th><th>Over?</th></tr></thead><tbody>
    ${Object.entries(data).map(([charter, d]) => `
      <tr>
        <td>${charter}</td><td>${d.delivered}</td><td>₹${d.cost.toFixed(2)}</td>
        <td>${d.weekBudget ?? '-'}</td><td>${d.monthBudget ?? '-'}</td>
        <td>${(d.overWeekBudget || d.overMonthBudget) ? '<span style="color:#b0261e;font-weight:600">OVER</span>' : 'OK'}</td>
      </tr>`).join('')}
  </tbody></table>`;

  const weekWise = await api('/budget/week-wise');
  document.getElementById('weekWiseResults').innerHTML = `<table><thead><tr><th>Week (Mon)</th><th>Charter</th><th>Delivered</th><th>Cost</th></tr></thead><tbody>
    ${weekWise.map(w => `<tr><td>${w.weekStart}</td><td>${w.charter}</td><td>${w.delivered}</td><td>₹${w.cost.toFixed(2)}</td></tr>`).join('') || '<tr><td colspan="4">No data yet</td></tr>'}
  </tbody></table>`;
}

async function setBudget() {
  const charter = document.getElementById('budgetCharter').value;
  const periodType = document.getElementById('budgetPeriodType').value;
  const periodStart = document.getElementById('budgetPeriodStart').value;
  const amount = parseFloat(document.getElementById('budgetAmount').value);
  if (!periodStart || !amount) return alert('Fill period start and amount');
  await api('/budget/set', { method: 'POST', body: JSON.stringify({ charter: charter || null, periodType, periodStart, amount }) });
  loadBudget();
}

// ---------- Page 5: Create Campaign ----------
let selectedMessage = null;

async function loadMessagesIntoSelect() {
  const messages = await api('/messages');
  const sel = document.getElementById('messageSelect');
  sel.innerHTML = '<option value="">-- select previous --</option>' + messages.map(m => `<option value="${m.id}" data-body="${encodeURIComponent(m.body)}">${m.body.slice(0,50)}</option>`).join('');
  sel.onchange = () => {
    const opt = sel.options[sel.selectedIndex];
    selectedMessage = opt.value ? { id: opt.value, body: decodeURIComponent(opt.dataset.body) } : null;
  };
  return messages;
}

async function saveMessage() {
  const body = document.getElementById('newMessageBody').value.trim();
  if (!body) return alert('Write a message first');
  await api('/messages', { method: 'POST', body: JSON.stringify({ body }) });
  document.getElementById('newMessageBody').value = '';
  await loadMessagesIntoSelect();
}

async function generateWithAI() {
  const prompt = document.getElementById('aiPrompt').value.trim();
  if (!prompt) return alert('Describe what you want first');
  const charter = document.getElementById('charterGranularSelect').value;
  try {
    const { draft } = await api('/messages/generate', { method: 'POST', body: JSON.stringify({ prompt, charter }) });
    document.getElementById('newMessageBody').value = draft;
  } catch (e) {
    alert('AI draft failed: ' + e.message);
  }
}

async function loadTemplatesIntoSelect() {
  const templates = await api('/templates');
  const sel = document.getElementById('templateSelect');
  sel.innerHTML = '<option value="">-- select existing template --</option>' + templates.map(t => `<option value="${t.id}">${t.name} (${t.status})</option>`).join('');
}

async function submitTemplate() {
  const name = document.getElementById('templateName').value.trim();
  const category = document.getElementById('templateCategory').value;
  if (!name) return alert('Enter a template name');
  if (!selectedMessage) return alert('Save or select a message first');
  const components = [{ type: 'BODY', text: selectedMessage.body }];
  try {
    const t = await api('/templates', { method: 'POST', body: JSON.stringify({ messageId: selectedMessage.id, name, category, components }) });
    document.getElementById('templateStatusBox').innerHTML = `Submitted: <b>${t.name}</b> - status: <span class="status-pill">${t.status}</span>`;
    await loadTemplatesIntoSelect();
  } catch (e) {
    alert('Template submission failed: ' + e.message);
  }
}

async function refreshTemplateStatus() {
  const id = document.getElementById('templateSelect').value;
  if (!id) return alert('Select a template first');
  const t = await api(`/templates/${id}/refresh-status`, { method: 'POST' });
  document.getElementById('templateStatusBox').innerHTML = `<b>${t.name}</b> - status: <span class="status-pill status-${t.status}">${t.status}</span>${t.rejected_reason ? ' - ' + t.rejected_reason : ''}`;
}

async function loadCohortsIntoSelect() {
  const sel = document.getElementById('cohortSelect');
  try {
    const cohorts = await api('/cohorts');
    const list = Array.isArray(cohorts) ? cohorts : (cohorts.Lists || cohorts.res_json || []);
    sel.innerHTML = '<option value="">-- select cohort --</option>' + (list || []).map(c => `<option value="${c.ListId || c.Id}">${c.ListName || c.Name}</option>`).join('');
  } catch (e) {
    sel.innerHTML = '<option value="">Could not load - check LSQ config</option>';
  }
  // also populate planner cohort select
  document.getElementById('plannerCohort').innerHTML = sel.innerHTML;
}

function initCharterSelects() {
  const opts = GRANULAR_CHARTERS.map(c => `<option value="${c}">${c}</option>`).join('');
  document.getElementById('charterGranularSelect').innerHTML = opts;
  document.getElementById('plannerCharter').innerHTML = opts;
}

let currentDraftCampaignId = null;

async function createCampaign() {
  const templateId = document.getElementById('templateSelect').value;
  const cohortSel = document.getElementById('cohortSelect');
  const cohortListId = cohortSel.value;
  const cohortName = cohortSel.options[cohortSel.selectedIndex]?.textContent;
  const charterGranular = document.getElementById('charterGranularSelect').value;
  const scheduledDate = document.getElementById('campaignSchedule').value;
  const name = document.getElementById('campaignName').value.trim();
  if (!templateId) return alert('Select a template');
  if (!cohortListId) return alert('Select a cohort');
  if (!name) return alert('Enter a campaign name');

  const campaign = await api('/campaigns', { method: 'POST', body: JSON.stringify({
    name, templateId, cohortListId, cohortName, charterGranular, scheduledDate, messageId: selectedMessage ? selectedMessage.id : null,
  })});
  currentDraftCampaignId = campaign.id;
  renderCampaignActions(campaign);
}

function renderCampaignActions(campaign) {
  const box = document.getElementById('campaignActionsBox');
  box.innerHTML = `<p>Campaign <b>${campaign.name}</b> - status: <span class="status-pill status-${campaign.status}">${campaign.status}</span></p>`;
  if (campaign.status === 'draft') {
    box.innerHTML += `<button onclick="sendTestForCampaign(${campaign.id})">Send test to my WhatsApp</button>`;
  } else if (campaign.status === 'awaiting_approval') {
    box.innerHTML += `<button onclick="approveCampaign(${campaign.id})">Approve &amp; Launch</button> <button onclick="rejectCampaign(${campaign.id})">Reject</button>`;
  } else if (campaign.status === 'launched') {
    box.innerHTML += `<p>Launched.</p>`;
  }
}

async function sendTestForCampaign(id) {
  try {
    const { campaign } = await api(`/campaigns/${id}/send-test`, { method: 'POST' });
    renderCampaignActions(campaign);
  } catch (e) { alert('Test send failed: ' + e.message); }
}

async function approveCampaign(id) {
  try {
    const result = await api(`/campaigns/${id}/approve-and-launch`, { method: 'POST' });
    renderCampaignActions(result.campaign);
    alert(`Launched: ${result.sent} sent, ${result.failed} failed, out of ${result.totalCohort} in cohort.`);
  } catch (e) { alert('Launch failed: ' + e.message); }
}

async function rejectCampaign(id) {
  const campaign = await api(`/campaigns/${id}/reject`, { method: 'POST' });
  renderCampaignActions(campaign);
}

// ---------- Page 6: Assignment ----------
async function loadCampaignsIntoAssignSelect() {
  const campaigns = await api('/campaigns');
  document.getElementById('assignCampaignSelect').innerHTML = campaigns.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function loadQualifiedLeads() {
  const campaignId = document.getElementById('assignCampaignSelect').value;
  if (!campaignId) return;
  const leads = await api(`/assignment/campaign/${campaignId}`);
  const tbody = document.querySelector('#qualifiedTable tbody');
  tbody.innerHTML = leads.map(l => `
    <tr><td><input type="checkbox" class="lead-check" value="${l.lead_id}"></td><td>${l.lead_id}</td><td>${l.qualification_reason}</td><td>${l.current_stage || '-'}</td><td>${l.qualified_at}</td></tr>
  `).join('') || '<tr><td colspan="5">No qualified leads for this campaign yet</td></tr>';

  try {
    const bdes = await api('/assignment/bdes');
    const list = bdes.res_json || bdes.Users || bdes || [];
    document.getElementById('bdeSelect').innerHTML = '<option value="">-- select BDE --</option>' + (Array.isArray(list) ? list : []).map(u => `<option value="${u.EmailAddress || u.email}">${u.FirstName || u.name || u.EmailAddress || u.email}</option>`).join('');
  } catch (e) { /* BDE list load is best-effort */ }
}

async function recomputeQualification() {
  const result = await api('/assignment/recompute', { method: 'POST' });
  alert(`Qualification recomputed: ${JSON.stringify(result)}`);
  loadQualifiedLeads();
}

function toggleAllLeads(checkbox) {
  document.querySelectorAll('.lead-check').forEach(c => c.checked = checkbox.checked);
}

async function assignSelected() {
  const leadIds = [...document.querySelectorAll('.lead-check:checked')].map(c => c.value);
  const bdeEmail = document.getElementById('bdeSelect').value;
  if (!leadIds.length) return alert('Select at least one lead');
  if (!bdeEmail) return alert('Select a BDE');
  const result = await api('/assignment/assign', { method: 'POST', body: JSON.stringify({ leadIds, bdeEmail }) });
  alert('Assignment result: ' + JSON.stringify(result.results));
  loadQualifiedLeads();
}

// ---------- Page 7: Search/Compare ----------
async function searchCampaigns() {
  const search = document.getElementById('campaignSearchBox').value;
  const campaigns = await api('/campaigns?' + new URLSearchParams({ search }));
  const tbody = document.querySelector('#campaignSearchTable tbody');
  tbody.innerHTML = campaigns.map(c => `
    <tr><td><input type="checkbox" class="campaign-check" value="${c.id}"></td><td>${c.name}</td><td>${c.charter_granular}</td><td>${c.status}</td><td>${c.created_at}</td></tr>
  `).join('');
}

async function compareSelectedCampaigns() {
  const ids = [...document.querySelectorAll('.campaign-check:checked')].map(c => c.value);
  if (!ids.length) return alert('Select at least one campaign');
  const results = await Promise.all(ids.map(id => api(`/funnel/campaign/${id}`)));
  const el = document.getElementById('compareResults');
  el.innerHTML = results.map((f, i) => `
    <div class="card"><h3>Campaign #${ids[i]}</h3>
      <div class="funnel-grid" id="cmp-${ids[i]}"></div>
      <p>CTR: ${(f.clickThroughRate*100).toFixed(1)}% | Assigned→Prospect: ${(f.assignedToProspectRate*100).toFixed(1)}% | Assigned→RFD: ${(f.assignedToRfdRate*100).toFixed(1)}%</p>
    </div>
  `).join('');
  results.forEach((f, i) => renderFunnelGrid('cmp-' + ids[i], f));
}

// ---------- Page 8: AI Assist ----------
async function loadPlaybook() {
  const row = await api('/messages/playbook');
  document.getElementById('playbookText').value = row.content_text || '';
}

async function savePlaybook() {
  const content = document.getElementById('playbookText').value.trim();
  if (!content) return alert('Paste something first');
  await api('/messages/playbook', { method: 'POST', body: JSON.stringify({ content }) });
  alert('Playbook saved - will be used in all future AI drafts and calendar suggestions.');
}

async function suggestCalendar() {
  const constraint = document.getElementById('calendarConstraint').value.trim();
  if (!constraint) return alert('Describe the date constraint first');
  try {
    const { suggestion } = await api('/ai/suggest-calendar', { method: 'POST', body: JSON.stringify({ constraint }) });
    document.getElementById('calendarSuggestion').textContent = suggestion;
  } catch (e) { alert('Suggestion failed: ' + e.message); }
}

// ---------- Page 9: Planner ----------
async function loadPlannerMessages() {
  const messages = await api('/messages');
  document.getElementById('plannerMessage').innerHTML = messages.map(m => `<option value="${m.id}">${m.body.slice(0,40)}</option>`).join('');
}

async function addPlannerEntry() {
  const plannedDate = document.getElementById('plannerDate').value;
  const cohortSel = document.getElementById('plannerCohort');
  const cohortListId = cohortSel.value;
  const cohortName = cohortSel.options[cohortSel.selectedIndex]?.textContent;
  const messageId = document.getElementById('plannerMessage').value;
  const charterGranular = document.getElementById('plannerCharter').value;
  if (!plannedDate || !cohortListId) return alert('Pick a date and cohort');
  await api('/planner', { method: 'POST', body: JSON.stringify({ plannedDate, cohortListId, cohortName, messageId, charterGranular }) });
  loadPlanner();
}

async function loadPlanner() {
  const entries = await api('/planner');
  document.querySelector('#plannerTable tbody').innerHTML = entries.map(e => `
    <tr><td>${e.planned_date}</td><td>${e.cohort_name || e.cohort_list_id}</td><td>${e.charter_granular}</td><td>${e.status}</td>
      <td>${e.status === 'planned' ? `<button onclick="deletePlannerEntry(${e.id})">Delete</button>` : ''}</td></tr>
  `).join('');

  const digests = await api('/planner/digests');
  document.getElementById('digestArchive').innerHTML = digests.map(d => `<div class="card">${d.week_start} to ${d.week_end}</div>`).join('') || '<p class="hint">No digests yet - the first Monday run will create one.</p>';
}

async function deletePlannerEntry(id) {
  await api('/planner/' + id, { method: 'DELETE' });
  loadPlanner();
}

// ---------- Init everything after login ----------
async function initAllPages() {
  initCharterCheckboxes();
  initDeepDiveCharterSelect();
  initCharterSelects();
  document.getElementById('budgetCharter').innerHTML += GRANULAR_CHARTERS.map(c => `<option value="${c}">${c}</option>`).join('');
  await loadMessagesIntoSelect();
  await loadTemplatesIntoSelect();
  await loadCohortsIntoSelect();
  await loadCampaignsIntoAssignSelect();
  await loadPlannerMessages();
  await loadPlaybook();
  await loadPlanner();
  await loadDashboard();
  loadCharterFunnel();
  loadBudget();
  searchCampaigns();
}

checkAuth();
