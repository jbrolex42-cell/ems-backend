const express = require('express');
const router = express.Router();
const {
  createEmergency, getEmergency, updateStatus, getMyEmergencies,
  rateEmergency, getAITriage, shaVerify, cancelEmergency
} = require('../controllers/emergencyController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.post('/triage', getAITriage);
router.post('/sha-verify', shaVerify);
router.post('/', createEmergency);
router.get('/my', getMyEmergencies);
router.get('/:id', getEmergency);
router.put('/:id/status', authorize('emt','admin','superadmin'), updateStatus);
router.put('/:id/cancel', cancelEmergency);
router.post('/:id/rate', rateEmergency);

module.exports = router;
