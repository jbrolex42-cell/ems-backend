const express = require('express');
const router = express.Router();
const {
  register, login, getMe, logout, refreshToken,
  forgotPassword, resetPassword, verifyEmail,
  resendVerification, registerStaff
} = require('../controllers/authController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/register',                register);
router.post('/login',                   login);
router.post('/forgot-password',         forgotPassword);
router.post('/reset-password/:token',   resetPassword);
router.post('/refresh-token',           refreshToken);

// ✅ Email verification routes
router.get('/verify/:token',            verifyEmail);
router.post('/resend-verification',     resendVerification);

// Protected
router.get('/me',     protect, getMe);
router.post('/logout', protect, logout);

// Admin only — register staff (EMT, admin)
router.post('/register-staff', protect, authorize('admin', 'superadmin'), registerStaff);

module.exports = router;
