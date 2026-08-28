const Donation = require("../models/Donation");

const {
  initiateSTKPush,
  querySTKPush,
} = require("../services/mpesaService");

const {
  initiateKcbPayment,
} = require("../services/kcbService");

const {
  initiateAirtelPayment,
} = require("../services/airtelService");


/* =========================================================
   PHONE NUMBER
========================================================= */

function normalizePhone(phone) {
  let value = String(phone || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

  if (value.startsWith("+254")) {
    value = value.substring(1);
  }

  if (value.startsWith("0")) {
    value = `254${value.substring(1)}`;
  }

  return value;
}


/* =========================================================
   AMOUNT
========================================================= */

function validateAmount(amount) {
  const value = Number(amount);

  if (!Number.isFinite(value) || value < 10) {
    return null;
  }

  return Math.round(value);
}


/* =========================================================
   ERROR MESSAGE
========================================================= */

function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.errorMessage ||
    error?.response?.data?.error_description ||
    error?.response?.data?.ResponseDescription ||
    error?.message ||
    fallback
  );
}


/* =========================================================
   ADMIN SOCKET NOTIFICATION
========================================================= */

function emitDonationUpdate(req, donation) {
  try {
    const io = req.app.get("io");

    if (!io) {
      return;
    }

    const payload = {
      id: donation._id,
      donorName: donation.donorName,
      email: donation.email,
      phone: donation.phone,
      amount: donation.amount,
      purpose: donation.purpose,
      paymentMethod: donation.paymentMethod,
      status: donation.status,

      reference:
        donation.kcbReference ||
        donation.airtelReference ||
        donation.mpesaReceiptNumber ||
        donation.bankReference ||
        donation.checkoutRequestId ||
        donation.paymentReference ||
        String(donation._id),

      mpesaReceiptNumber:
        donation.mpesaReceiptNumber || "",

      createdAt: donation.createdAt,
      updatedAt: donation.updatedAt,
    };

    // Send to all connected admins.
    io.to("admin_room").emit(
      "donation_updated",
      payload
    );

    // Also emit globally for compatibility.
    io.emit("donation_updated", payload);

    console.log(
      "ADMIN DONATION SOCKET EVENT:",
      donation._id.toString(),
      donation.status
    );
  } catch (error) {
    console.error(
      "DONATION SOCKET ERROR:",
      error.message
    );
  }
}


/* =========================================================
   CREATE DONATION RECORD
========================================================= */

async function createDonationRecord({
  name,
  email,
  phone,
  amount,
  purpose,
  paymentMethod,
}) {
  return Donation.create({
    donorName:
      String(name || "Anonymous").trim() ||
      "Anonymous",

    email:
      String(email || "").trim().toLowerCase(),

    phone: normalizePhone(phone),

    amount,

    purpose:
      String(
        purpose || "Emergency Response"
      ).trim() ||
      "Emergency Response",

    paymentMethod,

    status: "processing",
  });
}


/* =========================================================
   DONATION RESPONSE
========================================================= */

function donationResponse(donation) {
  return {
    id: donation._id,

    donorName: donation.donorName,

    email: donation.email,

    phone: donation.phone,

    amount: donation.amount,

    purpose: donation.purpose,

    status: donation.status,

    paymentMethod:
      donation.paymentMethod,

    reference:
      donation.kcbReference ||
      donation.airtelReference ||
      donation.mpesaReceiptNumber ||
      donation.bankReference ||
      donation.checkoutRequestId ||
      donation.paymentReference ||
      String(donation._id),

    paymentReference:
      donation.paymentReference || "",

    mpesaReceiptNumber:
      donation.mpesaReceiptNumber || "",

    kcbReference:
      donation.kcbReference || "",

    kcbTransactionId:
      donation.kcbTransactionId || "",

    airtelReference:
      donation.airtelReference || "",

    airtelTransactionId:
      donation.airtelTransactionId || "",

    bankReference:
      donation.bankReference || "",

    callbackReceived:
      donation.callbackReceived,

    resultCode:
      donation.resultCode || "",

    resultDescription:
      donation.resultDescription || "",

    createdAt:
      donation.createdAt,

    updatedAt:
      donation.updatedAt,
  };
}


