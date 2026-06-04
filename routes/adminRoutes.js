const express = require('express');
const router = express.Router();
const {
  getDashboardStats, getAllUsers, getSingleUser, updateUser, deleteUser,
  getAllEmergencies, getAdminEmergency, reassignAmbulance,
  getAmbulanceFleet, getHospitals, createHospital, updateHospital,
  getMemberships, getSystemHealth, broadcastMessage, exportEmergencies
} = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { adminMiddleware } = require('../middleware/adminMiddleware');

router.use(protect, adminMiddleware);

// Stats & health
router.get('/stats', getDashboardStats);
router.get('/system-health', getSystemHealth);
router.post('/broadcast', broadcastMessage);

// Users
router.get('/users', getAllUsers);
router.get('/users/:id', getSingleUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// Emergencies
router.get('/emergencies', getAllEmergencies);
router.get('/emergencies/:id', getAdminEmergency);
router.put('/emergencies/:id/reassign', reassignAmbulance);

// Fleet
router.get('/fleet', getAmbulanceFleet);

// Hospitals
router.get('/hospitals', getHospitals);
router.post('/hospitals', createHospital);
router.put('/hospitals/:id', updateHospital);

// Memberships
router.get('/memberships', getMemberships);

// Export
router.get('/export/emergencies', exportEmergencies);

module.exports = router;
