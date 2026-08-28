import mongoose from "mongoose";

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
      required: true,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 10,
    },

    purpose: {
      type: String,
      default: "Emergency Response",
      trim: true,
    },

    paymentMethod: {
      type: String,
      enum: ["mpesa", "bank"],
      default: "mpesa",
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
    },

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
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Donation", donationSchema);