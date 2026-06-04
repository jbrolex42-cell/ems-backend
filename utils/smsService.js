// Africa's Talking SMS Integration
const sendSMS = async (to, message) => {
  try {
    // Africa's Talking API
    const axios = require('axios');
    const qs = require('querystring');

    const response = await axios.post(
      'https://api.africastalking.com/version1/messaging',
      qs.stringify({
        username: process.env.AT_USERNAME,
        to: to,
        message: message,
        from: process.env.AT_SENDER_ID
      }),
      {
        headers: {
          'apiKey': process.env.AT_API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('SMS Error:', error.message);
  }
};

const smsTemplates = {
  emergencyConfirmed: (id, eta) =>
    `EMS KENYA: Emergency #${id} confirmed. Responder dispatched. ETA: ${eta} mins. Track: https://ems.co.ke/track/${id}`,
  responderEnRoute: (name, plate) =>
    `EMS KENYA: ${name} is on the way in ambulance ${plate}. Stay calm. Do not move the patient if not necessary.`,
  passwordReset: (otp) =>
    `EMS KENYA: Your OTP is ${otp}. Valid for 10 mins. Do not share this code.`,
  membershipActive: (name, number, expiry) =>
    `EMS KENYA: Hi ${name}! Your membership #${number} is active until ${expiry}. Emergency: 0700 395 395`
};

module.exports = { sendSMS, smsTemplates };
