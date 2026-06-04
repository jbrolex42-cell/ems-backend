const Ambulance = require('../models/Ambulance');
const User = require('../models/User');
const { findNearestAmbulances, calculateDistance } = require('../utils/gpsHelper');

const createAmbulance = async (req, res, next) => {
  try {
    const ambulance = await Ambulance.create(req.body);
    res.status(201).json({ success: true, ambulance });
  } catch (error) { next(error); }
};

const getAmbulances = async (req, res, next) => {
  try {
    const { county, status, type, page = 1, limit = 20 } = req.query;
    const query = { isActive: true };
    if (county) query.county = county;
    if (status) query.status = status;
    if (type) query.type = type;
    const [ambulances, total] = await Promise.all([
      Ambulance.find(query)
        .populate('driver', 'firstName lastName phone')
        .populate('emt', 'firstName lastName phone')
        .sort({ status: 1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit)),
      Ambulance.countDocuments(query)
    ]);
    res.json({ success: true, ambulances, total, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
};

const getAmbulance = async (req, res, next) => {
  try {
    const ambulance = await Ambulance.findById(req.params.id)
      .populate('driver', 'firstName lastName phone')
      .populate('emt', 'firstName lastName phone');
    if (!ambulance) return res.status(404).json({ success: false, message: 'Ambulance not found' });
    res.json({ success: true, ambulance });
  } catch (error) { next(error); }
};

const getNearby = async (req, res, next) => {
  try {
    const { lng, lat, radius = 50000, limit = 10 } = req.query;
    if (!lng || !lat) return res.status(400).json({ success: false, message: 'lng and lat required' });
    const ambulances = await findNearestAmbulances(
      Ambulance, [parseFloat(lng), parseFloat(lat)],
      parseInt(radius), parseInt(limit)
    );
    const withDistance = ambulances.map(amb => ({
      ...amb.toObject(),
      distanceKm: calculateDistance(
        parseFloat(lat), parseFloat(lng),
        amb.location.coordinates[1], amb.location.coordinates[0]
      ).toFixed(1)
    }));
    res.json({ success: true, ambulances: withDistance });
  } catch (error) { next(error); }
};

const updateAmbulance = async (req, res, next) => {
  try {
    const ambulance = await Ambulance.findByIdAndUpdate(
      req.params.id, req.body, { new: true, runValidators: true }
    );
    if (!ambulance) return res.status(404).json({ success: false, message: 'Ambulance not found' });
    res.json({ success: true, ambulance });
  } catch (error) { next(error); }
};

const deleteAmbulance = async (req, res, next) => {
  try {
    await Ambulance.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Ambulance deactivated' });
  } catch (error) { next(error); }
};

const pingLocation = async (req, res, next) => {
  try {
    const { coordinates } = req.body;
    if (!coordinates || coordinates.length !== 2) {
      return res.status(400).json({ success: false, message: 'Valid coordinates required' });
    }
    const ambulance = await Ambulance.findByIdAndUpdate(
      req.params.id,
      { location: { type: 'Point', coordinates }, lastPing: new Date() },
      { new: true }
    );
    if (!ambulance) return res.status(404).json({ success: false, message: 'Ambulance not found' });
    const io = req.app.get('io');
    if (io) {
      io.to('admin_room').emit('ambulance_location', { id: req.params.id, coordinates, registrationNumber: ambulance.registrationNumber, status: ambulance.status });
    }
    res.json({ success: true, message: 'Location updated' });
  } catch (error) { next(error); }
};

const updateEquipment = async (req, res, next) => {
  try {
    const ambulance = await Ambulance.findByIdAndUpdate(
      req.params.id,
      { equipment: req.body },
      { new: true }
    );
    if (!ambulance) return res.status(404).json({ success: false, message: 'Ambulance not found' });
    res.json({ success: true, ambulance });
  } catch (error) { next(error); }
};

const setStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['available','dispatched','enroute','on_scene','transporting','maintenance','offline'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const ambulance = await Ambulance.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!ambulance) return res.status(404).json({ success: false, message: 'Ambulance not found' });
    const io = req.app.get('io');
    if (io) io.to('admin_room').emit('ambulance_status_change', { id: req.params.id, status, registration: ambulance.registrationNumber });
    res.json({ success: true, ambulance });
  } catch (error) { next(error); }
};

module.exports = {
  createAmbulance, getAmbulances, getAmbulance, getNearby,
  updateAmbulance, deleteAmbulance, pingLocation, updateEquipment, setStatus
};
