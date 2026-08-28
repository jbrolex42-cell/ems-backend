import Donation from "../models/Donation.js";

import {
  initiateSTKPush,
  querySTKPush,
} from "../services/mpesaService.js";

/**
 * Normalize Kenyan phone numbers.
 *
 * 0712345678
 * 0112345678
 * 254712345678
 * +254712345678
 *
 * become:
 *
 * 254712345678
 */
function normalizePhone(phone) {
  let value = String(phone || "")
    .trim()
    .replace(/\s+/g, "");

  if (value.startsWith("+254")) {
    value = value.substring(1);
  }

  if (value.startsWith("0")) {
    value = `254${value.substring(1)}`;
  }

  return value;
}

/**
 * Start an M-Pesa donation.
 */
export async function createDonation(req, res) {
  try {
    const {
      name,
      email,
      phone,
      amount,
      purpose,
    } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required.",
      });
    }

    const donationAmount = Number(amount);

    if (
      !Number.isFinite(donationAmount) ||
      donationAmount < 10
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Donation amount must be at least KSh 10.",
      });
    }

    const normalizedPhone = normalizePhone(phone);

    if (
      !/^254(7|1)\d{8}$/.test(normalizedPhone)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid Kenyan M-Pesa phone number.",
      });
    }

    /**
     * Create our database record BEFORE sending
     * the STK Push.
     */
    const donation = await Donation.create({
      donorName:
        name?.trim() || "Anonymous",

      email:
        email?.trim() || "",

      phone: normalizedPhone,

      amount: donationAmount,

      purpose:
        purpose?.trim() ||
        "Emergency Response",

      paymentMethod: "mpesa",

      status: "processing",
    });

    /**
     * IMPORTANT:
     *
     * This is the account/reference that identifies
     * the donation.
     *
     * Your PayBill itself is configured in:
     *
     * MPESA_SHORTCODE
     *
     * Your account/reference is:
     *
     * 1296571637
     */
    const accountReference =
      process.env.MPESA_ACCOUNT_REFERENCE ||
      "1296571637";

    const mpesaResponse =
      await initiateSTKPush({
        phone: normalizedPhone,

        amount: donationAmount,

        accountReference,

        transactionDesc:
          "EMS Kenya Donation",
      });

    donation.merchantRequestId =
      mpesaResponse.MerchantRequestID || "";

    donation.checkoutRequestId =
      mpesaResponse.CheckoutRequestID || "";

    if (
      String(mpesaResponse.ResponseCode) === "0"
    ) {
      donation.status = "processing";
    } else {
      donation.status = "failed";
    }

    donation.resultDescription =
      mpesaResponse.ResponseDescription || "";

    await donation.save();

    return res.status(200).json({
      success:
        String(mpesaResponse.ResponseCode) === "0",

      message:
        mpesaResponse.CustomerMessage ||
        mpesaResponse.ResponseDescription ||
        "M-Pesa request submitted.",

      donationId: donation._id,

      checkoutRequestId:
        donation.checkoutRequestId,

      merchantRequestId:
        donation.merchantRequestId,

      status: donation.status,
    });
  } catch (error) {
    console.error(
      "CREATE DONATION ERROR:",
      error.response?.data ||
        error.message
    );

    return res.status(500).json({
      success: false,
      message:
        error.response?.data?.errorMessage ||
        error.message ||
        "Unable to initiate M-Pesa payment.",
    });
  }
}

/**
 * M-Pesa callback.
 */
export async function mpesaCallback(req, res) {
  try {
    console.log(
      "M-PESA CALLBACK:",
      JSON.stringify(req.body, null, 2)
    );

    const stkCallback =
      req.body?.Body?.stkCallback;

    if (!stkCallback) {
      return res.json({
        ResultCode: 0,
        ResultDesc: "Accepted",
      });
    }

    const checkoutRequestId =
      stkCallback.CheckoutRequestID;

    const resultCode =
      String(stkCallback.ResultCode);

    const resultDesc =
      stkCallback.ResultDesc || "";

    const donation =
      await Donation.findOne({
        checkoutRequestId,
      });

    if (!donation) {
      console.warn(
        "Donation not found for CheckoutRequestID:",
        checkoutRequestId
      );

      return res.json({
        ResultCode: 0,
        ResultDesc: "Accepted",
      });
    }

    donation.callbackReceived = true;

    donation.resultCode = resultCode;

    donation.resultDescription =
      resultDesc;

    donation.callbackData =
      stkCallback;

    /**
     * ResultCode 0 = successful payment.
     */
    if (resultCode === "0") {
      const metadata =
        stkCallback.CallbackMetadata?.Item ||
        [];

      const getMetadata = (name) =>
        metadata.find(
          (item) => item.Name === name
        )?.Value;

      donation.mpesaReceiptNumber =
        getMetadata(
          "MpesaReceiptNumber"
        ) || "";

      donation.transactionDate =
        String(
          getMetadata(
            "TransactionDate"
          ) || ""
        );

      donation.status = "completed";
    } else {
      donation.status =
        resultCode === "1032"
          ? "cancelled"
          : "failed";
    }

    await donation.save();

    return res.json({
      ResultCode: 0,
      ResultDesc: "Accepted",
    });
  } catch (error) {
    console.error(
      "M-PESA CALLBACK ERROR:",
      error.message
    );

    /**
     * Always acknowledge Safaricom's callback.
     */
    return res.json({
      ResultCode: 0,
      ResultDesc: "Accepted",
    });
  }
}

/**
 * Get donation status.
 */
export async function getDonationStatus(
  req,
  res
) {
  try {
    const { id } = req.params;

    const donation =
      await Donation.findById(id).select(
        "-callbackData"
      );

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: "Donation not found.",
      });
    }

    return res.json({
      success: true,

      donation: {
        id: donation._id,

        amount: donation.amount,

        status: donation.status,

        paymentMethod:
          donation.paymentMethod,

        mpesaReceiptNumber:
          donation.mpesaReceiptNumber,

        resultDescription:
          donation.resultDescription,

        createdAt:
          donation.createdAt,

        updatedAt:
          donation.updatedAt,
      },
    });
  } catch (error) {
    console.error(
      "GET DONATION STATUS ERROR:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve donation status.",
    });
  }
}

/**
 * Query M-Pesa directly if needed.
 */
export async function queryDonationPayment(
  req,
  res
) {
  try {
    const { id } = req.params;

    const donation =
      await Donation.findById(id);

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: "Donation not found.",
      });
    }

    if (!donation.checkoutRequestId) {
      return res.status(400).json({
        success: false,
        message:
          "This donation has no CheckoutRequestID.",
      });
    }

    const result =
      await querySTKPush(
        donation.checkoutRequestId
      );

    const resultCode =
      String(result.ResultCode ?? "");

    if (resultCode === "0") {
      donation.status = "completed";
    } else if (resultCode === "1032") {
      donation.status = "cancelled";
    } else if (resultCode) {
      donation.status = "failed";
    }

    donation.resultCode = resultCode;

    donation.resultDescription =
      result.ResultDesc || "";

    await donation.save();

    return res.json({
      success: true,

      mpesa: result,

      donationStatus:
        donation.status,
    });
  } catch (error) {
    console.error(
      "QUERY DONATION ERROR:",
      error.response?.data ||
        error.message
    );

    return res.status(500).json({
      success: false,
      message:
        error.response?.data?.errorMessage ||
        error.message ||
        "Unable to query M-Pesa transaction.",
    });
  }
}