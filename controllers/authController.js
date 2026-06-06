const User = require('../models/User');
const crypto = require('crypto');

const { generateToken, generateRefreshToken } = require('../utils/generateToken');
const { sendEmail, emailTemplates } = require('../utils/sendEmail');
const { sendSMS } = require('../utils/smsService');

/* ================= COOKIE HELPER ================= */
const setTokenCookie = (res, token) => {
  res.cookie('ems_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

/* ================= REGISTER ================= */
const register = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, password, role = 'patient' } = req.body;

    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const existing = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { phone }],
    });

    if (existing) {
      return res.status(409).json({ success: false, message: 'User already exists' });
    }

    const allowedRoles = ['patient', 'emt', 'admin'];
    const assignedRole = allowedRoles.includes(role) ? role : 'patient';

    // Generate email verification token
    const rawVerifyToken = crypto.randomBytes(32).toString('hex');
    const hashedVerifyToken = crypto.createHash('sha256').update(rawVerifyToken).digest('hex');

    const user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      phone,
      password,
      role: assignedRole,
      isVerified: false,
      verificationToken: hashedVerifyToken,
    });

    const token = generateToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    setTokenCookie(res, token);

    // Verification link
    const verifyUrl = `${process.env.CLIENT_URL}/verify-email/${rawVerifyToken}`;

    // Role label for email subject
    const roleLabel = assignedRole === 'emt' ? 'EMT' : assignedRole === 'admin' ? 'Admin' : 'Patient';

    // Send verification email + SMS (non-blocking — never fail the registration)
    Promise.all([
      sendEmail({
        to: user.email,
        subject: `Welcome to EMS Kenya 🚑 — Verify Your ${roleLabel} Account`,
        html: emailTemplates.verifyEmail
          ? emailTemplates.verifyEmail(firstName, verifyUrl, roleLabel)
          : `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#f5f5f5;padding:32px;border-radius:12px;">
              <div style="text-align:center;margin-bottom:24px;">
                <div style="display:inline-block;background:#FF3B30;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:18px;letter-spacing:2px;">EMS KENYA</div>
              </div>
              <h2 style="color:#fff;margin-bottom:8px;">Hi ${firstName}, welcome aboard 👋</h2>
              <p style="color:#999;margin-bottom:4px;">You registered as: <strong style="color:#FF3B30;">${roleLabel}</strong></p>
              <p style="color:#999;margin-bottom:24px;">Please verify your email address to activate your account.</p>
              <a href="${verifyUrl}"
                style="display:inline-block;background:#FF3B30;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;margin-bottom:24px;">
                ✅ Verify My Account
              </a>
              <p style="color:#666;font-size:13px;">Or copy this link into your browser:</p>
              <p style="color:#FF3B30;font-size:12px;word-break:break-all;">${verifyUrl}</p>
              <hr style="border-color:#222;margin:24px 0;" />
              <p style="color:#666;font-size:12px;">This link expires in 24 hours. If you did not create this account, ignore this email.</p>
              <p style="color:#666;font-size:12px;">Emergency line: <strong style="color:#fff;">1514</strong> | 0700 395 395</p>
            </div>
          `,
      }),
      sendSMS(
        phone,
        `Welcome to EMS Kenya, ${firstName}! Verify your ${roleLabel} account: ${verifyUrl} | Emergency: 1514`
      ),
    ]).catch((err) => console.error('Registration notification error:', err.message));

    res.status(201).json({
      success: true,
      message: 'Account created. Please check your email to verify your account.',
      token,
      refreshToken,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/* ================= VERIFY EMAIL ================= */
const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Verification token is required' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({ verificationToken: hashedToken });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Verification link is invalid or has already been used',
      });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save({ validateBeforeSave: false });

    // Send a confirmation email after successful verification
    sendEmail({
      to: user.email,
      subject: '✅ EMS Kenya — Account Verified',
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#f5f5f5;padding:32px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="display:inline-block;background:#FF3B30;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:18px;letter-spacing:2px;">EMS KENYA</div>
          </div>
          <h2 style="color:#22C55E;">Account Verified ✅</h2>
          <p style="color:#999;">Hi ${user.firstName}, your <strong style="color:#FF3B30;">${user.role}</strong> account is now fully active.</p>
          <p style="color:#999;">You can now sign in and access all features.</p>
          <a href="${process.env.CLIENT_URL}/login"
            style="display:inline-block;background:#FF3B30;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px;">
            Sign In Now
          </a>
          <hr style="border-color:#222;margin:24px 0;" />
          <p style="color:#666;font-size:12px;">Emergency line: <strong style="color:#fff;">1514</strong> | 0700 395 395</p>
        </div>
      `,
    }).catch((err) => console.error('Verification confirmation email error:', err.message));

    res.json({
      success: true,
      message: 'Email verified successfully. You can now log in.',
    });
  } catch (error) {
    next(error);
  }
};

/* ================= LOGIN ================= */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account deactivated. Contact support.' });
    }

    // Block login if email not verified
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in. Check your inbox for the verification link.',
        unverified: true,
      });
    }

    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = generateToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    setTokenCookie(res, token);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      refreshToken,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/* ================= RESEND VERIFICATION EMAIL ================= */
const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success to prevent email enumeration
    if (!user || user.isVerified) {
      return res.json({
        success: true,
        message: 'If that email exists and is unverified, a new link has been sent.',
      });
    }

    const rawVerifyToken = crypto.randomBytes(32).toString('hex');
    const hashedVerifyToken = crypto.createHash('sha256').update(rawVerifyToken).digest('hex');

    user.verificationToken = hashedVerifyToken;
    await user.save({ validateBeforeSave: false });

    const verifyUrl = `${process.env.CLIENT_URL}/verify-email/${rawVerifyToken}`;
    const roleLabel = user.role === 'emt' ? 'EMT' : user.role === 'admin' ? 'Admin' : 'Patient';

    await sendEmail({
      to: user.email,
      subject: '🔁 EMS Kenya — New Verification Link',
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#f5f5f5;padding:32px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="display:inline-block;background:#FF3B30;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:18px;letter-spacing:2px;">EMS KENYA</div>
          </div>
          <h2 style="color:#fff;">New Verification Link</h2>
          <p style="color:#999;">Hi ${user.firstName}, here is your new verification link for your <strong style="color:#FF3B30;">${roleLabel}</strong> account.</p>
          <a href="${verifyUrl}"
            style="display:inline-block;background:#FF3B30;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;margin:24px 0;">
            ✅ Verify My Account
          </a>
          <p style="color:#666;font-size:13px;">Or copy this link:</p>
          <p style="color:#FF3B30;font-size:12px;word-break:break-all;">${verifyUrl}</p>
          <hr style="border-color:#222;margin:24px 0;" />
          <p style="color:#666;font-size:12px;">This link expires in 24 hours.</p>
        </div>
      `,
    });

    res.json({
      success: true,
      message: 'If that email exists and is unverified, a new link has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

/* ================= FORGOT PASSWORD ================= */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({
        success: true,
        message: 'If that email exists, a reset link has been sent.',
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');

    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 minutes

    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

    try {
      await sendEmail({
        to: user.email,
        subject: '🔐 EMS Kenya — Reset Your Password',
        html: emailTemplates.resetPassword
          ? emailTemplates.resetPassword(user.firstName, resetUrl)
          : `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#f5f5f5;padding:32px;border-radius:12px;">
              <div style="text-align:center;margin-bottom:24px;">
                <div style="display:inline-block;background:#FF3B30;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:18px;letter-spacing:2px;">EMS KENYA</div>
              </div>
              <h2 style="color:#fff;">Password Reset Request 🔐</h2>
              <p style="color:#999;">Hi ${user.firstName}, we received a request to reset your password.</p>
              <p style="color:#999;margin-bottom:24px;">Click the button below. This link expires in <strong style="color:#fff;">30 minutes</strong>.</p>
              <a href="${resetUrl}"
                style="display:inline-block;background:#FF3B30;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;margin-bottom:24px;">
                🔐 Reset My Password
              </a>
              <p style="color:#666;font-size:13px;">Or copy this link into your browser:</p>
              <p style="color:#FF3B30;font-size:12px;word-break:break-all;">${resetUrl}</p>
              <hr style="border-color:#222;margin:24px 0;" />
              <p style="color:#666;font-size:12px;">If you did not request this, ignore this email — your password will not change.</p>
              <p style="color:#666;font-size:12px;">Emergency line: <strong style="color:#fff;">1514</strong> | 0700 395 395</p>
            </div>
          `,
      });

      res.json({
        success: true,
        message: 'If that email exists, a reset link has been sent.',
      });
    } catch (emailError) {
      // Roll back token if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      console.error('Password reset email failed:', emailError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to send reset email. Please try again later.',
      });
    }
  } catch (error) {
    next(error);
  }
};

