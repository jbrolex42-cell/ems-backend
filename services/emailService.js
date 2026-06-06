// ──────────────────────────────────────────────────────────────
// emailService.js — re-exports from sendEmail.js
// This file is kept for backward compatibility.
// All email logic lives in utils/sendEmail.js
// ──────────────────────────────────────────────────────────────
const { sendEmail, emailTemplates } = require('./sendEmail'); // adjust path if needed

module.exports = { sendEmail, emailTemplates };
