const nodemailer = require('nodemailer');
const config = require('../config/config');

function getTransport() {
  if (!config.email.host) return null;
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: config.email.user ? { user: config.email.user, pass: config.email.pass } : undefined,
  });
}

async function sendEmail({ to, subject, html, text }) {
  const transport = getTransport();
  if (!transport) {
    console.warn('SMTP not configured (.env) - email not sent:', subject);
    return { sent: false, reason: 'SMTP not configured' };
  }
  await transport.sendMail({ from: config.email.from, to, subject, html, text });
  return { sent: true };
}

module.exports = { sendEmail };
