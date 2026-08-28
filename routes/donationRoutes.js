const express = require('express');

const {
  createDonation,
  mpesaCallback,
  getDonationStatus,
  queryDonationPayment,
} = require('../controllers/donationController');

const router = express.Router();

// Test
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Donation routes are working'
  });
});

// M-PESA STK Push
router.post('/mpesa/stkpush', createDonation);

// Safaricom M-PESA callback
router.post('/mpesa/callback', mpesaCallback);

// Check donation status
router.get('/status/:id', getDonationStatus);

// Query M-PESA transaction
router.get('/:id/query', queryDonationPayment);

module.exports = router;