const express = require('express');
const router = express.Router();
const {
  register, login, getMe, logout, refreshToken,
  forgotPassword, resetPassword, verifyEmail,
  resendVerification, registerStaff
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');
const User = require('../models/User');

router.post('/register',                register);
router.post('/login',                   login);
router.post('/forgot-password',         forgotPassword);
router.post('/reset-password/:token',   resetPassword);
router.post('/refresh-token',           refreshToken);

// ✅ Email verification routes
router.get('/verify/:token',            verifyEmail);
router.post('/resend-verification',     resendVerification);

// Protected
router.get('/me',      protect, getMe);
router.post('/logout', protect, logout);

// Admin only — register staff (EMT, admin)
router.post('/register-staff', protect, authorize('admin', 'superadmin'), registerStaff);

// 📱 Mobile app — save Expo push token for notifications
router.post('/push-token', protect, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Push token is required' });
    }
    await User.findByIdAndUpdate(req.user._id, { expoPushToken: token });
    res.json({ success: true, message: 'Push token saved' });
  } catch (e) {
    res.status(500).json({ message: 'Failed to save push token' });
  }
});

module.exports = router;