/* =========================================================
   CREATE DONATION
   POST /api/donations
========================================================= */

async function createDonation(req, res) {
  try {
    const {
      name,
      email,
      phone,
      amount,
      purpose,
      paymentMethod = "mpesa",
    } = req.body || {};

    const donationAmount =
      validateAmount(amount);

    if (!donationAmount) {
      return res.status(400).json({
        success: false,
        message:
          "Donation amount must be at least KSh 10.",
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message:
          "Phone number is required.",
      });
    }

    const normalizedPhone =
      normalizePhone(phone);

    if (!/^254(7|1)\d{8}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid Kenyan phone number.",
      });
    }

    const method =
      String(paymentMethod)
        .toLowerCase()
        .trim();

    const supportedMethods = [
      "mpesa",
      "kcb",
      "airtel",
      "bank",
    ];

    if (!supportedMethods.includes(method)) {
      return res.status(400).json({
        success: false,
        message:
          "Unsupported payment method.",
      });
    }


    /* =====================================================
       M-PESA
    ===================================================== */

    if (method === "mpesa") {
      const donation =
        await createDonationRecord({
          name,
          email,
          phone: normalizedPhone,
          amount: donationAmount,
          purpose,
          paymentMethod: "mpesa",
        });

      try {
        const accountReference =
          process.env.MPESA_ACCOUNT_REFERENCE ||
          "EMS-KENYA";

        const mpesaResponse =
          await initiateSTKPush({
            phone: normalizedPhone,
            amount: donationAmount,
            accountReference,
            transactionDesc:
              "EMS Kenya Donation",
          });

        donation.merchantRequestId =
          mpesaResponse?.MerchantRequestID ||
          "";

        donation.checkoutRequestId =
          mpesaResponse?.CheckoutRequestID ||
          "";

        donation.paymentReference =
          donation.checkoutRequestId;

        donation.providerResponse =
          mpesaResponse;

        donation.resultDescription =
          mpesaResponse?.ResponseDescription ||
          mpesaResponse?.CustomerMessage ||
          "";

        donation.status =
          String(
            mpesaResponse?.ResponseCode
          ) === "0"
            ? "processing"
            : "failed";

        await donation.save();

        emitDonationUpdate(req, donation);

        return res.status(200).json({
          success:
            donation.status !== "failed",

          message:
            mpesaResponse?.CustomerMessage ||
            mpesaResponse?.ResponseDescription ||
            "M-PESA payment request submitted.",

          paymentMethod: "mpesa",

          donation:
            donationResponse(donation),

          donationId:
            donation._id,

          checkoutRequestId:
            donation.checkoutRequestId,

          merchantRequestId:
            donation.merchantRequestId,

          status:
            donation.status,
        });
      } catch (error) {
        donation.status = "failed";

        donation.resultDescription =
          getErrorMessage(
            error,
            "Unable to initiate M-PESA payment."
          );

        donation.providerResponse =
          error?.response?.data || null;

        await donation.save();

        emitDonationUpdate(req, donation);

        console.error(
          "M-PESA INITIATION ERROR:",
          error?.response?.data ||
            error.message
        );

        return res.status(502).json({
          success: false,

          message:
            donation.resultDescription,

          donationId:
            donation._id,
        });
      }
    }


    /* =====================================================
       KCB
    ===================================================== */

    if (method === "kcb") {
      const donation =
        await createDonationRecord({
          name,
          email,
          phone: normalizedPhone,
          amount: donationAmount,
          purpose,
          paymentMethod: "kcb",
        });

      try {
        const kcbResponse =
          await initiateKcbPayment({
            phone: normalizedPhone,
            amount: donationAmount,
            reference:
              String(donation._id),
            description:
              "EMS Kenya Donation",
          });

        donation.kcbTransactionId =
          kcbResponse?.transactionId ||
          kcbResponse?.TransactionId ||
          kcbResponse?.requestId ||
          kcbResponse?.RequestId ||
          "";

        donation.kcbReference =
          kcbResponse?.reference ||
          kcbResponse?.Reference ||
          "";

        donation.paymentReference =
          donation.kcbReference ||
          donation.kcbTransactionId ||
          String(donation._id);

        donation.providerResponse =
          kcbResponse;

        donation.resultDescription =
          kcbResponse?.message ||
          kcbResponse?.ResponseDescription ||
          "";

        donation.status =
          kcbResponse?.success === false
            ? "failed"
            : "processing";

        await donation.save();

        emitDonationUpdate(req, donation);

        return res.status(200).json({
          success:
            donation.status !== "failed",

          message:
            kcbResponse?.message ||
            "KCB payment request submitted.",

          paymentMethod: "kcb",

          donation:
            donationResponse(donation),

          donationId:
            donation._id,

          reference:
            donation.paymentReference,

          status:
            donation.status,
        });
      } catch (error) {
        donation.status = "failed";

        donation.resultDescription =
          getErrorMessage(
            error,
            "Unable to initiate KCB payment."
          );

        donation.providerResponse =
          error?.response?.data || null;

        await donation.save();

        emitDonationUpdate(req, donation);

        console.error(
          "KCB INITIATION ERROR:",
          error?.response?.data ||
            error.message
        );

        return res.status(502).json({
          success: false,

          message:
            donation.resultDescription,

          donationId:
            donation._id,
        });
      }
    }


    /* =====================================================
       AIRTEL MONEY
    ===================================================== */

    if (method === "airtel") {
      const donation =
        await createDonationRecord({
          name,
          email,
          phone: normalizedPhone,
          amount: donationAmount,
          purpose,
          paymentMethod: "airtel",
        });

      try {
        const airtelResponse =
          await initiateAirtelPayment({
            phone: normalizedPhone,
            amount: donationAmount,
            reference:
              String(donation._id),
            description:
              "EMS Kenya Donation",
          });

        donation.airtelTransactionId =
          airtelResponse?.transactionId ||
          airtelResponse?.transaction?.id ||
          airtelResponse?.id ||
          airtelResponse?.data?.transactionId ||
          "";

        donation.airtelReference =
          airtelResponse?.reference ||
          airtelResponse?.transaction?.reference ||
          airtelResponse?.data?.reference ||
          "";

        donation.paymentReference =
          donation.airtelReference ||
          donation.airtelTransactionId ||
          String(donation._id);

        donation.providerResponse =
          airtelResponse;

        donation.resultDescription =
          airtelResponse?.message ||
          airtelResponse?.statusMessage ||
          airtelResponse?.data?.message ||
          "";

        donation.status =
          airtelResponse?.success === false
            ? "failed"
            : "processing";

        await donation.save();

        emitDonationUpdate(req, donation);

        return res.status(200).json({
          success:
            donation.status !== "failed",

          message:
            airtelResponse?.message ||
            "Airtel Money payment request submitted.",

          paymentMethod: "airtel",

          donation:
            donationResponse(donation),

          donationId:
            donation._id,

          reference:
            donation.paymentReference,

          status:
            donation.status,
        });
      } catch (error) {
        donation.status = "failed";

        donation.resultDescription =
          getErrorMessage(
            error,
            "Unable to initiate Airtel Money payment."
          );

        donation.providerResponse =
          error?.response?.data || null;

        await donation.save();

        emitDonationUpdate(req, donation);

        console.error(
          "AIRTEL INITIATION ERROR:",
          error?.response?.data ||
            error.message
        );

        return res.status(502).json({
          success: false,

          message:
            donation.resultDescription,

          donationId:
            donation._id,
        });
      }
    }


    /* =====================================================
       BANK
    ===================================================== */

    if (method === "bank") {
      return createBankDonation(req, res);
    }

    return res.status(400).json({
      success: false,
      message:
        "Unsupported payment method.",
    });
  } catch (error) {
    console.error(
      "CREATE DONATION ERROR:",
      error?.response?.data ||
        error.message
    );

    return res.status(500).json({
      success: false,
      message:
        getErrorMessage(
          error,
          "Unable to initiate payment."
        ),
    });
  }
}


