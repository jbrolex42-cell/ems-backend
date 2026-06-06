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

    const user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase().trim(),
      phone,
      password,
      role: assignedRole,
    });

    const token = generateToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    setTokenCookie(res, token);

    Promise.all([
      sendEmail({
        to: user.email,
        subject: 'Welcome to EMS Kenya 🚑',
        html: emailTemplates.welcome(firstName),
      }),
      sendSMS(phone, `Welcome to EMS Kenya, ${firstName}! Emergency: 1514 / 0700 395 395`),
    ]).catch((err) => console.error('Notification error:', err.message));

    res.status(201).json({
      success: true,
      message: 'Account created',
      token,
      refreshToken,
      user: user.toJSON(),
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

/* ================= FORGOT PASSWORD ================= */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.json({
        success: true,
        message: 'If that email exists, a reset link has been sent.',
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');

    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 30 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

    await sendEmail({
      to: user.email,
      subject: '🔐 EMS Kenya Password Reset',
      html: emailTemplates.resetPassword(user.firstName, resetUrl),
    });

    res.json({
      success: true,
      message: 'If that email exists, a reset link has been sent.',
    });
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

    const token = generateToken(user._id, user.role);
    setTokenCookie(res, token);

    res.json({
      success: true,
      message: 'Password reset successful',
    });
  } catch (error) {
    next(error);
  }
};

/* ================= GET ME ================= */
const getMe = async (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
};

/* ================= LOGOUT ================= */
const logout = async (req, res) => {
  res.clearCookie('ems_token');

  res.json({
    success: true,
    message: 'Logged out successfully',
  });
};

/* ================= PLACEHOLDER FUNCTIONS ================= */
const refreshToken = async (req, res) => {
  res.status(200).json({ message: 'Refresh token not implemented yet' });
};

const verifyEmail = async (req, res) => {
  res.status(200).json({ message: 'Email verification not implemented yet' });
};

const registerStaff = async (req, res) => {
  res.status(200).json({ message: 'Staff registration not implemented yet' });
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
  registerStaff,
};