const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_PORT == 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async ({ to, subject, html }) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  };

  await transporter.sendMail(mailOptions);
};

const emailTemplates = {
  welcome: (name) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; padding: 40px; border-radius: 12px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #FF3B30; font-size: 28px; margin: 0;">🚑 EMS Kenya</h1>
        <p style="color: #999; margin-top: 5px;">Emergency Medical System</p>
      </div>

      <h2 style="color: #fff;">Welcome, ${name}!</h2>

      <p style="color: #ccc; line-height: 1.6;">
        Your account has been created. You now have access to Kenya's emergency response network.
        Help is just one tap away — 24/7, across all 47 counties.
      </p>

      <div style="background: #1a1a1a; border: 1px solid #333; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="color: #FF3B30; font-weight: bold; margin: 0;">
          Emergency Line: 0700 395 395
        </p>
      </div>

      <p style="color: #666; font-size: 12px; margin-top: 30px;">
        EMS Kenya — Emergency Medical Services Platform.
      </p>
    </div>
  `,

  resetPassword: (name, resetUrl) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; padding: 40px; border-radius: 12px;">
      <h1 style="color: #FF3B30;">🔐 Password Reset</h1>

      <p style="color: #ccc;">
        Hi ${name}, you requested a password reset.
      </p>

      <a
        href="${resetUrl}"
        style="display: inline-block; background: #FF3B30; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; margin: 20px 0; font-weight: bold;"
      >
        Reset My Password
      </a>

      <p style="color: #666; font-size: 12px;">
        This link expires in 30 minutes. If you didn't request this, ignore this email.
      </p>
    </div>
  `,

  emergencyAlert: (name, emergencyId, status) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; padding: 40px; border-radius: 12px;">
      <h1 style="color: #FF3B30;">🚨 Emergency Update</h1>

      <p style="color: #ccc;">
        Hi ${name}, your emergency request
        <strong>#${emergencyId}</strong> has been updated.
      </p>

      <div style="background: #1a1a1a; padding: 20px; border-radius: 8px; border-left: 4px solid #FF3B30;">
        <p style="color: #fff; margin: 0; font-size: 18px; font-weight: bold;">
          Status: ${status.toUpperCase()}
        </p>
      </div>
    </div>
  `,
};

module.exports = {
  sendEmail,
  emailTemplates,
};
