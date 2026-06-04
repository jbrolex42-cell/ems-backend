const User = require('../models/User');
const Membership = require('../models/Membership');
const { notifyMembershipActivated } = require('../services/notificationService');

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const membership = await Membership.findOne({ user: req.user._id, status: 'active' }).sort({ createdAt: -1 });
    res.json({ success: true, user, membership });
  } catch (error) { next(error); }
};

const updateProfile = async (req, res, next) => {
  try {
    const allowed = ['firstName','lastName','phone','bloodGroup','allergies','medicalConditions','emergencyContacts','address','shaNumber','idNumber'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, user });
  } catch (error) { next(error); }
};

const updateLocation = async (req, res, next) => {
  try {
    const { coordinates } = req.body;
    await User.findByIdAndUpdate(req.user._id, { location: { type: 'Point', coordinates } });
    res.json({ success: true, message: 'Location updated' });
  } catch (error) { next(error); }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.matchPassword(currentPassword))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) { next(error); }
};

const getMembership = async (req, res, next) => {
  try {
    const membership = await Membership.findOne({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, membership });
  } catch (error) { next(error); }
};

const subscribeMembership = async (req, res, next) => {
  try {
    const { type, autoRenew = false, transactionId, beneficiaries = [] } = req.body;
    const plans = {
      individual:   { fee: 4000,  beneficiaries: 1,   days: 365 },
      family:       { fee: 8000,  beneficiaries: 6,   days: 365 },
      mum_dad:      { fee: 5000,  beneficiaries: 2,   days: 365 },
      school:       { fee: 50000, beneficiaries: 500, days: 365 },
      corporate:    { fee: 20000, beneficiaries: 50,  days: 365 },
      residential:  { fee: 15000, beneficiaries: 20,  days: 365 },
      sacco:        { fee: 10000, beneficiaries: 100, days: 365 }
    };

    const plan = plans[type];
    if (!plan) return res.status(400).json({ success: false, message: 'Invalid membership type' });

    // Deactivate any existing membership
    await Membership.updateMany({ user: req.user._id, status: 'active' }, { status: 'expired' });

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + plan.days);

    const membership = await Membership.create({
      user: req.user._id,
      type,
      annualFee: plan.fee,
      expiryDate,
      maxBeneficiaries: plan.beneficiaries,
      status: 'active',
      autoRenew,
      transactionId,
      beneficiaries: beneficiaries.slice(0, plan.beneficiaries)
    });

    await User.findByIdAndUpdate(req.user._id, {
      'membership.type': type,
      'membership.status': 'active',
      'membership.expiryDate': expiryDate,
      'membership.memberNumber': membership.memberNumber
    });

    await notifyMembershipActivated(req.user, membership);

    res.status(201).json({ success: true, message: 'Membership activated', membership });
  } catch (error) { next(error); }
};

const renewMembership = async (req, res, next) => {
  try {
    const membership = await Membership.findOne({ user: req.user._id }).sort({ createdAt: -1 });
    if (!membership) return res.status(404).json({ success: false, message: 'No membership found' });

    const newExpiry = new Date(Math.max(new Date(membership.expiryDate), new Date()));
    newExpiry.setFullYear(newExpiry.getFullYear() + 1);

    membership.expiryDate = newExpiry;
    membership.status = 'active';
    await membership.save();

    await User.findByIdAndUpdate(req.user._id, {
      'membership.status': 'active',
      'membership.expiryDate': newExpiry
    });

    res.json({ success: true, message: 'Membership renewed', membership });
  } catch (error) { next(error); }
};

const addBeneficiary = async (req, res, next) => {
  try {
    const { name, idNumber, phone, relationship, dateOfBirth } = req.body;
    const membership = await Membership.findOne({ user: req.user._id, status: 'active' });
    if (!membership) return res.status(404).json({ success: false, message: 'No active membership' });

    if (membership.beneficiaries.length >= membership.maxBeneficiaries) {
      return res.status(400).json({ success: false, message: `Membership allows max ${membership.maxBeneficiaries} beneficiaries` });
    }

    membership.beneficiaries.push({ name, idNumber, phone, relationship, dateOfBirth });
    await membership.save();
    res.json({ success: true, message: 'Beneficiary added', membership });
  } catch (error) { next(error); }
};

const removeBeneficiary = async (req, res, next) => {
  try {
    const membership = await Membership.findOne({ user: req.user._id, status: 'active' });
    if (!membership) return res.status(404).json({ success: false, message: 'No active membership' });

    membership.beneficiaries = membership.beneficiaries.filter(
      b => b._id.toString() !== req.params.beneficiaryId
    );
    await membership.save();
    res.json({ success: true, message: 'Beneficiary removed', membership });
  } catch (error) { next(error); }
};

module.exports = {
  getProfile, updateProfile, updateLocation, changePassword,
  getMembership, subscribeMembership, renewMembership,
  addBeneficiary, removeBeneficiary
};
