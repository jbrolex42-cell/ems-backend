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
 * Start donation / STK Push
 */
router.post(
  "/",
  createDonation
);

/**
 * POST
 *
 * Safaricom M-Pesa callback
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
 * Query the M-Pesa transaction directly.
 */
router.get(
  "/:id/query",
  queryDonationPayment
);

export default router;