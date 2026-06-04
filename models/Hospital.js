const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['public','private','faith_based','NGO'], default: 'public' },
  level: { type: String, enum: ['level_2','level_3','level_4','level_5','level_6'], default: 'level_4' },
  county: { type: String, required: true },
  subCounty: String,
  address: String,
  phone: String,
  email: String,
  location: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], required: true }
  },
  shaEmpanelled: { type: Boolean, default: false },
  shaFacilityCode: String,
  capabilities: {
    icu: { type: Boolean, default: false },
    emergency: { type: Boolean, default: true },
    surgery: { type: Boolean, default: false },
    maternity: { type: Boolean, default: false },
    bloodBank: { type: Boolean, default: false },
    dialysis: { type: Boolean, default: false }
  },
  beds: {
    total: Number,
    emergency: Number,
    icu: Number,
    available: Number
  },
  isActive: { type: Boolean, default: true },
  kmpdc: {
    licenseNumber: String,
    expiryDate: Date
  }
}, { timestamps: true });

hospitalSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Hospital', hospitalSchema);
