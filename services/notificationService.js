// services/notificationService.js
const Notification = require('../models/Notification');
const User         = require('../models/User');

// ─────────────────────────────────────────────────────────────────────────────
// LOW-LEVEL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save a notification to DB and emit it to a socket room.
 */
async function notifyUser(io, recipientId, payload, socketRoom, socketEvent) {
  try {
    const notif = await Notification.create({
      recipient: recipientId,
      type:      payload.type,
      title:     payload.title,
      message:   payload.message,
      meta:      payload.meta,
    });
    const room  = socketRoom  || `user_${recipientId}`;
    const event = socketEvent || payload.type;
    if (io) io.to(room).emit(event, { ...notif.toObject(), read: false });
    return notif;
  } catch (err) {
    console.error('[NotificationService] notifyUser error:', err.message);
  }
}

/**
 * Notify all admins + superadmins (DB insert + socket broadcast to admin_room).
 */
async function notifyAdmins(io, payload) {
  try {
    const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } }, '_id').lean();
    if (admins.length) {
      await Notification.insertMany(
        admins.map(a => ({
          recipient: a._id,
          type:      payload.type,
          title:     payload.title,
          message:   payload.message,
          meta:      payload.meta,
        })),
        { ordered: false }
      );
    }
    if (io) {
      io.to('admin_room').emit(payload.type, {
        type:      payload.type,
        title:     payload.title,
        message:   payload.message,
        meta:      payload.meta,
        createdAt: new Date().toISOString(),
        read:      false,
        _id:       Date.now(),
      });
    }
  } catch (err) {
    console.error('[NotificationService] notifyAdmins error:', err.message);
  }
}

/**
 * Notify a specific EMT (DB + socket to emt_{emtId} room).
 */
async function notifyEmt(io, emtId, payload) {
  return notifyUser(io, emtId, payload, `emt_${emtId}`, payload.type);
}

/**
 * Notify the patient on an emergency (DB + socket to emergency_{emergencyId} room).
 */
async function notifyPatient(io, patientId, emergencyId, payload) {
  return notifyUser(io, patientId, payload, `emergency_${emergencyId}`, payload.type);
}


// ─────────────────────────────────────────────────────────────────────────────
// NAMED HELPERS — used by emergencyController.js
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Confirm emergency receipt to patient + send SMS.
 * Called right after Emergency.create().
 */
async function notifyEmergencyConfirmed(patientUser, emergency, etaMinutes) {
  try {
    // In-app notification (no io needed — patient gets it next time panel opens)
    await Notification.create({
      recipient: patientUser._id,
      type:      'emergency_dispatched',
      title:     '🚑 Emergency Request Received',
      message:   `Your ${emergency.type} emergency has been received. ${
        etaMinutes < 60
          ? `Estimated response: ${etaMinutes} min.`
          : 'Dispatch is locating the nearest unit.'
      }`,
      meta: { emergencyId: emergency._id },
    });

    // SMS (best-effort — don't crash if SMS fails)
    try {
      const { sendSMS } = require('../utils/smsService');
      await sendSMS(
        patientUser.phone,
        `EMS Kenya: Emergency received. Ref: ${emergency.emergencyId}. ` +
        `ETA: ~${etaMinutes} min. Track: https://emergencymedicalsystem.vercel.app/tracking/${emergency._id}. ` +
        `Helpline: 1514`
      );
    } catch (smsErr) {
      console.warn('[notifyEmergencyConfirmed] SMS skipped:', smsErr.message);
    }
  } catch (err) {
    console.error('[notifyEmergencyConfirmed] error:', err.message);
  }
}

/**
 * Notify patient of a status change on their emergency.
 * Called from updateStatus().
 */
