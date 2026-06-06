// routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { cloudinary } = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth'); // adjust to your auth middleware

// Use memory storage — we stream directly to Cloudinary, no disk writes
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

/**
 * POST /api/uploads/media
 * Uploads a file to Cloudinary and returns { url, publicId }
 */
router.post('/media', protect, adminOnly, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file provided' });
  }

  try {
    const isVideo = req.file.mimetype.startsWith('video/');

    // Stream buffer to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'ems-updates',
          resource_type: isVideo ? 'video' : 'image',
          // Auto-optimize on delivery
          transformation: isVideo
            ? [{ quality: 'auto' }]
            : [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    res.json({
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type,
    });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

/**
 * DELETE /api/uploads/media
 * Deletes a file from Cloudinary by publicId
 * Body: { publicId, resourceType }
 */
router.delete('/media', protect, adminOnly, async (req, res) => {
  const { publicId, resourceType = 'image' } = req.body;

  if (!publicId) {
    return res.status(400).json({ message: 'publicId is required' });
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });

    if (result.result === 'ok' || result.result === 'not found') {
      res.json({ message: 'Deleted successfully', result: result.result });
    } else {
      res.status(400).json({ message: 'Delete failed', result });
    }
  } catch (err) {
    console.error('Cloudinary delete error:', err);
    res.status(500).json({ message: 'Delete failed', error: err.message });
  }
});

module.exports = router;
