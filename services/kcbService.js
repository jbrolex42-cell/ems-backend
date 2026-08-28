const axios = require("axios");

const KCB_TOKEN_ENDPOINT =
  process.env.KCB_TOKEN_ENDPOINT ||
  "https://accounts.buni.kcbgroup.com/oauth2/token";

const KCB_PAYMENT_ENDPOINT =
  process.env.KCB_PAYMENT_ENDPOINT ||
  "https://uat.buni.kcbgroup.com/mm/api/request/1.0.0/stkpush";


async function getKcbAccessToken() {
  const clientId = process.env.KCB_CLIENT_ID;
  const clientSecret = process.env.KCB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "KCB_CLIENT_ID or KCB_CLIENT_SECRET is missing."
    );
  }

  const credentials = Buffer.from(
    `${clientId}:${clientSecret}`
  ).toString("base64");

  try {
    const response = await axios.post(
      KCB_TOKEN_ENDPOINT,
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type":
            "application/x-www-form-urlencoded",
          Accept: "application/json",
        },

        timeout: 30000,
      }
    );

    const accessToken =
      response.data?.access_token;

    if (!accessToken) {
      console.error(
        "KCB TOKEN RESPONSE:",
        response.data
      );

      throw new Error(
        "KCB did not return an access token."
      );
    }

    return accessToken;
  } catch (error) {
    console.error(
      "KCB TOKEN ERROR:",
      error.response?.data ||
        error.message
    );

    throw new Error(
      error.response?.data?.error_description ||
        error.response?.data?.message ||
        error.message ||
        "Unable to obtain KCB access token."
    );
  }
}

async function initiateKcbPayment({
  phone,
  amount,
  reference,
  description,
}) {
  if (!KCB_PAYMENT_ENDPOINT) {
    throw new Error(
      "KCB_PAYMENT_ENDPOINT is missing."
    );
  }

  const accessToken =
    await getKcbAccessToken();


  const messageId =
    `EMS_${Date.now()}_${String(
      reference || ""
    ).slice(-10)}`;

  const normalizedPhone =
    String(phone || "")
      .replace(/\s+/g, "")
      .replace(/-/g, "")
      .replace(/^\+/, "");

  if (!/^2547\d{8}$/.test(normalizedPhone)) {
    throw new Error(
      "KCB requires a valid Safaricom M-PESA number in the format 2547XXXXXXXX."
    );
  }

  const paymentAmount =
    String(Math.round(Number(amount)));

  if (
    !paymentAmount ||
    Number(paymentAmount) < 1
  ) {
    throw new Error(
      "Invalid KCB payment amount."
    );
  }

  const invoiceNumber =
    String(reference || `EMS${Date.now()}`)
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(-12);

  const callbackUrl =
    process.env.KCB_CALLBACK_URL;

  if (!callbackUrl) {
    throw new Error(
      "KCB_CALLBACK_URL is missing."
    );
  }


  const requestBody = {
    phoneNumber: normalizedPhone,

    amount: paymentAmount,

    invoiceNumber,

    sharedShortCode: true,

    orgShortCode:
      process.env.KCB_ORG_SHORT_CODE || "",

    orgPassKey:
      process.env.KCB_ORG_PASS_KEY || "",

    callbackUrl,

    transactionDescription:
      String(
        description ||
          "EMS Donation"
      ).slice(0, 13),
  };

  const headers = {
    Authorization:
      `Bearer ${accessToken}`,

    "Content-Type":
      "application/json",

    Accept:
      "application/json",

    routeCode:
      process.env.KCB_ROUTE_CODE || "207",

    operation:
      "STKPush",

    messageId,
  };

  console.log(
    "KCB STK PUSH REQUEST:",
    {
      endpoint:
        KCB_PAYMENT_ENDPOINT,

      phoneNumber:
        normalizedPhone,

      amount:
        paymentAmount,

      invoiceNumber,

      callbackUrl,

      routeCode:
        headers.routeCode,

      operation:
        headers.operation,

      messageId,
    }
  );

  try {
    const response =
      await axios.post(
        KCB_PAYMENT_ENDPOINT,
        requestBody,
        {
          headers,
          timeout: 30000,
        }
      );

    console.log(
      "KCB STK PUSH RESPONSE:",
      response.data
    );


    const kcbResponse =
      response.data?.response ||
      response.data;

    return {
      success:
        String(
          kcbResponse?.ResponseCode
        ) === "0",

      transactionId:
        kcbResponse?.CheckoutRequestID ||
        kcbResponse?.MerchantRequestID ||
        "",

      requestId:
        kcbResponse?.MerchantRequestID ||
        "",

      reference:
        invoiceNumber,

      checkoutRequestId:
        kcbResponse?.CheckoutRequestID ||
        "",

      merchantRequestId:
        kcbResponse?.MerchantRequestID ||
        "",

      message:
        kcbResponse?.CustomerMessage ||
        kcbResponse?.ResponseDescription ||
        "KCB payment request submitted.",

      ResponseCode:
        kcbResponse?.ResponseCode,

      ResponseDescription:
        kcbResponse?.ResponseDescription,

      CustomerMessage:
        kcbResponse?.CustomerMessage,

      raw:
        response.data,
    };
  } catch (error) {
    console.error(
      "KCB STK PUSH ERROR:",
      error.response?.data ||
        error.message
    );

    const apiError =
      error.response?.data;

    throw new Error(
      apiError?.response?.ResponseDescription ||
        apiError?.response?.CustomerMessage ||
        apiError?.message ||
        apiError?.error_description ||
        error.message ||
        "Unable to initiate KCB M-PESA payment."
    );
  }
}

async function queryKcbPayment() {
  throw new Error(
    "KCB payment query endpoint has not been configured for MpesaExpressAPIService."
  );
}

module.exports = {
  getKcbAccessToken,
  initiateKcbPayment,
  queryKcbPayment,
};