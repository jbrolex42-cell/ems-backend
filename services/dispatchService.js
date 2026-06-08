const Ambulance = require('../models/Ambulance');
const Emergency = require('../models/Emergency');
const User = require('../models/User');

// Haversine distance in km
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

const estimateETA = (distKm, type) => {
  const speed = type === 'motorcycle' ? 60 : 40; // km/h in traffic
  return Math.round((distKm / speed) * 60) + 5;  // +5 min prep time
};

/**
 * Core dispatch logic — finds best ambulance for an emergency
 */
const dispatchBestUnit = async (coordinates, emergencyType, severity) => {
  let preferredTypes = ['ALS', 'BLS', 'motorcycle'];
  if (severity === 'critical') preferredTypes = ['ALS', 'BLS'];
  if (emergencyType === 'obstetric') preferredTypes = ['motorcycle', 'BLS', 'ALS'];

  const [lng, lat] = coordinates;

  // Find all active ambulances that are available OR have an EMT assigned
  // Include 'offline' so EMTs without ambulances set up still get assigned
  const candidates = await Ambulance.find({
    isActive: true,
    status: { $in: ['available', 'offline'] },
    emt: { $exists: true, $ne: null }
  }).populate('emt', '_id firstName lastName phone status');

  // If no ambulances at all, fall back to any available EMT user directly
  if (!candidates.length) {
    const emtUser = await User.findOne({ role: 'emt', status: { $in: ['available', 'on_call'] } });
    if (!emtUser) return null;
    // Return a synthetic ambulance-like object so emergencyController works unchanged
    return {
      ambulance: { _id: null, emt: emtUser._id, type: 'BLS', registrationNumber: 'MANUAL' },
      eta: 20,
      distance: 0
    };
  }

  // Score by type preference + distance
  const scored = candidates.map(amb => {
    const typeScore = preferredTypes.indexOf(amb.type) !== -1
      ? (preferredTypes.length - preferredTypes.indexOf(amb.type)) * 20
      : 0;
    const ambLat = amb.location?.coordinates?.[1] ?? -1.2921;
    const ambLng = amb.location?.coordinates?.[0] ?? 36.8219;
    const dist = haversineKm(lat, lng, ambLat, ambLng);
    const distScore = Math.max(0, 50 - dist * 2);
    const oxyScore = amb.equipment?.oxygenLevel >= 50 ? 10 : 0;
    return { ambulance: amb, score: typeScore + distScore + oxyScore, dist };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const eta = estimateETA(best.dist, best.ambulance.type === 'motorcycle' ? 'motorcycle' : 'ambulance');

  return { ambulance: best.ambulance, eta, distance: best.dist };
};

/**
 * Reassign dispatch if original unit becomes unavailable
 */
const reassignDispatch = async (emergencyId) => {
  const emergency = await Emergency.findById(emergencyId).populate('ambulance');
  if (!emergency) return null;

  const result = await dispatchBestUnit(
    emergency.patientLocation.coordinates,
    emergency.type,
    emergency.severity
  );

  if (result) {
    await Ambulance.findByIdAndUpdate(emergency.ambulance?._id, { status: 'available' });
    await Ambulance.findByIdAndUpdate(result.ambulance._id, { status: 'dispatched' });
    emergency.ambulance = result.ambulance._id;
    emergency.emt = result.ambulance.emt;
    emergency.timeline.push({ status: 'dispatched', note: 'Reassigned dispatch' });
    await emergency.save();
  }

  return result;
};

module.exports = { dispatchBestUnit, reassignDispatch };
