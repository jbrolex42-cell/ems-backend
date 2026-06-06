const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: Number(process.env.EMAIL_PORT) === 465, // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error('Email Error:', error);
    throw new Error('Email sending failed');
  }
};

const emailTemplates = {
  welcome: (name) => `
    <div style="font-family: Arial; max-width:600px;">
      <h2>🚑 Welcome to EMS Kenya, ${name}!</h2>
      <p>Your account is now active.</p>
    </div>
  `,

  resetPassword: (name, resetUrl) => `
    <div style="font-family: Arial; max-width:600px;">
      <h2>🔐 Password Reset</h2>
      <p>Hi ${name}, click below to reset your password:</p>
      <a href="${resetUrl}"
         style="background:#FF3B30;color:#fff;padding:12px 20px;display:inline-block;text-decoration:none;">
         Reset Password
      </a>
      <p>This link expires in 30 minutes.</p>
    </div>
  `,

  emergencyAlert: (name, emergencyId, status) => `
    <div style="font-family: Arial; max-width:600px;">
      <h2>🚨 Emergency Update</h2>
      <p>Hi ${name}, Case #${emergencyId}</p>
      <p>Status: <b>${status}</b></p>
    </div>
  `,
};

module.exports = {
  sendEmail,
  emailTemplates,
};