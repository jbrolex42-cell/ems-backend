// models/Update.js
const mongoose = require('mongoose');

const updateSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    summary: {
      type: String,
      trim: true,
    },
    body: {
      type: String,
    },
    type: {
      type: String,
      enum: ['news', 'article', 'photo', 'video'],
      default: 'news',
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    // Cloudinary public_id — needed to delete the asset later
    mediaPublicId: {
      type: String,
      default: null,
    },
    // 'image' or 'video' — Cloudinary requires this for destroy()
    mediaResourceType: {
      type: String,
      enum: ['image', 'video'],
      default: 'image',
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Update', updateSchema);
