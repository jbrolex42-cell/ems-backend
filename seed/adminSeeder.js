require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Hospital = require('../models/Hospital');
const Ambulance = require('../models/Ambulance');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ems_kenya');
  console.log('✅ MongoDB Connected');
};

const seedData = async () => {
  await connectDB();

  // ── SuperAdmin ────────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@ems.co.ke';
  const adminPass  = process.env.ADMIN_PASSWORD || 'Admin@2026!';
  const existingAdmin = await User.findOne({ email: adminEmail });
  if (!existingAdmin) {
    await User.create({
      firstName: 'Super', lastName: 'Admin',
      email: adminEmail, phone: '0700000001',
      password: adminPass, role: 'superadmin',
      isVerified: true, isActive: true
    });
    console.log('✅ Superadmin:', adminEmail, '/', adminPass);
  } else {
    console.log('ℹ️  Superadmin already exists');
  }

  // ── Admin user ────────────────────────────────────────────
  const existing2 = await User.findOne({ email: 'manager@ems.co.ke' });
  if (!existing2) {
    await User.create({
      firstName: 'Operations', lastName: 'Manager',
      email: 'manager@ems.co.ke', phone: '0700000002',
      password: 'Manager@2026!', role: 'admin',
      isVerified: true, isActive: true
    });
    console.log('✅ Admin: manager@ems.co.ke / Manager@2026!');
  }

  // ── Demo EMT ──────────────────────────────────────────────
  let emtUser = await User.findOne({ email: 'emt@ems.co.ke' });
  if (!emtUser) {
    emtUser = await User.create({
      firstName: 'James', lastName: 'Odhiambo',
      email: 'emt@ems.co.ke', phone: '0700000003',
      password: 'EMT@2026!', role: 'emt',
      isVerified: true, isActive: true
    });
    console.log('✅ EMT: emt@ems.co.ke / EMT@2026!');
  }

  // ── Demo Patient ──────────────────────────────────────────
  const existing4 = await User.findOne({ email: 'patient@ems.co.ke' });
  if (!existing4) {
    await User.create({
      firstName: 'Grace', lastName: 'Wanjiku',
      email: 'patient@ems.co.ke', phone: '0712345678',
      password: 'Patient@2026!', role: 'patient',
      isVerified: true, isActive: true,
      bloodGroup: 'O+',
      shaNumber: 'SHA-TEST-001',
      idNumber: '12345678',
      'membership.type': 'individual',
      'membership.status': 'active',
      'membership.expiryDate': new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    });
    console.log('✅ Patient: patient@ems.co.ke / Patient@2026!');
  }

  // ── Hospitals ─────────────────────────────────────────────
  const hospitals = [
    { name: 'Kenyatta National Hospital', type: 'public', level: 'level_6', county: 'Nairobi', address: 'Hospital Road, Upper Hill, Nairobi', phone: '020 2726300', location: { type: 'Point', coordinates: [36.8045, -1.3014] }, shaEmpanelled: true, shaFacilityCode: 'KNH-001', capabilities: { icu: true, emergency: true, surgery: true, maternity: true, bloodBank: true, dialysis: true }, beds: { total: 1800, emergency: 120, icu: 40, available: 35 } },
    { name: 'Nairobi Hospital', type: 'private', level: 'level_5', county: 'Nairobi', address: 'Argwings Kodhek Road, Hurlingham', phone: '020 2845000', location: { type: 'Point', coordinates: [36.7930, -1.2993] }, shaEmpanelled: true, shaFacilityCode: 'NBH-001', capabilities: { icu: true, emergency: true, surgery: true, maternity: true, dialysis: true }, beds: { total: 350, emergency: 30, icu: 20, available: 12 } },
    { name: 'Aga Khan Hospital Nairobi', type: 'private', level: 'level_5', county: 'Nairobi', address: '3rd Parklands Avenue, Nairobi', phone: '020 3662000', location: { type: 'Point', coordinates: [36.8197, -1.2644] }, shaEmpanelled: false, capabilities: { icu: true, emergency: true, surgery: true, maternity: true, dialysis: true, bloodBank: true }, beds: { total: 254, emergency: 24, icu: 18, available: 8 } },
    { name: 'MP Shah Hospital', type: 'private', level: 'level_4', county: 'Nairobi', address: 'Shivachi Road, Parklands', phone: '020 4291000', location: { type: 'Point', coordinates: [36.8155, -1.2620] }, shaEmpanelled: true, capabilities: { icu: true, emergency: true, surgery: true }, beds: { total: 180, emergency: 20, icu: 12, available: 5 } },
    { name: 'Moi Teaching & Referral Hospital', type: 'public', level: 'level_6', county: 'Uasin Gishu', address: 'Nandi Road, Eldoret', phone: '053 2063000', location: { type: 'Point', coordinates: [35.2699, 0.5195] }, shaEmpanelled: true, shaFacilityCode: 'MTRH-001', capabilities: { icu: true, emergency: true, surgery: true, maternity: true, bloodBank: true }, beds: { total: 900, emergency: 80, icu: 30, available: 18 } },
    { name: 'Coast General Hospital', type: 'public', level: 'level_5', county: 'Mombasa', address: 'Hospital Road, Mombasa', phone: '041 2312191', location: { type: 'Point', coordinates: [39.6601, -4.0435] }, shaEmpanelled: true, capabilities: { icu: true, emergency: true, surgery: true, maternity: true }, beds: { total: 650, emergency: 50, icu: 20, available: 10 } },
    { name: 'Kisumu County Referral Hospital', type: 'public', level: 'level_5', county: 'Kisumu', address: 'Hospital Road, Kisumu', phone: '057 2022434', location: { type: 'Point', coordinates: [34.7617, -0.0917] }, shaEmpanelled: true, capabilities: { icu: true, emergency: true, surgery: true, maternity: true }, beds: { total: 480, emergency: 40, icu: 15, available: 8 } },
    { name: 'Nakuru Level 5 Hospital', type: 'public', level: 'level_5', county: 'Nakuru', address: 'Kenyatta Avenue, Nakuru', phone: '051 2211456', location: { type: 'Point', coordinates: [36.0753, -0.2747] }, shaEmpanelled: true, capabilities: { icu: false, emergency: true, surgery: true, maternity: true }, beds: { total: 400, emergency: 35, icu: 10, available: 6 } }
  ];

  for (const h of hospitals) {
    const exists = await Hospital.findOne({ name: h.name });
    if (!exists) { await Hospital.create(h); console.log(`✅ Hospital: ${h.name}`); }
  }

  // ── Ambulances ────────────────────────────────────────────
  const ambulances = [
    { registrationNumber: 'KDA 001A', type: 'ALS', county: 'Nairobi', status: 'available', location: { type: 'Point', coordinates: [36.8219, -1.2921] }, provider: { name: 'EMS Kenya Fleet', contact: '0700395395', county: 'Nairobi' }, equipment: { defibrillator: true, ventilator: true, oxygenLevel: 95, oxygenCylinders: 3, traumaKit: true, pulseOximeter: true, stretcher: true, bloodProducts: true }, kmpldc: { licenseNumber: 'KMPDC-ALS-001', isValid: true }, roadworthiness: { isRoadworthy: true } },
    { registrationNumber: 'KDB 002B', type: 'BLS', county: 'Nairobi', status: 'available', location: { type: 'Point', coordinates: [36.8100, -1.3000] }, provider: { name: 'EMS Kenya Fleet', contact: '0700395395', county: 'Nairobi' }, equipment: { defibrillator: false, oxygenLevel: 80, oxygenCylinders: 2, traumaKit: true, pulseOximeter: true, stretcher: true }, kmpldc: { licenseNumber: 'KMPDC-BLS-002', isValid: true }, roadworthiness: { isRoadworthy: true } },
    { registrationNumber: 'KDC 003C', type: 'BLS', county: 'Nairobi', status: 'available', location: { type: 'Point', coordinates: [36.8300, -1.2800] }, provider: { name: 'EMS Kenya Fleet', contact: '0700395395', county: 'Nairobi' }, equipment: { oxygenLevel: 90, oxygenCylinders: 2, traumaKit: true, pulseOximeter: true, stretcher: true }, kmpldc: { licenseNumber: 'KMPDC-BLS-003', isValid: true }, roadworthiness: { isRoadworthy: true } },
    { registrationNumber: 'KDE 004D', type: 'ALS', county: 'Nairobi', status: 'offline', location: { type: 'Point', coordinates: [36.7900, -1.3100] }, provider: { name: 'EMS Kenya Fleet', contact: '0700395395', county: 'Nairobi' }, equipment: { defibrillator: true, ventilator: true, oxygenLevel: 60, oxygenCylinders: 2, traumaKit: true }, kmpldc: { licenseNumber: 'KMPDC-ALS-004', isValid: true }, roadworthiness: { isRoadworthy: false } },
    { registrationNumber: 'MBK 005E', type: 'motorcycle', county: 'Turkana', status: 'available', location: { type: 'Point', coordinates: [35.5969, 3.1131] }, provider: { name: 'EMS Kenya Fleet - Rural', contact: '0700395395', county: 'Turkana' }, equipment: { traumaKit: true, pulseOximeter: true, oxygenLevel: 80, oxygenCylinders: 1 }, kmpldc: { licenseNumber: 'KMPDC-MOTO-005', isValid: true }, roadworthiness: { isRoadworthy: true } },
    { registrationNumber: 'MBK 006F', type: 'motorcycle', county: 'Garissa', status: 'available', location: { type: 'Point', coordinates: [42.2917, -0.4553] }, provider: { name: 'EMS Kenya Fleet - Rural', contact: '0700395395', county: 'Garissa' }, equipment: { traumaKit: true, pulseOximeter: true, oxygenLevel: 75, oxygenCylinders: 1 }, kmpldc: { licenseNumber: 'KMPDC-MOTO-006', isValid: true }, roadworthiness: { isRoadworthy: true } },
    { registrationNumber: 'KDG 007G', type: 'BLS', county: 'Mombasa', status: 'available', location: { type: 'Point', coordinates: [39.6682, -4.0435] }, provider: { name: 'EMS Kenya Fleet - Coast', contact: '0700395395', county: 'Mombasa' }, equipment: { oxygenLevel: 85, oxygenCylinders: 2, traumaKit: true, pulseOximeter: true, stretcher: true }, kmpldc: { licenseNumber: 'KMPDC-BLS-007', isValid: true }, roadworthiness: { isRoadworthy: true } }
  ];

  for (const a of ambulances) {
    // Assign demo EMT to Nairobi ambulances
    if (!a.emt && emtUser && a.county === 'Nairobi') {
      a.emt = emtUser._id;
    }
    const exists = await Ambulance.findOne({ registrationNumber: a.registrationNumber });
    if (!exists) { await Ambulance.create(a); console.log(`✅ Ambulance: ${a.registrationNumber} (${a.type})`); }
  }

  console.log('\n🎉 Seeding complete!\n');
  console.log('─── Login Credentials ───────────────────');
  console.log('SuperAdmin  : admin@ems.co.ke       / Admin@2026!');
  console.log('Admin       : manager@ems.co.ke     / Manager@2026!');
  console.log('EMT         : emt@ems.co.ke         / EMT@2026!');
  console.log('Patient     : patient@ems.co.ke     / Patient@2026!');
  console.log('─────────────────────────────────────────\n');

  mongoose.disconnect();
};

seedData().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
