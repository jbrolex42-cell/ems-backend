const cron = require('node-cron');
const Membership = require('../models/Membership');
const User = require('../models/User');
const Ambulance = require('../models/Ambulance');
const Emergency = require('../models/Emergency');
const { sendSMS } = require('../utils/smsService');
const { sendEmail } = require('../utils/sendEmail');

/**
 * Run all scheduled background jobs
 */
const startCronJobs = () => {
  console.log('⏰ Starting cron jobs...');

  // ============================================================
  // Check and expire memberships — runs every day at midnight
  // ============================================================
  cron.schedule('0 0 * * *', async () => {
    try {
      const now = new Date();
      const expired = await Membership.updateMany(
        { status: 'active', expiryDate: { $lt: now } },
        { status: 'expired' }
      );

      if (expired.modifiedCount > 0) {
        console.log(`⏰ Expired ${expired.modifiedCount} memberships`);

        // Also update User.membership.status
        const expiredMemberships = await Membership.find({ status: 'expired', updatedAt: { $gte: new Date(Date.now() - 60000) } });
        for (const m of expiredMemberships) {
          await User.findByIdAndUpdate(m.user, { 'membership.status': 'expired' });
        }
      }
    } catch (e) {
      console.error('Membership expiry cron error:', e.message);
    }
  });

  // ============================================================
  // Send membership renewal reminders — 7 days before expiry (runs daily at 8AM)
  // ============================================================
  cron.schedule('0 8 * * *', async () => {
    try {
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const expiring = await Membership.find({
        status: 'active',
        expiryDate: { $gte: tomorrow, $lte: sevenDaysFromNow }
      }).populate('user', 'firstName lastName phone email');

      for (const m of expiring) {
        const daysLeft = Math.ceil((new Date(m.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
        const message = `EMS KENYA: Your ${m.type} membership #${m.memberNumber} expires in ${daysLeft} day(s). Renew now to maintain emergency cover: https://ems.co.ke/membership or call 0700 395 395`;

        try {
          if (m.user?.phone) await sendSMS(m.user.phone, message);
        } catch (e) {
          console.error(`Renewal SMS failed for ${m.memberNumber}:`, e.message);
        }
      }

      if (expiring.length > 0) console.log(`⏰ Sent ${expiring.length} renewal reminders`);
    } catch (e) {
      console.error('Renewal reminder cron error:', e.message);
    }
  });

  // ============================================================
  // Alert admin on stale emergencies — every 15 minutes
  // Stale = dispatched > 30 mins with no status update
  // ============================================================
  cron.schedule('*/15 * * * *', async () => {
    try {
      const threshold = new Date(Date.now() - 30 * 60 * 1000);
      const stale = await Emergency.find({
        status: 'dispatched',
        updatedAt: { $lt: threshold }
      }).populate('patient', 'firstName lastName phone');

      for (const em of stale) {
        console.warn(`⚠️  Stale emergency: ${em.emergencyId} | ${em.type} | ${em.patientLocation?.county}`);
        // In production: push to admin dashboard via socket + send alert SMS
      }
    } catch (e) {
      console.error('Stale emergency cron error:', e.message);
    }
  });

  // ============================================================
  // Mark ambulances offline if no ping in 6 hours — runs every hour
  // ============================================================
  cron.schedule('0 * * * *', async () => {
    try {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      const result = await Ambulance.updateMany(
        { status: 'available', lastPing: { $lt: sixHoursAgo } },
        { status: 'offline' }
      );
      if (result.modifiedCount > 0) {
        console.log(`⏰ Marked ${result.modifiedCount} ambulances offline (no ping)`);
      }
    } catch (e) {
      console.error('Ambulance offline cron error:', e.message);
    }
  });

  // ============================================================
  // SHA claim status check — every day at 10AM
  // ============================================================
  cron.schedule('0 10 * * *', async () => {
    try {
      const { checkClaimStatus } = require('../services/shaService');
      const pendingClaims = await Emergency.find({
        shaClaimId: { $exists: true },
        shaClaimStatus: { $in: ['submitted', 'pending'] }
      }).limit(50);

      for (const em of pendingClaims) {
        try {
          const result = await checkClaimStatus(em.shaClaimId);
          if (result.success && result.status !== em.shaClaimStatus) {
            await Emergency.findByIdAndUpdate(em._id, { shaClaimStatus: result.status });
            console.log(`SHA claim ${em.shaClaimId} updated to ${result.status}`);
          }
        } catch (e) {
          // Non-fatal — continue with next
        }
      }
    } catch (e) {
      console.error('SHA claim check cron error:', e.message);
    }
  });

  console.log('✅ All cron jobs scheduled');
};

module.exports = { startCronJobs };
