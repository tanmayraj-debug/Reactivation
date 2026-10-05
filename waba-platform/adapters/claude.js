const axios = require('axios');
const config = require('../config/config');
const db = require('../db/db');

function getPlaybook() {
  const row = db.prepare('SELECT content_text FROM content_playbook ORDER BY id DESC LIMIT 1').get();
  return row ? row.content_text : '';
}

async function callClaude(systemPrompt, userPrompt) {
  const res = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: config.anthropic.model,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    },
    {
      headers: {
        'x-api-key': config.anthropic.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );
  const textBlock = (res.data.content || []).find((b) => b.type === 'text');
  return textBlock ? textBlock.text : '';
}

// Draft a WhatsApp message body from a natural-language prompt, informed by
// the stored content playbook (what's worked/not worked historically).
async function draftMessage({ prompt, charter }) {
  const playbook = getPlaybook();
  const system = `You draft WhatsApp marketing/utility message bodies for a WABA campaign tool.
Follow WhatsApp template body constraints: plain text, emojis allowed, no markdown headers, max 1024 characters.
Use {{1}}, {{2}} etc. for variables if the message should be personalized.
${playbook ? `\nHere is what has worked well historically for this business, use it to inform tone and structure:\n${playbook}` : ''}
${charter ? `\nThis message is for the "${charter}" charter/vertical.` : ''}
Respond with ONLY the message body text, nothing else - no preamble, no explanation, no quotes around it.`;

  const draft = await callClaude(system, prompt);
  return draft.trim();
}

// Suggest a send calendar for the month, given a fixed constraint (e.g. only
// 1st/2nd of month) and past campaign performance data as context.
async function suggestCalendar({ constraint, pastCampaignsSummary, charters }) {
  const playbook = getPlaybook();
  const system = `You suggest a monthly WhatsApp campaign send calendar for a marketing team.
The team has a fixed constraint on which day(s) of the month sends can happen: "${constraint}".
Suggest which charter(s) and message theme should go out on each available date this month, based on past performance.
${playbook ? `\nHistorical content learnings:\n${playbook}` : ''}
Charters available: ${(charters || []).join(', ')}
Respond with a short numbered list: date -> charter -> suggested message theme -> one-line reasoning. Nothing else.`;

  const userPrompt = `Past campaign performance summary:\n${pastCampaignsSummary || '(no historical data yet)'}\n\nSuggest this month's calendar.`;
  return (await callClaude(system, userPrompt)).trim();
}

module.exports = { draftMessage, suggestCalendar, getPlaybook };
