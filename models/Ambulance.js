const mongoose = require('mongoose');

const ambulanceSchema = new mongoose.Schema({
  registrationNumber: { type: String, required: true, unique: true },
  type: {
    type: String,
    enum: ['ALS', 'BLS', 'motorcycle', 'air', 'medical_taxi'],
    required: true
  },
  provider: {
    name: String,
    contact: String,
    county: String
  },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  emt: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: {
    type: String,
    enum: ['available', 'dispatched', 'enroute', 'on_scene', 'transporting', 'maintenance', 'offline'],
    default: 'offline'
  },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], default: [36.8219, -1.2921] }
  },
  county: { type: String, required: true },
  equipment: {
    defibrillator: { type: Boolean, default: false },
    ventilator: { type: Boolean, default: false },
    oxygenLevel: { type: Number, default: 0 }, // percentage
    oxygenCylinders: { type: Number, default: 0 },
    traumaKit: { type: Boolean, default: true },
    pulseOximeter: { type: Boolean, default: true },
    stretcher: { type: Boolean, default: true },
    bloodProducts: { type: Boolean, default: false }
  },
  kmpldc: {
    licenseNumber: String,
    expiryDate: Date,
    isValid: { type: Boolean, default: false }
  },
  roadworthiness: {
    lastInspection: Date,
    nextInspection: Date,
    isRoadworthy: { type: Boolean, default: false }
  },
  totalTrips: { type: Number, default: 0 },
  averageResponseTime: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  lastPing: { type: Date, default: Date.now }
}, { timestamps: true });

ambulanceSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Ambulance', ambulanceSchema);
