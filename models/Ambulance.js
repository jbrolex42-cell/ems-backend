const mongoose = require('mongoose');

const ambulanceSchema = new mongoose.Schema({
  registrationNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },

  type: {
    type: String,
    enum: ['basic', 'advanced', 'neonatal', 'bariatric', 'air'],
    required: true,
  },

  provider: {
    name:    String,
    contact: String,
    county:  String,
  },

  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  emt:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  status: {
    type: String,
    enum: ['available', 'dispatched', 'enroute', 'on_scene', 'transporting', 'maintenance', 'offline'],
    default: 'offline',
  },

  location: {
    type:        { type: String, default: 'Point' },
    coordinates: { type: [Number], default: [36.8219, -1.2921] }, // [lng, lat]
  },

  county:   { type: String, required: true },
  capacity: { type: Number, default: 2, min: 1, max: 20 },

  // Flexible equipment list — matches the frontend's EQUIPMENT_CATEGORIES picker
  equipment: {
    type: [String],
    default: [],
  },

  // Licensing
  kmpldc: {
    licenseNumber: String,
    expiryDate:    Date,
    isValid:       { type: Boolean, default: false },
  },

  // Roadworthiness
  roadworthiness: {
    lastInspection: Date,
    nextInspection: Date,
    isRoadworthy:   { type: Boolean, default: false },
  },

  notes:               { type: String, default: '' },
  totalTrips:          { type: Number, default: 0 },
  averageResponseTime: { type: Number, default: 0 }, // minutes
  isActive:            { type: Boolean, default: true },
  lastPing:            { type: Date, default: Date.now },

}, { timestamps: true });

ambulanceSchema.index({ location: '2dsphere' });
ambulanceSchema.index({ status: 1 });
ambulanceSchema.index({ county: 1 });

module.exports = mongoose.model('Ambulance', ambulanceSchema);
