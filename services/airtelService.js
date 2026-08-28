import axios from "axios";

const AIRTEL_ENVIRONMENT =
  process.env.AIRTEL_ENVIRONMENT ||
  "sandbox";

const AIRTEL_BASE_URL =
  AIRTEL_ENVIRONMENT === "production"
    ? "https://openapi.airtel.africa"
    : "https://openapiuat.airtel.africa";

/**
 * Get Airtel Money OAuth token.
 */
export async function getAirtelAccessToken() {
  const clientId =
    process.env.AIRTEL_CLIENT_ID;

  const clientSecret =
    process.env.AIRTEL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "AIRTEL_CLIENT_ID or AIRTEL_CLIENT_SECRET is missing."
    );
  }

  const response = await axios.post(
    `${AIRTEL_BASE_URL}/auth/oauth2/token`,

    {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    },

    {
      headers: {
        "Content-Type":
          "application/json",
      },

      timeout: 30000,
    }
  );

  if (!response.data?.access_token) {
    throw new Error(
      "Airtel did not return an access token."
    );
  }

  return response.data.access_token;
}

/**
 * Initiate Airtel Money payment.
 */
export async function initiateAirtelPayment({
  phone,
  amount,
  reference,
}) {
  const accessToken =
    await getAirtelAccessToken();

  const country =
    process.env.AIRTEL_COUNTRY || "KE";

  const currency =
    process.env.AIRTEL_CURRENCY || "KES";

  const response = await axios.post(
    `${AIRTEL_BASE_URL}/merchant/v1/payments/`,

    {
      reference,
      subscriber: {
        country,
        currency,
        msisdn: phone.replace(
          /^254/,
          ""
        ),
      },

      transaction: {
        amount: Number(amount),
        country,
        currency,
        id: reference,
      },
    },

    {
      headers: {
        Authorization:
          `Bearer ${accessToken}`,

        "Content-Type":
          "application/json",

        Accept:
          "application/json",

        "X-Country": country,

        "X-Currency": currency,
      },

      timeout: 30000,
    }
  );

  return response.data;
}