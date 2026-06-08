const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');

const storage = multer.memoryStorage();

// Media upload (admin only) — images, videos, up to 100MB
const mediaUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// Avatar upload (any logged-in user) — images only, up to 5MB
const avatarUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG or WebP images are allowed'));
    }
  },
});

/**
 * POST /api/uploads/media
 * Admin/Superadmin only — upload images or videos for posts
 */
router.post(
  '/media',
  protect,
  adminOnly,
  mediaUpload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    try {
      const isVideo = req.file.mimetype.startsWith('video/');

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'ems-updates',
            resource_type: isVideo ? 'video' : 'image',
            transformation: isVideo
              ? [{ quality: 'auto' }]
              : [{ quality: 'auto', fetch_format: 'auto' }],
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
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

      res.status(500).json({
        message: 'Upload failed',
        error: err.message,
      });
    }
  }
);

/**
 * POST /api/uploads/avatar
 * Any logged-in user — upload their own profile photo
 */
router.post(
  '/avatar',
  protect,
  avatarUpload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'ems-avatars',
            resource_type: 'image',
            transformation: [
              {
                quality: 'auto',
                fetch_format: 'auto',
                width: 400,
                height: 400,
                crop: 'fill',
                gravity: 'face',
              },
            ],
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
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
      console.error('Avatar upload error:', err);

      res.status(500).json({
        message: 'Upload failed',
        error: err.message,
      });
    }
  }
);

/**
 * DELETE /api/uploads/media
 * Admin/Superadmin only — delete a Cloudinary asset by publicId
 */
router.delete('/media', protect, adminOnly, async (req, res) => {
  const { publicId, resourceType = 'image' } = req.body;

  if (!publicId) {
    return res.status(400).json({
      message: 'publicId is required',
    });
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });

    if (result.result === 'ok' || result.result === 'not found') {
      return res.json({
        message: 'Deleted successfully',
        result: result.result,
      });
    }

    res.status(400).json({
      message: 'Delete failed',
      result,
    });
  } catch (err) {
    console.error('Cloudinary delete error:', err);

    res.status(500).json({
      message: 'Delete failed',
      error: err.message,
    });
  }
});

module.exports = router;