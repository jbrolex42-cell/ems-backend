const mongoose = require('mongoose');

const updateSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    summary: {
      type: String,
      trim: true,
      maxlength: [500, 'Summary cannot exceed 500 characters'],
    },
    body: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['news', 'article', 'photo', 'video'],
      default: 'news',
    },
    mediaUrl: {
      type: String, // Cloudinary URL
    },
    mediaPublicId: {
      type: String, // Cloudinary public_id (needed to delete from Cloudinary)
    },
    mediaType: {
      type: String,
      enum: ['image', 'video', null],
      default: null,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    published: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Text index for search
updateSchema.index({ title: 'text', summary: 'text', body: 'text' });

module.exports = mongoose.model('Update', updateSchema);