/* =========================================================
   M-PESA CALLBACK
   POST /api/donations/mpesa/callback
========================================================= */

async function mpesaCallback(req, res) {
  try {
    console.log(
      "M-PESA CALLBACK:",
      JSON.stringify(
        req.body,
        null,
        2
      )
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
      String(
        stkCallback.ResultCode ?? ""
      );

    const resultDesc =
      stkCallback.ResultDesc || "";

    const donation =
      await Donation.findOne({
        checkoutRequestId,
      });

    if (!donation) {
      console.warn(
        "M-PESA donation not found:",
        checkoutRequestId
      );

      return res.json({
        ResultCode: 0,
        ResultDesc: "Accepted",
      });
    }

    donation.callbackReceived = true;

    donation.resultCode =
      resultCode;

    donation.resultDescription =
      resultDesc;

    donation.callbackData =
      stkCallback;

    if (resultCode === "0") {
      const metadata =
        stkCallback.CallbackMetadata?.Item ||
        [];

      const getMetadata = (name) =>
        metadata.find(
          (item) =>
            item.Name === name
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

      donation.paymentReference =
        donation.mpesaReceiptNumber ||
        donation.checkoutRequestId;

      donation.providerTransactionId =
        donation.mpesaReceiptNumber || "";

      donation.status =
        "completed";
    } else if (resultCode === "1032") {
      donation.status =
        "cancelled";
    } else {
      donation.status =
        "failed";
    }

    await donation.save();

    // Notify admin dashboard.
    emitDonationUpdate(req, donation);

    console.log(
      "M-PESA DONATION UPDATED:",
      donation._id,
      donation.status
    );

    return res.json({
      ResultCode: 0,
      ResultDesc: "Accepted",
    });
  } catch (error) {
    console.error(
      "M-PESA CALLBACK ERROR:",
      error.message
    );

    return res.json({
      ResultCode: 0,
      ResultDesc: "Accepted",
    });
  }
}


/* =========================================================
   KCB CALLBACK
   POST /api/donations/kcb/callback
========================================================= */

async function kcbCallback(req, res) {
  try {
    console.log(
      "KCB CALLBACK:",
      JSON.stringify(
        req.body,
        null,
        2
      )
    );

    const data = req.body || {};

    const reference =
      data.reference ||
      data.Reference ||
      data.transactionReference ||
      data.TransactionReference ||
      data.data?.reference;

    const transactionId =
      data.transactionId ||
      data.TransactionId ||
      data.data?.transactionId;

    let donation = null;

    if (reference) {
      donation =
        await Donation.findOne({
          $or: [
            {
              kcbReference:
                reference,
            },
            {
              kcbTransactionId:
                reference,
            },
            {
              paymentReference:
                reference,
            },
          ],
        });
    }

    if (!donation && transactionId) {
      donation =
        await Donation.findOne({
          kcbTransactionId:
            transactionId,
        });
    }

    if (!donation) {
      console.warn(
        "KCB donation not found:",
        reference ||
          transactionId
      );

      return res.json({
        success: true,
        message:
          "Callback accepted.",
      });
    }

    const status =
      String(
        data.status ||
          data.Status ||
          data.transactionStatus ||
          data.TransactionStatus ||
          data.data?.status ||
          ""
      ).toLowerCase();

    if (
      [
        "success",
        "successful",
        "completed",
        "complete",
        "paid",
      ].includes(status)
    ) {
      donation.status =
        "completed";
    } else if (
      [
        "cancelled",
        "canceled",
      ].includes(status)
    ) {
      donation.status =
        "cancelled";
    } else if (
      [
        "failed",
        "failure",
        "rejected",
      ].includes(status)
    ) {
      donation.status =
        "failed";
    }

    donation.callbackReceived =
      true;

    donation.callbackData =
      data;

    donation.providerTransactionId =
      transactionId ||
      donation.kcbTransactionId ||
      "";

    donation.paymentReference =
      reference ||
      donation.kcbReference ||
      donation.kcbTransactionId ||
      String(donation._id);

    donation.resultDescription =
      data.message ||
      data.ResponseDescription ||
      donation.resultDescription ||
      "";

    await donation.save();

    emitDonationUpdate(req, donation);

    return res.json({
      success: true,
      message:
        "Callback accepted.",
    });
  } catch (error) {
    console.error(
      "KCB CALLBACK ERROR:",
      error.message
    );

    return res.json({
      success: true,
      message:
        "Callback accepted.",
    });
  }
}


/* =========================================================
   AIRTEL CALLBACK
   POST /api/donations/airtel/callback
========================================================= */

async function airtelCallback(req, res) {
  try {
    console.log(
      "AIRTEL CALLBACK:",
      JSON.stringify(
        req.body,
        null,
        2
      )
    );

    const data = req.body || {};

    const reference =
      data.reference ||
      data.Reference ||
      data.transactionReference ||
      data.TransactionReference ||
      data.transaction?.reference ||
      data.data?.reference;

    const transactionId =
      data.transactionId ||
      data.TransactionId ||
      data.transaction?.id ||
      data.data?.transactionId ||
      data.data?.transaction?.id;

    let donation = null;

    if (reference) {
      donation =
        await Donation.findOne({
          $or: [
            {
              airtelReference:
                reference,
            },
            {
              airtelTransactionId:
                reference,
            },
            {
              paymentReference:
                reference,
            },
          ],
        });
    }

    if (
      !donation &&
      transactionId
    ) {
      donation =
        await Donation.findOne({
          airtelTransactionId:
            transactionId,
        });
    }

    if (!donation) {
      console.warn(
        "Airtel donation not found:",
        reference ||
          transactionId
      );

      return res.json({
        success: true,
        message:
          "Callback accepted.",
      });
    }

    const status =
      String(
        data.status ||
          data.Status ||
          data.transactionStatus ||
          data.TransactionStatus ||
          data.transaction?.status ||
          data.data?.status ||
          data.data?.transaction?.status ||
          ""
      ).toLowerCase();

    if (
      [
        "success",
        "successful",
        "completed",
        "complete",
        "paid",
      ].includes(status)
    ) {
      donation.status =
        "completed";
    } else if (
      [
        "cancelled",
        "canceled",
      ].includes(status)
    ) {
      donation.status =
        "cancelled";
    } else if (
      [
        "failed",
        "failure",
        "rejected",
      ].includes(status)
    ) {
      donation.status =
        "failed";
    }

    donation.callbackReceived =
      true;

    donation.callbackData =
      data;

    donation.providerTransactionId =
      transactionId ||
      donation.airtelTransactionId ||
      "";

    donation.paymentReference =
      reference ||
      donation.airtelReference ||
      donation.airtelTransactionId ||
      String(donation._id);

    donation.resultDescription =
      data.message ||
      data.statusMessage ||
      data.data?.message ||
      donation.resultDescription ||
      "";

    await donation.save();

    emitDonationUpdate(req, donation);

    return res.json({
      success: true,
      message:
        "Callback accepted.",
    });
  } catch (error) {
    console.error(
      "AIRTEL CALLBACK ERROR:",
      error.message
    );

    return res.json({
      success: true,
      message:
        "Callback accepted.",
    });
  }
}


/* =========================================================
   DONATION STATUS
   GET /api/donations/status/:id
========================================================= */

async function getDonationStatus(req, res) {
  try {
    const { id } =
      req.params;

    let donation =
      await Donation.findOne({
        checkoutRequestId: id,
      }).select(
        "-callbackData -providerResponse"
      );

    if (!donation) {
      try {
        donation =
          await Donation.findById(
            id
          ).select(
            "-callbackData -providerResponse"
          );
      } catch {
        donation = null;
      }
    }

    if (!donation) {
      return res.status(404).json({
        success: false,
        message:
          "Donation not found.",
      });
    }

    return res.json({
      success: true,
      donation:
        donationResponse(
          donation
        ),
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


/* =========================================================
   QUERY M-PESA
   GET /api/donations/:id/query
========================================================= */

async function queryDonationPayment(
  req,
  res
) {
  try {
    const { id } =
      req.params;

    const donation =
      await Donation.findById(
        id
      );

    if (!donation) {
      return res.status(404).json({
        success: false,
        message:
          "Donation not found.",
      });
    }

    if (
      !donation.checkoutRequestId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This donation has no M-PESA CheckoutRequestID.",
      });
    }

    const result =
      await querySTKPush(
        donation.checkoutRequestId
      );

    const resultCode =
      String(
        result?.ResultCode ?? ""
      );

    if (resultCode === "0") {
      donation.status =
        "completed";
    } else if (
      resultCode === "1032"
    ) {
      donation.status =
        "cancelled";
    } else if (resultCode) {
      donation.status =
        "failed";
    }

    donation.resultCode =
      resultCode;

    donation.resultDescription =
      result?.ResultDesc || "";

    if (resultCode === "0") {
      donation.callbackReceived =
        true;

      donation.paymentReference =
        donation.mpesaReceiptNumber ||
        donation.checkoutRequestId;
    }

    await donation.save();

    emitDonationUpdate(req, donation);

    return res.json({
      success: true,

      mpesa: result,

      donation:
        donationResponse(
          donation
        ),

      donationStatus:
        donation.status,
    });
  } catch (error) {
    console.error(
      "QUERY M-PESA DONATION ERROR:",
      error?.response?.data ||
        error.message
    );

    return res.status(500).json({
      success: false,
      message:
        getErrorMessage(
          error,
          "Unable to query M-PESA transaction."
        ),
    });
  }
}


/* =========================================================
   BANK DONATION
   POST /api/donations/bank
========================================================= */

async function createBankDonation(
  req,
  res
) {
  try {
    const {
      name,
      email,
      phone,
      amount,
      purpose,
    } = req.body || {};

    const donationAmount =
      validateAmount(amount);

    if (!donationAmount) {
      return res.status(400).json({
        success: false,
        message:
          "Donation amount must be at least KSh 10.",
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message:
          "Phone number is required.",
      });
    }

    const normalizedPhone =
      normalizePhone(phone);

    if (!/^254(7|1)\d{8}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid Kenyan phone number.",
      });
    }

    const donation =
      await createDonationRecord({
        name,
        email,
        phone: normalizedPhone,
        amount: donationAmount,
        purpose,
        paymentMethod: "bank",
      });

    donation.bankReference =
      `EMS-BANK-${String(
        donation._id
      )
        .slice(-8)
        .toUpperCase()}`;

    donation.paymentReference =
      donation.bankReference;

    donation.bankName =
      process.env.DONATION_BANK_NAME ||
      "KCB Bank";

    donation.resultDescription =
      "Awaiting bank transfer confirmation.";

    donation.status =
      "processing";

    await donation.save();

    emitDonationUpdate(req, donation);

    return res.status(200).json({
      success: true,

      message:
        "Bank donation created successfully. Complete the bank transfer using the provided details.",

      paymentMethod: "bank",

      donation:
        donationResponse(
          donation
        ),

      donationId:
        donation._id,

      reference:
        donation.bankReference,

      status:
        donation.status,

      bankDetails: {
        bank:
          process.env.DONATION_BANK_NAME ||
          "KCB Bank",

        accountName:
          process.env.DONATION_BANK_ACCOUNT_NAME ||
          "ROLEX",

        accountNumber:
          process.env.DONATION_BANK_ACCOUNT_NUMBER ||
          "1296571637",
      },
    });
  } catch (error) {
    console.error(
      "BANK DONATION ERROR:",
      error?.response?.data ||
        error.message
    );

    return res.status(500).json({
      success: false,
      message:
        getErrorMessage(
          error,
          "Unable to create bank donation."
        ),
    });
  }
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  createDonation,
  mpesaCallback,
  kcbCallback,
  airtelCallback,
  getDonationStatus,
  queryDonationPayment,
  createBankDonation,
};