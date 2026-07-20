const axios = require("axios");
const qs = require("querystring");

const sendSMS = async (to, message) => {
  try {
    console.log("Sending SMS...");
    console.log("Username:", process.env.AT_USERNAME);
    console.log("Sender ID:", process.env.AT_SENDER_ID);
    console.log("API Key exists:", !!process.env.AT_API_KEY);

    const response = await axios.post(
      "https://api.africastalking.com/version1/messaging",
      qs.stringify({
        username: process.env.AT_USERNAME,
        to,
        message,
        // Remove this line temporarily while testing
        // from: process.env.AT_SENDER_ID,
      }),
      {
        headers: {
          apiKey: process.env.AT_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        timeout: 10000,
      }
    );

    console.log("SMS sent successfully:", response.data);
    return response.data;

  } catch (error) {
    console.error("========== SMS ERROR ==========");
    console.error("Status:", error.response?.status);
    console.error("Response:", error.response?.data);
    console.error("Message:", error.message);
    console.error("==============================");

    return null;
  }
};

module.exports = { sendSMS };