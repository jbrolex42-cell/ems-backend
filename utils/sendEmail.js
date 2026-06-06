// ── Validate env vars on startup
const requiredEnv = ['BREVO_API_KEY', 'EMAIL_FROM', 'CLIENT_URL'];
requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌ Missing env variable: ${key}`);
  }
});

/**
 * Send an email via Brevo HTTP API (no SMTP — works on Render free tier)
 */
const sendEmail = async ({ to, subject, html }) => {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Accept':       'application/json',
      'Content-Type': 'application/json',
      'api-key':      process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender:      { name: 'EMS Kenya 🚑', email: process.env.EMAIL_FROM },
      to:          [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const message = err.message || response.statusText;
    console.error(`❌ Email failed to ${to}:`, message);
    throw new Error('Email sending failed: ' + message);
  }

  const data = await response.json();
  console.log(`✅ Email sent to ${to} — Message ID: ${data.messageId}`);
  return data;
};

const emailTemplates = {
  welcome: (name) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#111;color:#f5f5f5;padding:32px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;background:#FF3B30;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:18px;letter-spacing:2px;">EMS KENYA</div>
      </div>
      <h2 style="color:#fff;">Welcome, ${name} 👋</h2>
      <p style="color:#999;">Your account is active. Please verify your email to get started.</p>
      <hr style="border-color:#222;margin:24px 0;" />
      <p style="color:#666;font-size:12px;">Emergency line: <strong style="color:#fff;">1514</strong> | 0700 395 395</p>
    </div>
  `,

  verifyEmail: (name, verifyUrl, roleLabel) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#111;color:#f5f5f5;padding:32px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;background:#FF3B30;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:18px;letter-spacing:2px;">EMS KENYA</div>
      </div>
      <h2 style="color:#fff;">Hi ${name}, verify your account ✅</h2>
      <p style="color:#999;margin-bottom:4px;">You registered as: <strong style="color:#FF3B30;">${roleLabel}</strong></p>
      <p style="color:#999;margin-bottom:24px;">Click the button below to activate your account.</p>
      <a href="${verifyUrl}" style="display:inline-block;background:#FF3B30;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
        ✅ Verify My Account
      </a>
      <p style="color:#666;font-size:13px;margin-top:24px;">Or copy this link:</p>
      <p style="color:#FF3B30;font-size:12px;word-break:break-all;">${verifyUrl}</p>
      <hr style="border-color:#222;margin:24px 0;" />
      <p style="color:#666;font-size:12px;">This link expires in 24 hours. If you did not register, ignore this email.</p>
    </div>
  `,

  resetPassword: (name, resetUrl) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#111;color:#f5f5f5;padding:32px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;background:#FF3B30;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:18px;letter-spacing:2px;">EMS KENYA</div>
      </div>
      <h2 style="color:#fff;">Password Reset Request 🔐</h2>
      <p style="color:#999;">Hi ${name}, we received a request to reset your password.</p>
      <p style="color:#999;margin-bottom:24px;">This link expires in <strong style="color:#fff;">30 minutes</strong>.</p>
      <a href="${resetUrl}" style="display:inline-block;background:#FF3B30;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
        🔐 Reset My Password
      </a>
      <p style="color:#666;font-size:13px;margin-top:24px;">Or copy this link:</p>
      <p style="color:#FF3B30;font-size:12px;word-break:break-all;">${resetUrl}</p>
      <hr style="border-color:#222;margin:24px 0;" />
      <p style="color:#666;font-size:12px;">If you did not request this, ignore this email — your password will not change.</p>
      <p style="color:#666;font-size:12px;">Emergency line: <strong style="color:#fff;">1514</strong> | 0700 395 395</p>
    </div>
  `,

  emergencyAlert: (name, emergencyId, status) => `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#111;color:#f5f5f5;padding:32px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;background:#FF3B30;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:18px;letter-spacing:2px;">EMS KENYA</div>
      </div>
      <h2 style="color:#FF3B30;">🚨 Emergency Update</h2>
      <p style="color:#999;">Hi ${name},</p>
      <p style="color:#999;">Case <strong style="color:#fff;">#${emergencyId}</strong> status: <strong style="color:#FF3B30;">${status}</strong></p>
      <hr style="border-color:#222;margin:24px 0;" />
      <p style="color:#666;font-size:12px;">Emergency line: <strong style="color:#fff;">1514</strong> | 0700 395 395</p>
    </div>
  `,
};

module.exports = { sendEmail, emailTemplates };
