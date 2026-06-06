const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName:  { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  phone:     { type: String, required: true },
  password:  { type: String, required: true, minlength: 8 },
  role: {
    type: String,
    enum: ['patient', 'emt', 'admin', 'superadmin', 'hospital'],
    default: 'patient'
  },
  avatar:   { type: String, default: '' },
  idNumber: { type: String },
  shaNumber:{ type: String },
  bloodGroup: {
    type: String,
    enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'],
    default: 'Unknown'
  },
  allergies:         [String],
  medicalConditions: [String],
  emergencyContacts: [{ name: String, phone: String, relationship: String }],
  address: {
    street: String, county: String, subCounty: String, what3words: String
  },
  location: {
    type:        { type: String, default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }
  },
  membership: {
    type:        { type: String, enum: ['none','individual','family','school','corporate','residential','sacco'], default: 'none' },
    status:      { type: String, enum: ['inactive','active','expired'], default: 'inactive' },
    expiryDate:  Date,
    memberNumber:String
  },
  isVerified:          { type: Boolean, default: false },
  isActive:            { type: Boolean, default: true },
  verificationToken:   String,
  resetPasswordToken:  String,
  resetPasswordExpire: Date,
  refreshToken:        String,
  lastLogin:           Date,
  totalEmergencies:    { type: Number, default: 0 },

  // ── EMT-specific fields ──────────────────────────────────────
  status:        { type: String, enum: ['available','on_call','unavailable'], default: 'available' },
  badgeNumber:   { type: String },
  station:       { type: String },
  ambulanceUnit: { type: String },
  certification: { type: String }

}, { timestamps: true });

userSchema.index({ location: '2dsphere' });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.resetPasswordToken;
  delete user.verificationToken;
  delete user.refreshToken;
  return user;
};

module.exports = mongoose.model('User', userSchema);
