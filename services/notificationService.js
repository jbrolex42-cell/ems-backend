// services/notificationService.js
/**
 * Central helper for creating DB notifications AND emitting real-time
 * socket events to the right room(s).
 *
 * Usage:
 *   const { notify, notifyAdmins, notifyUser } = require('./notificationService');
 *
 *   // From any route/controller that has `req.app.get('io')`:
 *   await notifyUser(io, userId, {
 *     type: 'emergency_dispatched',
 *     title: '🚑 Ambulance Dispatched',
 *     message: 'Unit KAC-123 ETA 8 min',
 *   });
 *
 *   await notifyAdmins(io, {
 *     type: 'new_emergency',
 *     title: '🚨 New Critical Emergency',
 *     message: 'Cardiac arrest in Nairobi CBD',
 *     meta: { county: 'Nairobi', severity: 'critical' },
 *   });
 */

const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Create a notification in the DB and emit it via socket.
 *
 * @param {import('socket.io').Server} io
 * @param {string|ObjectId} recipientId  – User _id
 * @param {object} payload
 * @param {string} payload.type
 * @param {string} payload.title
 * @param {string} payload.message
 * @param {object} [payload.meta]
 * @param {string} [socketRoom]  – socket room to emit to (optional, defaults to user-specific room)
 * @param {string} [socketEvent] – socket event name (defaults to payload.type)
 */
async function notifyUser(io, recipientId, payload, socketRoom, socketEvent) {
  try {
    const notif = await Notification.create({
      recipient: recipientId,
      type:    payload.type,
      title:   payload.title,
      message: payload.message,
      meta:    payload.meta,
    });

    const room  = socketRoom  || `user_${recipientId}`;
    const event = socketEvent || payload.type;

    if (io) {
      io.to(room).emit(event, {
        ...notif.toObject(),
        // convenience fields used by the frontend hook
        _id:       notif._id,
        createdAt: notif.createdAt,
        read:      false,
      });
    }

    return notif;
  } catch (err) {
    console.error('[NotificationService] notifyUser error:', err.message);
  }
}

/**
 * Notify all admins and superadmins (DB + socket broadcast to admin_room).
 */
async function notifyAdmins(io, payload) {
  try {
    const admins = await User.find(
      { role: { $in: ['admin', 'superadmin'] } },
      '_id'
    ).lean();

    const docs = admins.map(a => ({
      recipient: a._id,
      type:    payload.type,
      title:   payload.title,
      message: payload.message,
      meta:    payload.meta,
    }));

    if (docs.length) await Notification.insertMany(docs, { ordered: false });

    if (io) {
      io.to('admin_room').emit(payload.type, {
        type:      payload.type,
        title:     payload.title,
        message:   payload.message,
        meta:      payload.meta,
        createdAt: new Date().toISOString(),
        read:      false,
        _id:       Date.now(), // temporary client-side id until DB sync
      });
    }
  } catch (err) {
    console.error('[NotificationService] notifyAdmins error:', err.message);
  }
}

/**
 * Notify a specific EMT (DB + socket emit to emt_{emtId} room).
 */
async function notifyEmt(io, emtId, payload) {
  return notifyUser(io, emtId, payload, `emt_${emtId}`, payload.type);
}

/**
 * Notify the patient attached to an emergency.
 * Emits to emergency_{emergencyId} room so the patient's tracking page also updates.
 */
async function notifyPatient(io, patientId, emergencyId, payload) {
  return notifyUser(
    io,
    patientId,
    payload,
    `emergency_${emergencyId}`,
    payload.type
  );
}

module.exports = { notifyUser, notifyAdmins, notifyEmt, notifyPatient };
