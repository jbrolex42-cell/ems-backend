// routes/updateRoutes.js
// Handles CRUD for EMS update posts.
// On DELETE and PUT, it also removes stale Cloudinary assets.

const express = require('express');
const router  = express.Router();
const Update  = require('../models/Update'); // your Mongoose model
const { cloudinary } = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');

/* ── Helper: destroy a Cloudinary asset (safe — won't throw) ─────────── */
async function destroyCloudinaryAsset(publicId, resourceType = 'image') {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.warn(`[Cloudinary] Failed to delete ${publicId}:`, err.message);
  }
}

/* ── GET /api/updates ─────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 15, type } = req.query;
    const filter = type ? { type } : {};
    const [posts, total] = await Promise.all([
      Update.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .populate('author', 'firstName lastName'),
      Update.countDocuments(filter),
    ]);
    res.json({ posts, total });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch posts', error: err.message });
  }
});

/* ── POST /api/updates ────────────────────────────────────────────────── */
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { title, summary, body, type, mediaUrl, mediaPublicId, mediaResourceType } = req.body;

    const post = await Update.create({
      title,
      summary,
      body,
      type,
      mediaUrl:         mediaUrl         || null,
      mediaPublicId:    mediaPublicId    || null,
      mediaResourceType: mediaResourceType || 'image',
      author: req.user._id,
    });

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create post', error: err.message });
  }
});

/* ── PUT /api/updates/:id ─────────────────────────────────────────────── */
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { title, summary, body, type, mediaUrl, mediaPublicId, mediaResourceType } = req.body;
    const post = await Update.findById(req.params.id);

    if (!post) return res.status(404).json({ message: 'Post not found' });

    // If media has changed and the old post had a Cloudinary asset, delete the old one
    const mediaChanged = mediaPublicId && mediaPublicId !== post.mediaPublicId;
    if (mediaChanged && post.mediaPublicId) {
      await destroyCloudinaryAsset(post.mediaPublicId, post.mediaResourceType);
    }

    // If media was cleared entirely
    const mediaCleared = !mediaUrl && post.mediaPublicId;
    if (mediaCleared) {
      await destroyCloudinaryAsset(post.mediaPublicId, post.mediaResourceType);
    }

    post.title             = title             ?? post.title;
    post.summary           = summary           ?? post.summary;
    post.body              = body              ?? post.body;
    post.type              = type              ?? post.type;
    post.mediaUrl          = mediaUrl          ?? null;
    post.mediaPublicId     = mediaPublicId     ?? (mediaCleared ? null : post.mediaPublicId);
    post.mediaResourceType = mediaResourceType ?? post.mediaResourceType;

    await post.save();
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update post', error: err.message });
  }
});

/* ── DELETE /api/updates/:id ──────────────────────────────────────────── */
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const post = await Update.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // Delete the Cloudinary asset before removing the DB record
    if (post.mediaPublicId) {
      await destroyCloudinaryAsset(post.mediaPublicId, post.mediaResourceType);
    }

    await post.deleteOne();
    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete post', error: err.message });
  }
});

module.exports = router;
