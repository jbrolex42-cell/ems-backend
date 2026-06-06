const express = require('express');
const router = express.Router();
const {
  getMyCases, getMyCase, getMyStats, updateMyStatus, updateCaseStatus
} = require('../controllers/emtController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect, authorize('emt', 'admin', 'superadmin'));

router.get('/stats',                 getMyStats);
router.get('/cases',                 getMyCases);
router.get('/cases/:id',             getMyCase);
router.patch('/status',              updateMyStatus);
router.patch('/cases/:id/status',    updateCaseStatus);

module.exports = router;
