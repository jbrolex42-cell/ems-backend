import axios from "axios";

const isProduction =
  process.env.MPESA_ENVIRONMENT === "production";

const BASE_URL = isProduction
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

/**
 * Get OAuth access token from Safaricom Daraja.
 */
export async function getAccessToken() {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error(
      "MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET is missing."
    );
  }

  const credentials = Buffer.from(
    `${consumerKey}:${consumerSecret}`
  ).toString("base64");

  const response = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    }
  );

  return response.data.access_token;
}

/**
 * Generate the password required by STK Push.
 */
function generatePassword(timestamp) {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;

  if (!shortcode || !passkey) {
    throw new Error(
      "MPESA_SHORTCODE or MPESA_PASSKEY is missing."
    );
  }

  return Buffer.from(
    `${shortcode}${passkey}${timestamp}`
  ).toString("base64");
}

/**
 * Generate timestamp in YYYYMMDDHHmmss format.
 */
function generateTimestamp() {
  const now = new Date();

  const pad = (value) =>
    String(value).padStart(2, "0");

  return (
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

/**
 * Initiate M-Pesa Express / STK Push.
 */
export async function initiateSTKPush({
  phone,
  amount,
  accountReference,
  transactionDesc,
}) {
  const accessToken = await getAccessToken();

  const timestamp = generateTimestamp();

  const password = generatePassword(timestamp);

  const shortcode = process.env.MPESA_SHORTCODE;

  const callbackUrl =
    process.env.MPESA_CALLBACK_URL;

  if (!callbackUrl) {
    throw new Error(
      "MPESA_CALLBACK_URL is missing."
    );
  }

  const response = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: shortcode,

      Password: password,

      Timestamp: timestamp,

      TransactionType: "CustomerPayBillOnline",

      Amount: Number(amount),

      PartyA: phone,

      PartyB: shortcode,

      PhoneNumber: phone,

      CallBackURL: callbackUrl,

      AccountReference: accountReference,

      TransactionDesc: transactionDesc,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

/**
 * Query an STK Push transaction.
 */
export async function querySTKPush(checkoutRequestId) {
  const accessToken = await getAccessToken();

  const timestamp = generateTimestamp();

  const password = generatePassword(timestamp);

  const shortcode = process.env.MPESA_SHORTCODE;

  const response = await axios.post(
    `${BASE_URL}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: shortcode,

      Password: password,

      Timestamp: timestamp,

      CheckoutRequestID: checkoutRequestId,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}