const Emergency = require('../models/Emergency');
const Ambulance = require('../models/Ambulance');
const Hospital = require('../models/Hospital');
const User = require('../models/User');
const { findNearestAmbulances, findNearestHospitals, estimateETA, calculateDistance } = require('../utils/gpsHelper');
const { sendSMS, smsTemplates } = require('../utils/smsService');
const { analyzeEmergency, getFirstAidGuidance, getEquipmentNeeds } = require('../services/aiTriageService');
const { dispatchBestUnit } = require('../services/dispatchService');
const {
  notifyEmergencyConfirmed,
  notifyStatusChange,
  notifyEmergencyContacts,
  notifyEMTDispatch,
  notifyAdminCritical
} = require('../services/notificationService');
const { verifyBeneficiary } = require('../services/shaService');

// @desc    Create emergency request
// @route   POST /api/emergency
const createEmergency = async (req, res, next) => {
  try {
    const { type, description, coordinates, address, what3words, county, severity } = req.body;

    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
      return res.status(400).json({ success: false, message: 'Valid coordinates [lng, lat] required' });
    }

    // AI Triage
    const triage = analyzeEmergency(description, type);
    const equipmentNeeds = getEquipmentNeeds(triage.type, triage.score);

    // SHA Verification (non-blocking)
    let shaData = null;
    if (req.user.shaNumber || req.user.idNumber) {
      shaData = await verifyBeneficiary(
        req.user.shaNumber || req.user.idNumber,
        req.user.shaNumber ? 'sha_number' : 'national_id'
      );
    }

    const emergency = await Emergency.create({
      patient: req.user._id,
      type: triage.type,
      description,
      severity: severity || triage.severity,
      patientLocation: { type: 'Point', coordinates, address, what3words, county },
      aiTriageScore: triage.score,
      aiTriageSummary: `AI triage: ${triage.type} | Score ${triage.score}/10 | Severity: ${triage.severity}`,
      shaVerified: shaData?.eligible || false,
      timeline: [{ status: 'pending', note: `Emergency received. AI triage score: ${triage.score}/10` }]
    });

    // Dispatch best unit
    const dispatchResult = await dispatchBestUnit(coordinates, triage.type, triage.severity);
    let etaMinutes = 30;

    if (dispatchResult) {
      const { ambulance, eta } = dispatchResult;
      etaMinutes = eta;
      if (ambulance._id) await Ambulance.findByIdAndUpdate(ambulance._id, { status: 'dispatched' });
      emergency.ambulance = ambulance._id;
      emergency.emt = ambulance.emt;
      emergency.status = 'dispatched';
      emergency.timeline.push({
        status: 'dispatched',
        note: `${ambulance.type} unit ${ambulance.registrationNumber} dispatched. ETA: ${eta} min`
      });

      const nearbyHospitals = await findNearestHospitals(Hospital, coordinates, 100000, 5);
      const preferredHospital = nearbyHospitals.find(h => h.shaEmpanelled) || nearbyHospitals[0];
      if (preferredHospital) {
        emergency.hospital = preferredHospital._id;
        emergency.destinationLocation = {
          type: 'Point',
          coordinates: preferredHospital.location.coordinates,
          address: preferredHospital.name
        };
      }
      await emergency.save();

      if (ambulance.emt) {
        const emtUser = await User.findById(ambulance.emt);
        if (emtUser) await notifyEMTDispatch(emtUser, emergency, req.user);
      }
    } else {
      // No ambulance found — try to assign to any available EMT directly
      const availableEMT = await User.findOne({ role: 'emt', status: 'available' });
      if (availableEMT) {
        emergency.emt = availableEMT._id;
        emergency.status = 'dispatched';
        emergency.timeline.push({ status: 'dispatched', note: 'Assigned to available EMT (no ambulance linked)' });
        await emergency.save();
        if (io) {
          io.to(`user_${availableEMT._id}`).emit('dispatch_assigned', {
            emergencyId: emergency.emergencyId,
            emergencyDbId: emergency._id,
            patientLocation: emergency.patientLocation,
            patientName: `${req.user.firstName} ${req.user.lastName}`,
            patientPhone: req.user.phone,
            patientBloodGroup: req.user.bloodGroup,
            type: triage.type,
            severity: triage.severity,
            guidance: triage.guidance,
          });
        }
        await notifyEMTDispatch(availableEMT, emergency, req.user);
      } else {
        await emergency.save();
      }
      if (triage.severity === 'critical') await notifyAdminCritical(emergency, req.user);
    }

    await User.findByIdAndUpdate(req.user._id, { $inc: { totalEmergencies: 1 } });
    await notifyEmergencyConfirmed(req.user, emergency, etaMinutes);

    if (req.user.emergencyContacts?.length > 0) {
      await notifyEmergencyContacts(req.user.emergencyContacts, req.user, emergency);
    }

    const io = req.app.get('io');
    if (io) {
      io.to('admin_room').emit('new_emergency', {
        emergencyId: emergency.emergencyId,
        type: triage.type,
        severity: triage.severity,
        coordinates,
        county,
        patientName: `${req.user.firstName} ${req.user.lastName}`
      });
      if (dispatchResult?.ambulance?.emt) {
        io.to(`user_${dispatchResult.ambulance.emt}`).emit('dispatch_assigned', {
          emergencyId: emergency.emergencyId,
          emergencyDbId: emergency._id,
          patientLocation: emergency.patientLocation,
          patientName: `${req.user.firstName} ${req.user.lastName}`,
          patientPhone: req.user.phone,
          patientBloodGroup: req.user.bloodGroup,
          type: triage.type,
          severity: triage.severity,
          guidance: triage.guidance,
          equipmentNeeds
        });
      }
    }

    res.status(201).json({
      success: true,
      message: 'Emergency dispatched',
      emergency,
      eta: etaMinutes,
      triage: {
        score: triage.score,
        severity: triage.severity,
        guidance: triage.guidance,
        confidence: triage.confidence
      },
      responder: dispatchResult ? {
        registration: dispatchResult.ambulance.registrationNumber,
        type: dispatchResult.ambulance.type,
        distanceKm: dispatchResult.distance?.toFixed(1)
      } : null,
      shaStatus: shaData ? { eligible: shaData.eligible, memberNumber: shaData.memberNumber } : null
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single emergency
// @route   GET /api/emergency/:id
const getEmergency = async (req, res, next) => {
  try {
    const emergency = await Emergency.findById(req.params.id)
      .populate('patient', 'firstName lastName phone bloodGroup allergies medicalConditions shaNumber')
      .populate('emt', 'firstName lastName phone')
      .populate('ambulance', 'registrationNumber type equipment')
      .populate('hospital', 'name address phone location capabilities');

    if (!emergency) return res.status(404).json({ success: false, message: 'Emergency not found' });

    if (req.user.role === 'patient' && emergency.patient._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, emergency });
  } catch (error) {
    next(error);
  }
};

// @desc    Update emergency status
// @route   PUT /api/emergency/:id/status
const updateStatus = async (req, res, next) => {
  try {
    const { status, note, coordinates, vitals, interventions } = req.body;
    const validStatuses = ['dispatched','enroute','on_scene','transporting','at_hospital','completed','cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const emergency = await Emergency.findById(req.params.id)
      .populate('patient', 'firstName lastName phone email emergencyContacts');
    if (!emergency) return res.status(404).json({ success: false, message: 'Emergency not found' });

    const oldStatus = emergency.status;
    emergency.status = status;
    emergency.timeline.push({
      status,
      note: note || `Status updated to ${status}`,
      location: coordinates ? { type: 'Point', coordinates } : undefined,
      timestamp: new Date()
    });

    if (vitals && status === 'on_scene') {
      emergency.vitals.push({ ...vitals, timestamp: new Date() });
    }
    if (interventions) {
      emergency.interventions = [...new Set([...(emergency.interventions || []), ...interventions])];
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
        await Ambulance.findByIdAndUpdate(emergency.ambulance, { status: 'available', $inc: { totalTrips: 1 } });
      }
    }

    await emergency.save();
    if (emergency.patient) await notifyStatusChange(emergency.patient, emergency, status);

    const io = req.app.get('io');
    if (io) {
      io.to(`emergency_${emergency._id}`).emit('status_update', { status, timestamp: new Date(), emergencyId: emergency.emergencyId });
      io.to('admin_room').emit('emergency_status_changed', { emergencyId: emergency.emergencyId, oldStatus, newStatus: status });
    }

    res.json({ success: true, emergency });
  } catch (error) {
    next(error);
  }
};

// @desc    Get my emergencies
// @route   GET /api/emergency/my
const getMyEmergencies = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const query = { patient: req.user._id, isDeleted: false };
    if (req.query.status) query.status = req.query.status;

    const [emergencies, total] = await Promise.all([
      Emergency.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('emt', 'firstName lastName phone')
        .populate('hospital', 'name address'),
      Emergency.countDocuments(query)
    ]);

    res.json({ success: true, emergencies, total, page, pages: Math.ceil(total / limit), hasMore: page * limit < total });
  } catch (error) {
    next(error);
  }
};

