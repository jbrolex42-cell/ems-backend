const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// Images storage (news, articles, photos)
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'ems-kenya/updates',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }],
  },
});

// Video storage
const videoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'ems-kenya/updates/videos',
    resource_type: 'video',
    allowed_formats: ['mp4', 'mov', 'avi', 'webm'],
  },
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// Generic upload — detects by mimetype
const uploadAny = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      const isVideo = file.mimetype.startsWith('video/');
      return {
        folder: isVideo ? 'ems-kenya/updates/videos' : 'ems-kenya/updates',
        resource_type: isVideo ? 'video' : 'image',
        allowed_formats: isVideo
          ? ['mp4', 'mov', 'avi', 'webm']
          : ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        transformation: isVideo ? [] : [{ width: 1200, crop: 'limit', quality: 'auto' }],
      };
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

module.exports = { uploadImage, uploadVideo, uploadAny };
