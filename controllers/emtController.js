const Emergency = require('../models/Emergency');
const User = require('../models/User');
const Ambulance = require('../models/Ambulance');

// @route GET /api/emt/cases
const getMyCases = async (req, res, next) => {
  try {
    const { limit = 6, status, page = 1 } = req.query;
    const query = { emt: req.user._id, isDeleted: false };
    if (status) query.status = status;

    const [cases, total] = await Promise.all([
      Emergency.find(query)
        .populate('patient', 'firstName lastName phone bloodGroup allergies medicalConditions shaNumber')
        .populate('ambulance', 'registrationNumber type')
        .populate('hospital', 'name address phone')
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit)),
      Emergency.countDocuments(query)
    ]);

    res.json({ success: true, cases, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) { next(error); }
};

// @route GET /api/emt/cases/:id
const getMyCase = async (req, res, next) => {
  try {
    const emergency = await Emergency.findOne({ _id: req.params.id, emt: req.user._id })
      .populate('patient', 'firstName lastName phone bloodGroup allergies medicalConditions shaNumber idNumber emergencyContacts')
      .populate('ambulance', 'registrationNumber type equipment')
      .populate('hospital', 'name address phone location capabilities');

    if (!emergency) return res.status(404).json({ success: false, message: 'Case not found' });
    res.json({ success: true, emergency });
  } catch (error) { next(error); }
};

// @route GET /api/emt/stats
const getMyStats = async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const emtId = req.user._id;

    const [activeCases, completedToday, totalHandled, responseTimeData] = await Promise.all([
      Emergency.countDocuments({ emt: emtId, status: { $in: ['dispatched','enroute','on_scene','transporting'] } }),
      Emergency.countDocuments({ emt: emtId, status: 'completed', createdAt: { $gte: today } }),
      Emergency.countDocuments({ emt: emtId }),
      Emergency.aggregate([
        { $match: { emt: emtId, responseTime: { $exists: true, $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: '$responseTime' } } }
      ])
    ]);

    res.json({
      success: true,
      activeCases,
      completedToday,
      totalHandled,
      avgResponseTime: responseTimeData[0] ? Math.round(responseTimeData[0].avg) : null
    });
  } catch (error) { next(error); }
};

// @route PATCH /api/emt/status
const updateMyStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['available', 'on_call', 'unavailable'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const user = await User.findByIdAndUpdate(req.user._id, { status }, { new: true });
    // Also sync their linked ambulance
    await Ambulance.findOneAndUpdate(
      { emt: req.user._id, isActive: true },
      { status: status === 'available' ? 'available' : 'offline' }
    );
    res.json({ success: true, status: user.status });
  } catch (error) { next(error); }
};

// @route PATCH /api/emt/cases/:id/status
const updateCaseStatus = async (req, res, next) => {
  try {
    const { status, note, coordinates, vitals } = req.body;
    const validStatuses = ['enroute', 'on_scene', 'transporting', 'at_hospital', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const emergency = await Emergency.findOne({ _id: req.params.id, emt: req.user._id });
    if (!emergency) return res.status(404).json({ success: false, message: 'Case not found or not assigned to you' });

    emergency.status = status;
    emergency.timeline.push({
      status,
      note: note || `Status updated to ${status} by EMT`,
      location: coordinates ? { type: 'Point', coordinates } : undefined,
      timestamp: new Date()
    });

    if (vitals && status === 'on_scene') {
      emergency.vitals = emergency.vitals || [];
      emergency.vitals.push({ ...vitals, timestamp: new Date() });
    }

    if (status === 'completed') {
      const dispatchedEntry = emergency.timeline.find(t => t.status === 'dispatched');
      const onSceneEntry = emergency.timeline.find(t => t.status === 'on_scene');
      if (dispatchedEntry && onSceneEntry) {
        emergency.responseTime = Math.round(
          (new Date(onSceneEntry.timestamp) - new Date(dispatchedEntry.timestamp)) / 60000
        );
      }
      emergency.totalTime = Math.round((new Date() - new Date(emergency.createdAt)) / 60000);
      if (emergency.ambulance) {
        await Ambulance.findByIdAndUpdate(emergency.ambulance, { status: 'available' });
      }
    }

    await emergency.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`emergency_${emergency._id}`).emit('status_update', { status, timestamp: new Date() });
      io.to('admin_room').emit('emergency_status_changed', { emergencyId: emergency.emergencyId, newStatus: status });
    }

    res.json({ success: true, emergency });
  } catch (error) { next(error); }
};

module.exports = { getMyCases, getMyCase, getMyStats, updateMyStatus, updateCaseStatus };
