const User = require('../models/User');
const crypto = require('crypto');
const { generateToken, generateRefreshToken } = require('../utils/generateToken');
const { sendEmail, emailTemplates } = require('../utils/sendEmail');
const { sendSMS } = require('../utils/smsService');

const setTokenCookie = (res, token) => {
  res.cookie('ems_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
};

// @route POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, password, role = 'patient' } = req.body;
    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone }] });
    if (existing) {
      const field = existing.email === email.toLowerCase() ? 'Email' : 'Phone number';
      return res.status(409).json({ success: false, message: `${field} already registered` });
    }
    // ✅ FIXED: respect the role from the form — patient, emt, admin allowed; superadmin blocked
    const allowedRoles = ['patient', 'emt', 'admin'];
    const assignedRole = allowedRoles.includes(role) ? role : 'patient';
    const user = await User.create({ firstName, lastName, email: email.toLowerCase().trim(), phone, password, role: assignedRole });
    const token = generateToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    setTokenCookie(res, token);
    Promise.all([
      sendEmail({ to: email, subject: 'Welcome to EMS Kenya 🚑', html: emailTemplates.welcome(firstName) }),
      sendSMS(phone, `Welcome to EMS Kenya, ${firstName}! Account active. Emergency: 0700 395 395 | Toll Free: 1514`)
    ]).catch(e => console.error('Welcome notification failed:', e.message));
    res.status(201).json({ success: true, message: 'Account created', token, refreshToken, user: user.toJSON() });
  } catch (error) { next(error); }
};

// @route POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required' });
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (!user.isActive) return res.status(403).json({ success: false, message: 'Account deactivated. Contact support.' });
    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const token = generateToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    setTokenCookie(res, token);
    res.json({ success: true, message: 'Login successful', token, refreshToken, user: user.toJSON() });
  } catch (error) { next(error); }
};

// @route GET /api/auth/me
const getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// @route POST /api/auth/logout
const logout = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
    res.clearCookie('ems_token');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) { next(error); }
};

// @route POST /api/auth/refresh-token
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) return res.status(401).json({ success: false, message: 'Refresh token required' });
    const jwt = require('jsonwebtoken');
    let decoded;
    try { decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET); }
    catch { return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' }); }
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== token) return res.status(401).json({ success: false, message: 'Refresh token revoked' });
    const newToken = generateToken(user._id, user.role);
    const newRefresh = generateRefreshToken(user._id);
    user.refreshToken = newRefresh;
    await user.save({ validateBeforeSave: false });
    setTokenCookie(res, newToken);
    res.json({ success: true, token: newToken, refreshToken: newRefresh });
  } catch (error) { next(error); }
};

// @route POST /api/auth/forgot-password
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 30 * 60 * 1000;
    await user.save({ validateBeforeSave: false });
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    try {
      await sendEmail({ to: user.email, subject: '🔐 EMS Kenya — Password Reset', html: emailTemplates.resetPassword(user.firstName, resetUrl) });
    } catch {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ success: false, message: 'Email could not be sent. Try again.' });
    }
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (error) { next(error); }
};

// @route POST /api/auth/reset-password/:token
const resetPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({ resetPasswordToken: hashedToken, resetPasswordExpire: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired' });
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.refreshToken = null;
    await user.save();
    const token = generateToken(user._id, user.role);
    setTokenCookie(res, token);
    res.json({ success: true, message: 'Password reset successful', token });
  } catch (error) { next(error); }
};

// @route GET /api/auth/verify/:token
const verifyEmail = async (req, res, next) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({ verificationToken: hashedToken });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid verification link' });
    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) { next(error); }
};

// @route POST /api/auth/register-staff  (admin only)
const registerStaff = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, password, role } = req.body;
    if (!['emt','admin','hospital'].includes(role)) return res.status(400).json({ success: false, message: 'Invalid staff role' });
    const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone }] });
    if (existing) return res.status(409).json({ success: false, message: 'Email or phone already registered' });
    const user = await User.create({ firstName, lastName, email: email.toLowerCase().trim(), phone, password, role, isVerified: true });
    sendEmail({ to: email, subject: `EMS Kenya Staff Account (${role.toUpperCase()})`, html: emailTemplates.welcome(firstName) }).catch(console.error);
    res.status(201).json({ success: true, message: `${role} account created`, user: user.toJSON() });
  } catch (error) { next(error); }
};

module.exports = { register, login, getMe, logout, refreshToken, forgotPassword, resetPassword, verifyEmail, registerStaff };