async function notifyStatusChange(patientUser, emergency, newStatus) {
  const titleMap = {
    dispatched:   '🚑 Responder Dispatched',
    enroute:      '🛣️ Responder En Route',
    on_scene:     '📍 Responder On Scene',
    transporting: '🏥 Transporting to Hospital',
    at_hospital:  '✅ Arrived at Hospital',
    completed:    '🏁 Emergency Completed',
    cancelled:    '❌ Emergency Cancelled',
  };
  const msgMap = {
    dispatched:   'A responder has been dispatched to your location.',
    enroute:      'Your responder is on the way.',
    on_scene:     'The responder has arrived at your location.',
    transporting: 'You are being transported to hospital.',
    at_hospital:  'You have arrived at the hospital.',
    completed:    `Emergency ${emergency.emergencyId} has been resolved.`,
    cancelled:    `Emergency ${emergency.emergencyId} has been cancelled.`,
  };

  try {
    await Notification.create({
      recipient: patientUser._id,
      type:      'emergency_update',
      title:     titleMap[newStatus] || '📋 Emergency Update',
      message:   msgMap[newStatus]   || `Status changed to ${newStatus}`,
      meta:      { emergencyId: emergency._id, status: newStatus },
    });
  } catch (err) {
    console.error('[notifyStatusChange] error:', err.message);
  }
}

/**
 * Notify emergency contacts by SMS when a patient requests help.
 * Called from createEmergency().
 */
async function notifyEmergencyContacts(contacts, patientUser, emergency) {
  try {
    const { sendSMS } = require('../utils/smsService');
    const msg =
      `EMS Kenya ALERT: ${patientUser.firstName} ${patientUser.lastName} ` +
      `has requested emergency assistance (${emergency.type}). ` +
      `Ref: ${emergency.emergencyId}. Helpline: 1514`;

    await Promise.allSettled(
      contacts
        .filter(c => c.phone)
        .map(c => sendSMS(c.phone, msg))
    );
  } catch (err) {
    console.error('[notifyEmergencyContacts] error:', err.message);
  }
}

/**
 * Notify an EMT they have been dispatched to an emergency.
 * Called from createEmergency() when a unit is auto-dispatched.
 */
async function notifyEMTDispatch(emtUser, emergency, patientUser) {
  try {
    await Notification.create({
      recipient: emtUser._id,
      type:      'new_assignment',
      title:     '📍 New Dispatch Assignment',
      message:   `${emergency.type} emergency — ${emergency.patientLocation?.county || 'unknown county'}. ` +
                 `Patient: ${patientUser.firstName} ${patientUser.lastName}. ` +
                 `Severity: ${emergency.severity}.`,
      meta: { emergencyId: emergency._id },
    });

    // SMS to EMT (best-effort)
    try {
      const { sendSMS } = require('../utils/smsService');
      await sendSMS(
        emtUser.phone,
        `EMS Dispatch: New ${emergency.severity} ${emergency.type} case. ` +
        `Patient: ${patientUser.firstName} ${patientUser.lastName}. ` +
        `Ref: ${emergency.emergencyId}. Open app for details.`
      );
    } catch (smsErr) {
      console.warn('[notifyEMTDispatch] SMS skipped:', smsErr.message);
    }
  } catch (err) {
    console.error('[notifyEMTDispatch] error:', err.message);
  }
}

/**
 * Notify all admins of a critical emergency with no available units.
 * Called from createEmergency() when dispatchBestUnit() returns null.
 */
async function notifyAdminCritical(emergency, patientUser) {
  try {
    const admins = await User.find({ role: { $in: ['admin', 'superadmin'] } }, '_id').lean();
    if (admins.length) {
      await Notification.insertMany(
        admins.map(a => ({
          recipient: a._id,
          type:      'new_emergency',
          title:     `🚨 CRITICAL — No Units Available`,
          message:   `${emergency.type} emergency in ${emergency.patientLocation?.county}. ` +
                     `Patient: ${patientUser.firstName} ${patientUser.lastName}. ` +
                     `No ambulance auto-dispatched — manual assignment needed.`,
          meta: { emergencyId: emergency._id, severity: 'critical' },
        })),
        { ordered: false }
      );
    }
  } catch (err) {
    console.error('[notifyAdminCritical] error:', err.message);
  }
}


module.exports = {
  // Low-level (used by other controllers)
  notifyUser,
  notifyAdmins,
  notifyEmt,
  notifyPatient,
  // Named (used by emergencyController.js)
  notifyEmergencyConfirmed,
  notifyStatusChange,
  notifyEmergencyContacts,
  notifyEMTDispatch,
  notifyAdminCritical,
};
