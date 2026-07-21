const axios = require("axios");
const qs = require("querystring");

const sendSMS = async (to, message) => {
  try {
    const username = process.env.AT_USERNAME;
    const apiKey = process.env.AT_API_KEY;
    const senderId = process.env.AT_SENDER_ID;

    // Sandbox credentials only work against the sandbox endpoint.
    // Live credentials only work against the production endpoint.
    const AT_BASE_URL =
      username === "sandbox"
        ? "https://api.sandbox.africastalking.com/version1/messaging"
        : "https://api.africastalking.com/version1/messaging";

    console.log("Sending SMS...");
    console.log("Username:", username);
    console.log("Sender ID:", senderId);
    console.log("API Key exists:", !!apiKey);
    console.log("Endpoint:", AT_BASE_URL);

    const response = await axios.post(
      AT_BASE_URL,
      qs.stringify({
        username,
        to,
        message,
        from: senderId,
      }),
      {
        headers: {
          apiKey,
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
