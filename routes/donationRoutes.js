import express from "express";

import {
  createDonation,
  mpesaCallback,
  getDonationStatus,
  queryDonationPayment,
} from "../controllers/donationController.js";

const router = express.Router();

/**
 * POST
 *
 * Start donation / M-PESA STK Push
 */
router.post(
  "/mpesa/stkpush",
  createDonation
);

/**
 * POST
 *
 * Safaricom M-PESA callback
 */
router.post(
  "/mpesa/callback",
  mpesaCallback
);

/**
 * GET
 *
 * Check donation status
 */
router.get(
  "/:id/status",
  getDonationStatus
);

/**
 * GET
 *
 * Query the M-PESA transaction directly.
 */
router.get(
  "/:id/query",
  queryDonationPayment
);

export default router;