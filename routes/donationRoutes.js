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
 * Health/test endpoint.
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

router.post(
  "/mpesa/stkpush",
  createDonation
);

router.post(
  "/mpesa/callback",
  mpesaCallback
);

/*
 * ================================
 * KCB
 * ================================
 */

router.post(
  "/kcb/pay",
  createDonation
);

router.post(
  "/kcb/callback",
  kcbCallback
);

/*
 * ================================
 * AIRTEL MONEY
 * ================================
 */

router.post(
  "/airtel/pay",
  createDonation
);

router.post(
  "/airtel/callback",
  airtelCallback
);

/*
 * ================================
 * BANK TRANSFER
 * ================================
 */

router.post(
  "/bank",
  createBankDonation
);

/*
 * ================================
 * PAYMENT STATUS
 * ================================
 */

router.get(
  "/status/:id",
  getDonationStatus
);

/*
 * ================================
 * M-PESA QUERY
 * ================================
 */

router.get(
  "/:id/query",
  queryDonationPayment
);

module.exports = router;