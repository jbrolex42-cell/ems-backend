const mongoose = require("mongoose");

const donationSchema = new mongoose.Schema(
  {
    donorName: {
      type: String,
      trim: true,
      default: "Anonymous",
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    amount: {
      type: Number,
      required: true,
      min: 10,
    },

    purpose: {
      type: String,
      trim: true,
      default: "Emergency Response",
    },

    paymentMethod: {
      type: String,
      enum: [
        "mpesa",
        "kcb",
        "airtel",
        "bank",
      ],
      required: true,
      default: "mpesa",
      index: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },

    /*
     * General payment information
     */
    paymentReference: {
      type: String,
      default: "",
      index: true,
    },

    providerTransactionId: {
      type: String,
      default: "",
      index: true,
    },

    /*
     * M-PESA request information
     */
    merchantRequestId: {
      type: String,
      default: "",
    },

    checkoutRequestId: {
      type: String,
      default: "",
      index: true,
    },

    mpesaReceiptNumber: {
      type: String,
      default: "",
    },

    transactionDate: {
      type: String,
      default: "",
    },

    /*
     * KCB
     */
    kcbTransactionId: {
      type: String,
      default: "",
    },

    kcbReference: {
      type: String,
      default: "",
    },

    /*
     * Airtel Money
     */
    airtelTransactionId: {
      type: String,
      default: "",
    },

    airtelReference: {
      type: String,
      default: "",
    },

    /*
     * Manual bank transfer
     */
    bankReference: {
      type: String,
      default: "",
      trim: true,
    },

    bankName: {
      type: String,
      default: "",
      trim: true,
    },

    /*
     * Provider response information
     */
    resultCode: {
      type: String,
      default: "",
    },

    resultDescription: {
      type: String,
      default: "",
    },

    callbackReceived: {
      type: Boolean,
      default: false,
    },

    callbackData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    providerResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Donation", donationSchema);