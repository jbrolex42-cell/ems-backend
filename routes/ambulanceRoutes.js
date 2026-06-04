const express = require('express');
const router = express.Router();
const {
  createAmbulance, getAmbulances, getAmbulance, getNearby,
  updateAmbulance, deleteAmbulance, pingLocation, updateEquipment, setStatus
} = require('../controllers/ambulanceController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Public
router.get('/nearby', getNearby);

// Authenticated
router.get('/', protect, getAmbulances);
router.get('/:id', protect, getAmbulance);
router.post('/:id/ping', protect, pingLocation);

// EMT or Admin
router.put('/:id/status', protect, authorize('emt','admin','superadmin'), setStatus);
router.put('/:id/equipment', protect, authorize('emt','admin','superadmin'), updateEquipment);

// Admin only
router.post('/', protect, authorize('admin','superadmin'), createAmbulance);
router.put('/:id', protect, authorize('admin','superadmin'), updateAmbulance);
router.delete('/:id', protect, authorize('admin','superadmin'), deleteAmbulance);

module.exports = router;
