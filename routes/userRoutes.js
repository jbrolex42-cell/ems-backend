const express = require('express');
const router = express.Router();
const {
  getProfile, updateProfile, updateLocation, changePassword,
  getMembership, subscribeMembership, renewMembership,
  addBeneficiary, removeBeneficiary
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/location', updateLocation);
router.put('/password', changePassword);
router.get('/membership', getMembership);
router.post('/membership', subscribeMembership);
router.put('/membership/renew', renewMembership);
router.post('/membership/beneficiaries', addBeneficiary);
router.delete('/membership/beneficiaries/:beneficiaryId', removeBeneficiary);

module.exports = router;
