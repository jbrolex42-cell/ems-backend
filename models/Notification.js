// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        // Patient
        'emergency_dispatched',
        'ambulance_arrived',
        'emergency_resolved',
        'emergency_update',
        'emergency_cancelled',
        'membership_expiry',
        // EMT
        'new_assignment',
        'emt_message',
        // Admin / Superadmin
        'new_emergency',
        'new_user',
        'emt_status',
        'membership',
        'system_alert',
      ],
    },
    title:   { type: String, required: true },
    message: { type: String, required: true },
    read:    { type: Boolean, default: false, index: true },
    // Optional: link to the related document
    refModel: { type: String },
    refId:    { type: mongoose.Schema.Types.ObjectId },
    // Extra data (e.g. county, severity) – kept flexible
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Auto-delete notifications older than 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model('Notification', notificationSchema);
