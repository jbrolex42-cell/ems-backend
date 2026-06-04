const { sendEmail, emailTemplates } = require('../utils/sendEmail');
const { sendSMS, smsTemplates } = require('../utils/smsService');

/**
 * Centralized notification service
 * Handles SMS, email, and push notifications for all EMS events
 */

/**
 * Notify patient when emergency is confirmed and responder dispatched
 */
const notifyEmergencyConfirmed = async (patient, emergency, eta) => {
  const results = { sms: false, email: false };

  // SMS — primary channel in Kenya
  try {
    await sendSMS(
      patient.phone,
      smsTemplates.emergencyConfirmed(emergency.emergencyId, eta)
    );
    results.sms = true;
  } catch (e) {
    console.error('SMS notify failed:', e.message);
  }

  // Email — secondary channel
  try {
    if (patient.email) {
      await sendEmail({
        to: patient.email,
        subject: `🚨 EMS Kenya — Responder Dispatched | ${emergency.emergencyId}`,
        html: emailTemplates.emergencyAlert(patient.firstName, emergency.emergencyId, 'dispatched')
      });
      results.email = true;
    }
  } catch (e) {
    console.error('Email notify failed:', e.message);
  }

  return results;
};

/**
 * Notify patient on status change
 */
const notifyStatusChange = async (patient, emergency, newStatus) => {
  const statusMessages = {
    enroute: `EMS KENYA: Responder is now en route to you. Emergency #${emergency.emergencyId}. Stay calm, help is coming.`,
    on_scene: `EMS KENYA: Your responder has arrived. Emergency #${emergency.emergencyId}. Please cooperate with the EMT.`,
    transporting: `EMS KENYA: You are being transported to hospital. Emergency #${emergency.emergencyId}.`,
    at_hospital: `EMS KENYA: Arrived at hospital. Emergency #${emergency.emergencyId}. Family contact: ${process.env.SUPPORT_PHONE || '0700 395 395'}`,
    completed: `EMS KENYA: Emergency #${emergency.emergencyId} completed. Rate your experience: https://ems.co.ke/rate/${emergency._id}`
  };

  if (statusMessages[newStatus] && patient.phone) {
    try {
      await sendSMS(patient.phone, statusMessages[newStatus]);
    } catch (e) {
      console.error('Status SMS failed:', e.message);
    }
  }
};

/**
 * Notify emergency contacts when SOS is triggered
 */
const notifyEmergencyContacts = async (contacts, patient, emergency) => {
  const message = `URGENT: ${patient.firstName} ${patient.lastName} has triggered an emergency via EMS Kenya. Emergency #${emergency.emergencyId}. Location: ${emergency.patientLocation?.county || 'Kenya'}. Call ${patient.phone} or EMS: 0700 395 395`;

  for (const contact of contacts) {
    if (contact.phone) {
      try {
        await sendSMS(contact.phone, message);
      } catch (e) {
        console.error(`Contact SMS to ${contact.phone} failed:`, e.message);
      }
    }
  }
};

/**
 * Notify EMT of new dispatch assignment
 */
const notifyEMTDispatch = async (emt, emergency, patient) => {
  const message = `EMS DISPATCH: New ${emergency.severity.toUpperCase()} ${emergency.type} emergency. Patient: ${patient.firstName} ${patient.lastName} | ${patient.phone}. Location: ${emergency.patientLocation?.what3words || emergency.patientLocation?.address || emergency.patientLocation?.county}. Emergency ID: ${emergency.emergencyId}`;

  try {
    if (emt.phone) await sendSMS(emt.phone, message);
  } catch (e) {
    console.error('EMT dispatch SMS failed:', e.message);
  }
};

/**
 * Send membership confirmation
 */
const notifyMembershipActivated = async (user, membership) => {
  try {
    await sendSMS(
      user.phone,
      smsTemplates.membershipActive(
        user.firstName,
        membership.memberNumber,
        new Date(membership.expiryDate).toLocaleDateString('en-KE')
      )
    );
  } catch (e) {
    console.error('Membership SMS failed:', e.message);
  }

  try {
    await sendEmail({
      to: user.email,
      subject: `✅ EMS Kenya Membership Activated — ${membership.memberNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; padding: 40px; border-radius: 12px;">
          <h1 style="color: #FF3B30;">🎉 Membership Activated!</h1>
          <p>Hi ${user.firstName},</p>
          <p style="color: #ccc;">Your <strong style="color: #fff;">${membership.type}</strong> membership is now active.</p>
          <div style="background: #1a1a1a; border: 1px solid #333; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #999; margin: 0 0 8px;">Member Number</p>
            <p style="color: #FF3B30; font-size: 20px; font-weight: bold; margin: 0;">${membership.memberNumber}</p>
            <hr style="border-color: #333; margin: 12px 0;">
            <p style="color: #999; margin: 0 0 4px; font-size: 12px;">Valid until</p>
            <p style="color: #fff; margin: 0;">${new Date(membership.expiryDate).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <p style="color: #ccc;">Emergency number: <strong>0700 395 395</strong> | Toll Free: <strong>1514</strong></p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">EMS Kenya — Regulated by KMPDC | SHA Integrated</p>
        </div>
      `
    });
  } catch (e) {
    console.error('Membership email failed:', e.message);
  }
};

/**
 * Alert admin of critical emergency
 */
const notifyAdminCritical = async (emergency, patient) => {
  // Could also push to Slack/WhatsApp Business in production
  try {
    if (process.env.ADMIN_ALERT_PHONE) {
      await sendSMS(
        process.env.ADMIN_ALERT_PHONE,
        `⚠️ EMS ADMIN ALERT: CRITICAL ${emergency.type} in ${emergency.patientLocation?.county}. Patient: ${patient.firstName} ${patient.lastName}. ID: ${emergency.emergencyId}. No responder assigned yet.`
      );
    }
  } catch (e) {
    console.error('Admin alert failed:', e.message);
  }
};

module.exports = {
  notifyEmergencyConfirmed,
  notifyStatusChange,
  notifyEmergencyContacts,
  notifyEMTDispatch,
  notifyMembershipActivated,
  notifyAdminCritical
};
