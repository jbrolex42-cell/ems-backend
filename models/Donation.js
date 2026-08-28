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
      enum: ["mpesa", "kcb", "airtel", "bank"],
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

    // General payment information
    paymentReference: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    providerTransactionId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    // M-PESA
    merchantRequestId: {
      type: String,
      default: "",
      index: true,
    },

    checkoutRequestId: {
      type: String,
      default: "",
      index: true,
    },

    mpesaReceiptNumber: {
      type: String,
      default: "",
      index: true,
    },

    transactionDate: {
      type: String,
      default: "",
    },

    // KCB
    kcbTransactionId: {
      type: String,
      default: "",
      index: true,
    },

    kcbReference: {
      type: String,
      default: "",
      index: true,
    },

    // Airtel Money
    airtelTransactionId: {
      type: String,
      default: "",
      index: true,
    },

    airtelReference: {
      type: String,
      default: "",
      index: true,
    },

    // Bank
    bankReference: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    bankName: {
      type: String,
      default: "",
      trim: true,
    },

    // Provider response
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
      index: true,
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