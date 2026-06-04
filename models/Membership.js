const mongoose = require('mongoose');

const membershipSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['individual','family','school','corporate','residential','sacco','mum_dad'],
    required: true
  },
  status: { type: String, enum: ['active','expired','suspended','pending'], default: 'pending' },
  memberNumber: { type: String, unique: true },
  annualFee: { type: Number, required: true },
  startDate: { type: Date, default: Date.now },
  expiryDate: { type: Date, required: true },
  beneficiaries: [{
    name: String,
    idNumber: String,
    phone: String,
    relationship: String,
    dateOfBirth: Date
  }],
  maxBeneficiaries: { type: Number, default: 1 },
  shaLinked: { type: Boolean, default: false },
  autoRenew: { type: Boolean, default: false },
  paymentMethod: String,
  transactionId: String,
  invoiceNumber: String,
  emergenciesUsed: { type: Number, default: 0 },
  emergenciesAllowed: { type: Number, default: -1 } // -1 = unlimited
}, { timestamps: true });

membershipSchema.pre('save', function(next) {
  if (!this.memberNumber) {
    this.memberNumber = 'MBR-' + Date.now().toString().slice(-8);
  }
  next();
});

module.exports = mongoose.model('Membership', membershipSchema);
