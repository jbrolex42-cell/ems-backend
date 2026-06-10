const mongoose = require('mongoose');

const emergencySchema = new mongoose.Schema({
  emergencyId: { type: String, unique: true },
  patient:     { type: mongoose.Schema.Types.ObjectId, ref: 'User',      required: true },
  emt:         { type: mongoose.Schema.Types.ObjectId, ref: 'User'      },
  ambulance:   { type: mongoose.Schema.Types.ObjectId, ref: 'Ambulance' },
  hospital:    { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital'  },

  type: {
    type: String,
    enum: [
      // Critical
      'cardiac_arrest', 'stroke', 'severe_bleeding', 'choking', 'drowning', 'anaphylaxis',
      // High
      'trauma', 'road_accident', 'cardiac', 'breathing', 'unconscious', 'seizure',
      'obstetric', 'pediatric', 'burns', 'poisoning', 'electrocution', 'assault',
      // Medium
      'fracture', 'fall', 'diabetic', 'mental_health', 'eye_injury', 'animal_bite',
      'heat_stroke', 'industrial',
      // Low
      'abdominal_pain', 'allergic', 'headache', 'other',
    ],
    required: true,
  },

  severity: {
    type: String,
    enum: ['critical', 'high', 'medium', 'low'],
    default: 'high',
  },

  status: {
    type: String,
    enum: ['pending', 'dispatched', 'enroute', 'on_scene', 'transporting', 'at_hospital', 'completed', 'cancelled'],
    default: 'pending',
  },

  patientLocation: {
    type:        { type: String, default: 'Point' },
    coordinates: { type: [Number], required: true },
    address:     String,
    what3words:  String,
    county:      String,
  },

  destinationLocation: {
    type:        { type: String, default: 'Point' },
    coordinates: [Number],
    address:     String,
  },

  description:     String,
  triageNotes:     String,
  aiTriageScore:   Number,
  aiTriageSummary: String,

  responseTime: Number, // minutes from dispatch to scene
  totalTime:    Number, // total incident time in minutes

  timeline: [{
    status:    String,
    timestamp: { type: Date, default: Date.now },
    note:      String,
    location: {
      type:        { type: String, default: 'Point' },
      coordinates: [Number],
    },
  }],

  vitals: [{
    timestamp: Date,
    bp:        String,
    pulse:     Number,
    spo2:      Number,
    temp:      Number,
    gcs:       Number,
    rrr:       Number,
  }],

  interventions: [String],
  medications:   [String],
  oxygenUsed:    { type: Number, default: 0 }, // liters

  shaVerified:     { type: Boolean, default: false },
  shaClaimId:      String,
  shaClaimStatus:  { type: String, enum: ['pending', 'submitted', 'approved', 'rejected', 'paid'] },
  billingAmount:   { type: Number, default: 0 },
  paymentStatus:   { type: String, enum: ['pending', 'paid', 'waived', 'sha_covered'], default: 'pending' },

  rating:   { type: Number, min: 1, max: 5 },
  feedback: String,

  isDeleted: { type: Boolean, default: false },

}, { timestamps: true });

emergencySchema.index({ patientLocation: '2dsphere' });
emergencySchema.index({ status: 1 });
emergencySchema.index({ type: 1 });
emergencySchema.index({ severity: 1 });

emergencySchema.pre('save', function (next) {
  if (!this.emergencyId) {
    this.emergencyId = 'EMS-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Emergency', emergencySchema);
