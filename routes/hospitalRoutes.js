const express = require('express');
const router = express.Router();
const Hospital = require('../models/Hospital');
const { protect, authorize } = require('../middleware/authMiddleware');
const { findNearestHospitals } = require('../utils/gpsHelper');

// Public: get hospitals
router.get('/', async (req, res, next) => {
  try {
    const { county, shaEmpanelled, capability, page = 1, limit = 20 } = req.query;
    const query = { isActive: true };
    if (county) query.county = { $regex: county, $options: 'i' };
    if (shaEmpanelled !== undefined) query.shaEmpanelled = shaEmpanelled === 'true';
    if (capability) query[`capabilities.${capability}`] = true;

    const [hospitals, total] = await Promise.all([
      Hospital.find(query).sort({ county: 1, name: 1 }).skip((page - 1) * limit).limit(parseInt(limit)),
      Hospital.countDocuments(query)
    ]);

    res.json({ success: true, hospitals, total, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});

// Public: nearest hospitals
router.get('/nearest', async (req, res, next) => {
  try {
    const { lng, lat, radius = 100000 } = req.query;
    if (!lng || !lat) return res.status(400).json({ success: false, message: 'lng and lat required' });
    const hospitals = await findNearestHospitals(Hospital, [parseFloat(lng), parseFloat(lat)], parseInt(radius));
    res.json({ success: true, hospitals });
  } catch (error) { next(error); }
});

// Public: single hospital
router.get('/:id', async (req, res, next) => {
  try {
    const hospital = await Hospital.findById(req.params.id);
    if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
    res.json({ success: true, hospital });
  } catch (error) { next(error); }
});

module.exports = router;
