const Ambulance = require('../models/Ambulance');
const Emergency = require('../models/Emergency');
const { findNearestAmbulances, findNearestHospitals, estimateETA, calculateDistance } = require('../utils/gpsHelper');

/**
 * Core dispatch logic — finds best ambulance for an emergency
 */
const dispatchBestUnit = async (coordinates, emergencyType, severity) => {
  // Prefer ALS for critical; motorcycle for rural / last-mile
  let preferredTypes = ['ALS', 'BLS', 'motorcycle'];
  if (severity === 'critical') preferredTypes = ['ALS', 'BLS'];
  if (emergencyType === 'obstetric') preferredTypes = ['motorcycle', 'BLS', 'ALS']; // fastest rural

  const candidates = await findNearestAmbulances(Ambulance, coordinates, 100000, 10);

  if (!candidates.length) return null;

  // Score by type preference + distance
  const scored = candidates.map(amb => {
    const typeScore = preferredTypes.indexOf(amb.type) !== -1
      ? (preferredTypes.length - preferredTypes.indexOf(amb.type)) * 20
      : 0;
    const dist = calculateDistance(
      coordinates[1], coordinates[0],
      amb.location.coordinates[1], amb.location.coordinates[0]
    );
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