/* ================= RESET PASSWORD ================= */
const resetPassword = async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
      });
    }

    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Reset link is invalid or expired',
      });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.refreshToken = null;

    await user.save();

    // Notify user that password was changed
    sendEmail({
      to: user.email,
      subject: '✅ EMS Kenya — Password Changed',
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#f5f5f5;padding:32px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="display:inline-block;background:#FF3B30;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:18px;letter-spacing:2px;">EMS KENYA</div>
          </div>
          <h2 style="color:#22C55E;">Password Changed ✅</h2>
          <p style="color:#999;">Hi ${user.firstName}, your password has been successfully updated.</p>
          <p style="color:#999;">If you did not make this change, contact us immediately.</p>
          <a href="${process.env.CLIENT_URL}/login"
            style="display:inline-block;background:#FF3B30;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px;">
            Sign In
          </a>
          <hr style="border-color:#222;margin:24px 0;" />
          <p style="color:#666;font-size:12px;">Emergency line: <strong style="color:#fff;">1514</strong> | 0700 395 395</p>
        </div>
      `,
    }).catch((err) => console.error('Password change email error:', err.message));

    const token = generateToken(user._id, user.role);
    setTokenCookie(res, token);

    res.json({
      success: true,
      message: 'Password reset successful. You can now log in.',
    });
  } catch (error) {
    next(error);
  }
};

/* ================= GET ME ================= */
const getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

/* ================= LOGOUT ================= */
const logout = async (req, res) => {
  res.clearCookie('ems_token');
  res.json({ success: true, message: 'Logged out successfully' });
};

/* ================= REFRESH TOKEN ================= */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Refresh token required' });
    }

    const jwt = require('jsonwebtoken');
    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ success: false, message: 'Refresh token revoked' });
    }

    const newToken = generateToken(user._id, user.role);
    const newRefresh = generateRefreshToken(user._id);

    user.refreshToken = newRefresh;
    await user.save({ validateBeforeSave: false });

    setTokenCookie(res, newToken);

    res.json({ success: true, token: newToken, refreshToken: newRefresh });
  } catch (error) {
    next(error);
  }
};

/* ================= REGISTER STAFF (Admin only) ================= */
const registerStaff = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, password, role } = req.body;

    if (!['emt', 'admin', 'hospital'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid staff role' });
    }

    const existing = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { phone }],
    });

    if (existing) {
      return res.status(409).json({ success: false, message: 'Email or phone already registered' });
    }

    // Staff accounts are pre-verified (created by admin)
    const user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      phone,
      password,
      role,
      isVerified: true,
    });

    const roleLabel = role === 'emt' ? 'EMT' : role.charAt(0).toUpperCase() + role.slice(1);

    sendEmail({
      to: user.email,
      subject: `🚑 EMS Kenya — Your ${roleLabel} Account is Ready`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#f5f5f5;padding:32px;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="display:inline-block;background:#FF3B30;padding:10px 20px;border-radius:8px;font-weight:bold;font-size:18px;letter-spacing:2px;">EMS KENYA</div>
          </div>
          <h2 style="color:#fff;">Welcome to the Team, ${firstName} 👋</h2>
          <p style="color:#999;">Your <strong style="color:#FF3B30;">${roleLabel}</strong> account has been created by an administrator.</p>
          <p style="color:#999;">Your login credentials:</p>
          <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:8px;padding:16px;margin:16px 0;">
            <p style="margin:4px 0;color:#999;">Email: <strong style="color:#fff;">${email}</strong></p>
            <p style="margin:4px 0;color:#999;">Password: <strong style="color:#fff;">${password}</strong></p>
          </div>
          <p style="color:#FF3B30;font-size:13px;">⚠️ Please change your password after first login.</p>
          <a href="${process.env.CLIENT_URL}/login"
            style="display:inline-block;background:#FF3B30;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px;">
            Sign In Now
          </a>
          <hr style="border-color:#222;margin:24px 0;" />
          <p style="color:#666;font-size:12px;">Emergency line: <strong style="color:#fff;">1514</strong> | 0700 395 395</p>
        </div>
      `,
    }).catch((err) => console.error('Staff welcome email error:', err.message));

    res.status(201).json({
      success: true,
      message: `${roleLabel} account created successfully`,
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/* ================= EXPORTS ================= */
module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  getMe,
  logout,
  refreshToken,
  verifyEmail,
  resendVerification,
  registerStaff,
};
