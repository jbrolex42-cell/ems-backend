const express = require('express');
const router = express.Router();
const Update = require('../models/Update');
const cloudinary = require('../config/cloudinary');
const { uploadAny } = require('../middleware/uploadMiddleware');
const { protect } = require('../middleware/authMiddleware');
const { adminMiddleware } = require('../middleware/adminMiddleware');

// ── Auth shorthand ────────────────────────────────────────────────────
const adminOnly = [protect, adminMiddleware];

// ─────────────────────────────────────────────────────────────────────
// GET /updates  — public, no auth required
// Query: page, limit, type, search
// ─────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 9);
    const skip  = (page - 1) * limit;

    const filter = { published: true };

    if (req.query.type) {
      filter.type = req.query.type;
    }

    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }

    const [posts, total] = await Promise.all([
      Update.find(filter)
        .populate('author', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Update.countDocuments(filter),
    ]);

    res.json({ posts, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('GET /updates error:', err);
    res.status(500).json({ message: 'Failed to fetch updates' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /updates/:id  — public, single post
// ─────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const post = await Update.findById(req.params.id)
      .populate('author', 'firstName lastName')
      .lean();

    if (!post) return res.status(404).json({ message: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch post' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /updates  — admin/superadmin only
// Supports: JSON body (mediaUrl provided) OR multipart/form-data (file upload)
// ─────────────────────────────────────────────────────────────────────
router.post('/', adminOnly, uploadAny.single('file'), async (req, res) => {
  try {
    const { title, summary, body, type, mediaUrl, published } = req.body;

    if (!title) return res.status(400).json({ message: 'Title is required' });

    let finalMediaUrl    = mediaUrl || null;
    let finalPublicId    = null;
    let finalMediaType   = null;

    // If a file was uploaded via multipart, use Cloudinary result
    if (req.file) {
      finalMediaUrl  = req.file.path;          // Cloudinary secure URL
      finalPublicId  = req.file.filename;      // Cloudinary public_id
      finalMediaType = req.file.mimetype?.startsWith('video/') ? 'video' : 'image';
    }

    const post = await Update.create({
      title,
      summary,
      body,
      type: type || 'news',
      mediaUrl:      finalMediaUrl,
      mediaPublicId: finalPublicId,
      mediaType:     finalMediaType,
      author:        req.user._id,
      published:     published !== undefined ? published : true,
    });

    const populated = await post.populate('author', 'firstName lastName');
    res.status(201).json(populated);
  } catch (err) {
    console.error('POST /updates error:', err);
    res.status(500).json({ message: 'Failed to create post' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// PUT /updates/:id  — admin/superadmin only
// ─────────────────────────────────────────────────────────────────────
router.put('/:id', adminOnly, uploadAny.single('file'), async (req, res) => {
  try {
    const post = await Update.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const { title, summary, body, type, mediaUrl, published } = req.body;

    // If new file uploaded, delete old one from Cloudinary first
    if (req.file && post.mediaPublicId) {
      try {
        await cloudinary.uploader.destroy(post.mediaPublicId, {
          resource_type: post.mediaType === 'video' ? 'video' : 'image',
        });
      } catch (e) {
        console.warn('Cloudinary delete warning:', e.message);
      }
    }

    if (title)     post.title     = title;
    if (summary !== undefined) post.summary = summary;
    if (body    !== undefined) post.body    = body;
    if (type)      post.type      = type;
    if (published !== undefined) post.published = published;

    if (req.file) {
      post.mediaUrl      = req.file.path;
      post.mediaPublicId = req.file.filename;
      post.mediaType     = req.file.mimetype?.startsWith('video/') ? 'video' : 'image';
    } else if (mediaUrl !== undefined) {
      post.mediaUrl      = mediaUrl || null;
      post.mediaPublicId = null;
      post.mediaType     = null;
    }

    await post.save();
    const populated = await post.populate('author', 'firstName lastName');
    res.json(populated);
  } catch (err) {
    console.error('PUT /updates/:id error:', err);
    res.status(500).json({ message: 'Failed to update post' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// DELETE /updates/:id  — admin/superadmin only
// ─────────────────────────────────────────────────────────────────────
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const post = await Update.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // Delete media from Cloudinary if it was uploaded (not a URL)
    if (post.mediaPublicId) {
      try {
        await cloudinary.uploader.destroy(post.mediaPublicId, {
          resource_type: post.mediaType === 'video' ? 'video' : 'image',
        });
      } catch (e) {
        console.warn('Cloudinary delete warning:', e.message);
      }
    }

    await post.deleteOne();
    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    console.error('DELETE /updates/:id error:', err);
    res.status(500).json({ message: 'Failed to delete post' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /updates/upload/media  — standalone file upload endpoint
// Used by the frontend upload button before creating a post
// ─────────────────────────────────────────────────────────────────────
router.post('/upload/media', adminOnly, uploadAny.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file provided' });
    res.json({
      url:       req.file.path,
      publicId:  req.file.filename,
      mediaType: req.file.mimetype?.startsWith('video/') ? 'video' : 'image',
    });
  } catch (err) {
    res.status(500).json({ message: 'Upload failed' });
  }
});

module.exports = router;
