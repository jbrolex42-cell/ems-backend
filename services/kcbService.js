import axios from "axios";

/*
 * KCB configuration.
 *
 * DO NOT hard-code credentials here.
 *
 * Put them in your environment variables.
 */

const KCB_ENVIRONMENT =
  process.env.KCB_ENVIRONMENT || "sandbox";

const KCB_TOKEN_URL =
  process.env.KCB_TOKEN_URL ||
  "https://accounts.buni.kcbgroup.com/oauth2/token";

const KCB_API_BASE_URL =
  process.env.KCB_API_BASE_URL || "";

/**
 * Get KCB OAuth access token.
 *
 * This implementation expects Client Credentials.
 *
 * KCB_CLIENT_ID
 * KCB_CLIENT_SECRET
 */
export async function getKcbAccessToken() {
  const clientId =
    process.env.KCB_CLIENT_ID;

  const clientSecret =
    process.env.KCB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "KCB_CLIENT_ID or KCB_CLIENT_SECRET is missing."
    );
  }

  const credentials = Buffer.from(
    `${clientId}:${clientSecret}`
  ).toString("base64");

  const response = await axios.post(
    KCB_TOKEN_URL,
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      timeout: 30000,
    }
  );

  if (!response.data?.access_token) {
    throw new Error(
      "KCB did not return an access token."
    );
  }

  return response.data.access_token;
}

/**
 * Generic KCB API request helper.
 *
 * The exact endpoint and payload depend on the
 * KCB API you subscribe to in Buni.
 */
export async function kcbRequest({
  method = "POST",
  endpoint,
  data = {},
}) {
  if (!KCB_API_BASE_URL) {
    throw new Error(
      "KCB_API_BASE_URL is missing."
    );
  }

  if (!endpoint) {
    throw new Error(
      "KCB API endpoint is missing."
    );
  }

  const accessToken =
    await getKcbAccessToken();

  const response = await axios({
    method,
    url: `${KCB_API_BASE_URL}${endpoint}`,
    data,
    headers: {
      Authorization:
        `Bearer ${accessToken}`,

      "Content-Type":
        "application/json",

      Accept:
        "application/json",
    },

    timeout: 30000,
  });

  return response.data;
}

/**
 * KCB payment initiation.
 *
 * IMPORTANT:
 * The exact payload must match the KCB API
 * you subscribe to.
 */
export async function initiateKcbPayment({
  phone,
  amount,
  reference,
  description,
}) {
  const endpoint =
    process.env.KCB_PAYMENT_ENDPOINT;

  if (!endpoint) {
    throw new Error(
      "KCB_PAYMENT_ENDPOINT is missing."
    );
  }

  return kcbRequest({
    method: "POST",

    endpoint,

    data: {
      phoneNumber: phone,
      amount: Number(amount),
      reference,
      description:
        description ||
        "EMS Kenya Donation",
    },
  });
}

/**
 * KCB transaction status.
 */
export async function queryKcbPayment(
  transactionId
) {
  const endpoint =
    process.env.KCB_QUERY_ENDPOINT;

  if (!endpoint) {
    throw new Error(
      "KCB_QUERY_ENDPOINT is missing."
    );
  }

  return kcbRequest({
    method: "POST",

    endpoint,

    data: {
      transactionId,
    },
  });
}