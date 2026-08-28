const express = require("express");

const {
  createDonation,
  mpesaCallback,
  kcbCallback,
  airtelCallback,
  getDonationStatus,
  queryDonationPayment,
  createBankDonation,
} = require("../controllers/donationController");

const router = express.Router();

/*
 * ================================
 * HEALTH / TEST
 * ================================
 */

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Donation routes are working",
  });
});

/*
 * ================================
 * M-PESA
 * ================================
 */

// Start M-PESA payment
router.post("/mpesa", createDonation);

// M-PESA callback
router.post("/mpesa/callback", mpesaCallback);

/*
 * ================================
 * KCB
 * ================================
 */

// Start KCB payment
router.post("/kcb", createDonation);

// KCB callback
router.post("/kcb/callback", kcbCallback);

/*
 * ================================
 * AIRTEL MONEY
 * ================================
 */

// Start Airtel Money payment
router.post("/airtel", createDonation);

// Airtel Money callback
router.post("/airtel/callback", airtelCallback);

/*
 * ================================
 * BANK TRANSFER
 * ================================
 */

// Create bank donation
router.post("/bank", createBankDonation);

/*
 * ================================
 * PAYMENT STATUS
 * ================================
 */

// Get donation status
router.get("/status/:id", getDonationStatus);

/*
 * ================================
 * M-PESA QUERY
 * ================================
 */

// Query M-PESA transaction
router.get("/:id/query", queryDonationPayment);

module.exports = router;