// @desc    Rate completed emergency
// @route   POST /api/emergency/:id/rate
const rateEmergency = async (req, res, next) => {
  try {
    const { rating, feedback } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be 1-5' });
    }
    const emergency = await Emergency.findOneAndUpdate(
      { _id: req.params.id, patient: req.user._id, status: 'completed' },
      { rating, feedback },
      { new: true }
    );
    if (!emergency) return res.status(404).json({ success: false, message: 'Emergency not found or not completed' });
    res.json({ success: true, message: 'Thank you for your feedback', emergency });
  } catch (error) {
    next(error);
  }
};

// @desc    AI triage pre-dispatch
// @route   POST /api/emergency/triage
const getAITriage = async (req, res, next) => {
  try {
    const { description, type } = req.body;
    const triage = analyzeEmergency(description, type);
    res.json({ success: true, triage: { type: triage.type, score: triage.score, severity: triage.severity, confidence: triage.confidence, guidance: triage.guidance, keywords: triage.keywordsDetected } });
  } catch (error) {
    next(error);
  }
};

// @desc    SHA verify
// @route   POST /api/emergency/sha-verify
const shaVerify = async (req, res, next) => {
  try {
    const { identifier, idType } = req.body;
    const result = await verifyBeneficiary(identifier, idType);
    res.json({ success: true, sha: result });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel emergency
// @route   PUT /api/emergency/:id/cancel
const cancelEmergency = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const emergency = await Emergency.findOne({
      _id: req.params.id,
      patient: req.user._id,
      status: { $in: ['pending', 'dispatched'] }
    });
    if (!emergency) return res.status(404).json({ success: false, message: 'Cannot cancel this emergency' });

    emergency.status = 'cancelled';
    emergency.timeline.push({ status: 'cancelled', note: reason || 'Cancelled by patient' });
    await emergency.save();

    if (emergency.ambulance) {
      await Ambulance.findByIdAndUpdate(emergency.ambulance, { status: 'available' });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`emergency_${emergency._id}`).emit('status_update', { status: 'cancelled' });
      io.to('admin_room').emit('emergency_cancelled', { emergencyId: emergency.emergencyId, reason });
    }

    res.json({ success: true, message: 'Emergency cancelled', emergency });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createEmergency, getEmergency, updateStatus, getMyEmergencies,
  rateEmergency, getAITriage, shaVerify, cancelEmergency
};
