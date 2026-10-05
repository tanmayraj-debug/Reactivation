const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const config = require('../config/config');

function client() {
  return axios.create({
    baseURL: config.timesMobile.baseUrl,
    headers: { Authorization: config.timesMobile.apiKey },
    timeout: 20000,
  });
}

/**
 * ============================================================
 * TEMPLATE MANAGEMENT — confirmed against real Postman collection
 * ============================================================
 */

// List templates, paginated. page_number/page_size can be "" for "all".
async function listTemplates({ pageNumber = '', pageSize = '' } = {}) {
  const res = await client().post('/wa/v1/templates/get-list', {
    page_number: pageNumber,
    page_size: pageSize,
  }, { headers: { 'Content-Type': 'application/json' } });
  return res.data; // { status, message, code, res_json: { data: [...], total } }
}

async function getTemplateByName(templateName) {
  const res = await client().post('/wa/v1/templates/get-template-by-name', {
    template_name: templateName,
  }, { headers: { 'Content-Type': 'application/json' } });
  return res.data;
}

async function getTemplateById(whatsappTemplateId) {
  const res = await client().post('/wa/v1/templates/get-template-by-id', {
    whatsapp_template_id: whatsappTemplateId,
  }, { headers: { 'Content-Type': 'application/json' } });
  return res.data;
}

// Create a template. `components` must already be in TimesMobile's exact
// component-array shape (HEADER/BODY/FOOTER/BUTTONS/LIMITED_TIME_OFFER/CAROUSEL...).
async function createTemplate({ name, language, category, components }) {
  const res = await client().post('/wa/v1/templates/create-template', {
    name,
    language,
    category, // MARKETING | UTILITY | AUTHENTICATION
    components,
  }, { headers: { 'Content-Type': 'application/json' } });
  return res.data; // { status, message, code, res_json: { ..., status: "submitted" } }
}

// Upload media for a template header (image/video/document). Returns a
// file_handler to reference in create-template's header example.header_handle.
async function uploadTemplateMedia(filePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  const res = await axios.post(
    `${config.timesMobile.baseUrl}/wa/v1/templates/resumable-upload-template`,
    form,
    { headers: { Authorization: config.timesMobile.apiKey, ...form.getHeaders() } }
  );
  return res.data; // { status, message, code, res_json: { file_handler, file_url } }
}

/**
 * ============================================================
 * SEND MESSAGE — single endpoint, one recipient per call.
 * There is no bulk/campaign object in this API: our backend loops
 * through the cohort and calls this once per recipient.
 * ============================================================
 */

// Send an already-approved template message to one recipient.
// `components` follows the send-time parameter shape (type/text/image/etc),
// distinct from the create-template component shape.
async function sendTemplateMessage({ to, templateName, languageCode = 'en', components = [] }) {
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  };
  const res = await client().post('', body, { headers: { 'Content-Type': 'application/json' } });
  return res.data; // async: { ct_trace_id, status, message } — final result comes via webhook
}

async function sendTextMessage({ to, body }) {
  const res = await client().post('', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body },
  }, { headers: { 'Content-Type': 'application/json' } });
  return res.data;
}

module.exports = {
  listTemplates,
  getTemplateByName,
  getTemplateById,
  createTemplate,
  uploadTemplateMedia,
  sendTemplateMessage,
  sendTextMessage,
};
