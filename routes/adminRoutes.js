const express = require("express");

const router = express.Router();

const {
  // Dashboard
  getDashboardStats,
  getSystemHealth,
  broadcastMessage,

  // Donations
  getDonationStats,
  getAllDonations,
  getAdminDonation,

  // Users
  getAllUsers,
  getSingleUser,
  updateUser,
  deleteUser,
  createAdmin,

  // Emergencies
  getAllEmergencies,
  getAdminEmergency,
  reassignAmbulance,

  // Fleet
  getAmbulanceFleet,
  createAmbulance,
  updateAmbulanceLocation,

  // Hospitals
  getHospitals,
  createHospital,
  updateHospital,

  // Memberships
  getMemberships,

  // Export
  exportEmergencies,
} = require("../controllers/adminController");

const {
  protect,
} = require("../middleware/authMiddleware");

const {
  adminMiddleware,
} = require("../middleware/adminMiddleware");

router.use(
  protect,
  adminMiddleware
);

router.get(
  "/stats",
  getDashboardStats
);

router.get(
  "/system-health",
  getSystemHealth
);

router.post(
  "/broadcast",
  broadcastMessage
);

router.get(
  "/donations/stats",
  getDonationStats
);

// GET /api/admin/donations
router.get(
  "/donations",
  getAllDonations
);

// GET /api/admin/donations/:id
router.get(
  "/donations/:id",
  getAdminDonation
);

/*
 * =========================================================
 * USERS
 * =========================================================
 */

// GET /api/admin/users
router.get(
  "/users",
  getAllUsers
);

// GET /api/admin/users/:id
router.get(
  "/users/:id",
  getSingleUser
);

// PUT /api/admin/users/:id
router.put(
  "/users/:id",
  updateUser
);

// DELETE /api/admin/users/:id
router.delete(
  "/users/:id",
  deleteUser
);

// POST /api/admin/create-admin
router.post(
  "/create-admin",
  createAdmin
);

/*
 * =========================================================
 * EMERGENCIES
 * =========================================================
 */

// GET /api/admin/emergencies
router.get(
  "/emergencies",
  getAllEmergencies
);

// GET /api/admin/emergencies/:id
router.get(
  "/emergencies/:id",
  getAdminEmergency
);

// PUT /api/admin/emergencies/:id/reassign
router.put(
  "/emergencies/:id/reassign",
  reassignAmbulance
);

/*
 * =========================================================
 * AMBULANCE FLEET
 * =========================================================
 */

// GET /api/admin/fleet
router.get(
  "/fleet",
  getAmbulanceFleet
);

// POST /api/admin/fleet
router.post(
  "/fleet",
  createAmbulance
);

// PUT /api/admin/fleet/:id/location
router.put(
  "/fleet/:id/location",
  updateAmbulanceLocation
);

/*
 * =========================================================
 * HOSPITALS
 * =========================================================
 */

// GET /api/admin/hospitals
router.get(
  "/hospitals",
  getHospitals
);

// POST /api/admin/hospitals
router.post(
  "/hospitals",
  createHospital
);

// PUT /api/admin/hospitals/:id
router.put(
  "/hospitals/:id",
  updateHospital
);

/*
 * =========================================================
 * MEMBERSHIPS
 * =========================================================
 */

// GET /api/admin/memberships
router.get(
  "/memberships",
  getMemberships
);

/*
 * =========================================================
 * EXPORT
 * =========================================================
 */

// GET /api/admin/export/emergencies
router.get(
  "/export/emergencies",
  exportEmergencies
);

module.exports = router;