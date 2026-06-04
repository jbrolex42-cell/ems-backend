/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in kilometers
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (value) => (value * Math.PI) / 180;

/**
 * Estimate ETA in minutes based on distance and vehicle type
 */
const estimateETA = (distanceKm, vehicleType = 'ambulance') => {
  const speeds = {
    ambulance: 60,   // km/h average in Kenya
    motorcycle: 45,
    air: 200,
    urban: 40,       // congested urban
    rural: 35        // rural roads
  };
  const speed = speeds[vehicleType] || 60;
  return Math.ceil((distanceKm / speed) * 60);
};

/**
 * Find nearest ambulances using MongoDB geospatial query
 */
const findNearestAmbulances = async (Ambulance, coordinates, maxDistance = 50000, limit = 5) => {
  return await Ambulance.find({
    status: 'available',
    isActive: true,
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates // [lng, lat]
        },
        $maxDistance: maxDistance // meters
      }
    }
  })
  .populate('emt', 'firstName lastName phone')
  .limit(limit);
};

/**
 * Find nearest hospitals
 */
const findNearestHospitals = async (Hospital, coordinates, maxDistance = 100000, limit = 5) => {
  return await Hospital.find({
    isActive: true,
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: coordinates
        },
        $maxDistance: maxDistance
      }
    }
  }).limit(limit);
};

module.exports = { calculateDistance, estimateETA, findNearestAmbulances, findNearestHospitals };
