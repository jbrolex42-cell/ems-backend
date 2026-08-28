import Donation from "../models/Donation.js";

import {
initiateSTKPush,
querySTKPush,
} from "../services/mpesaService.js";

import {
initiateKcbPayment,
} from "../services/kcbService.js";

import {
initiateAirtelPayment,
} from "../services/airtelService.js";

/**

* Normalize Kenyan phone numbers.
  */
  function normalizePhone(phone) {
  let value = String(phone || "")
  .trim()
  .replace(/\s+/g, "");

if (value.startsWith("+254")) {
value = value.substring(1);
}

if (value.startsWith("0")) {
value = `254${value.substring(1)}`;
}

return value;
}

/**

* Validate donation amount.
  */
  function validateAmount(amount) {
  const value = Number(amount);

if (!Number.isFinite(value) || value < 10) {
return null;
}

return Math.round(value);
}

/**

* Create a donation record.
  */
  async function createDonationRecord({
  name,
  email,
  phone,
  amount,
  purpose,
  paymentMethod,
  }) {
  return Donation.create({
  donorName: name?.trim() || "Anonymous",
  email: email?.trim() || "",
  phone: normalizePhone(phone),
  amount,
  purpose: purpose?.trim() || "Emergency Response",
  paymentMethod,
  status: "processing",
  });
  }

/**

* ---
* CREATE DONATION
* ---
*
* POST /api/donations
*
* Body:
*
* {
* name,
* email,
* phone,
* amount,
* purpose,
* paymentMethod
* }
*
* paymentMethod:
* mpesa
* kcb
* airtel
  */
  export async function createDonation(req, res) {
  try {
  const {
  name,
  email,
  phone,
  amount,
  purpose,
  paymentMethod = "mpesa",
  } = req.body;

```
const donationAmount = validateAmount(amount);
```

```
if (!donationAmount) {
  return res.status(400).json({
    success: false,
    message: "Donation amount must be at least KSh 10.",
  });
}

if (!phone) {
  return res.status(400).json({
    success: false,
    message: "Phone number is required.",
  });
}

const normalizedPhone = normalizePhone(phone);

if (!/^254(7|1)\d{8}$/.test(normalizedPhone)) {
  return res.status(400).json({
    success: false,
    message: "Please enter a valid Kenyan phone number.",
  });
}

const supportedMethods = [
  "mpesa",
  "kcb",
  "airtel",
];

if (!supportedMethods.includes(paymentMethod)) {
  return res.status(400).json({
    success: false,
    message: "Unsupported payment method.",
  });
}

/**
 * -----------------------------------------------------
 * M-PESA
 * -----------------------------------------------------
 */
if (paymentMethod === "mpesa") {
  const donation = await createDonationRecord({
    name,
    email,
    phone: normalizedPhone,
    amount: donationAmount,
    purpose,
    paymentMethod: "mpesa",
  });

  const accountReference =
    process.env.MPESA_ACCOUNT_REFERENCE ||
    "1296571637";

  try {
    const mpesaResponse = await initiateSTKPush({
      phone: normalizedPhone,
      amount: donationAmount,
      accountReference,
      transactionDesc: "EMS Kenya Donation",
    });

    donation.merchantRequestId =
      mpesaResponse.MerchantRequestID || "";

    donation.checkoutRequestId =
      mpesaResponse.CheckoutRequestID || "";

    donation.resultDescription =
      mpesaResponse.ResponseDescription || "";

    if (
      String(mpesaResponse.ResponseCode) === "0"
    ) {
      donation.status = "processing";
    } else {
      donation.status = "failed";
    }

    await donation.save();

    return res.status(200).json({
      success:
        String(mpesaResponse.ResponseCode) === "0",

      message:
        mpesaResponse.CustomerMessage ||
        mpesaResponse.ResponseDescription ||
        "M-PESA request submitted.",

      paymentMethod: "mpesa",

      donation: {
        id: donation._id,
        amount: donation.amount,
        status: donation.status,
        paymentMethod: donation.paymentMethod,
      },

      donationId: donation._id,

      checkoutRequestId:
        donation.checkoutRequestId,

      merchantRequestId:
        donation.merchantRequestId,

      status: donation.status,
    });
  } catch (error) {
    donation.status = "failed";
    donation.resultDescription =
      error.response?.data?.errorMessage ||
      error.message ||
      "Unable to initiate M-PESA payment.";

    await donation.save();

    throw error;
  }
}

/**
 * -----------------------------------------------------
 * KCB
 * -----------------------------------------------------
 */
if (paymentMethod === "kcb") {
  const donation = await createDonationRecord({
    name,
    email,
    phone: normalizedPhone,
    amount: donationAmount,
    purpose,
    paymentMethod: "kcb",
  });

  try {
    const kcbResponse = await initiateKcbPayment({
      phone: normalizedPhone,
      amount: donationAmount,
      reference: String(donation._id),
      description: "EMS Kenya Donation",
    });

    /**
     * Store KCB transaction/reference information.
     *
     * Your KCB service should return one or more of:
     *
     * transactionId
     * reference
     * requestId
     */
    donation.kcbTransactionId =
      kcbResponse.transactionId ||
      kcbResponse.TransactionId ||
      kcbResponse.requestId ||
      "";

    donation.kcbReference =
      kcbResponse.reference ||
      kcbResponse.Reference ||
      "";

    donation.resultDescription =
      kcbResponse.message ||
      kcbResponse.ResponseDescription ||
      "";

    donation.status =
      kcbResponse.success === false
        ? "failed"
        : "processing";

    await donation.save();

    return res.status(200).json({
      success: donation.status !== "failed",

      message:
        kcbResponse.message ||
        "KCB payment request submitted.",

      paymentMethod: "kcb",

      donation: {
        id: donation._id,
        amount: donation.amount,
        status: donation.status,
        paymentMethod: donation.paymentMethod,
        reference:
          donation.kcbReference ||
          donation.kcbTransactionId,
      },

      donationId: donation._id,

      reference:
        donation.kcbReference ||
        donation.kcbTransactionId,

      status: donation.status,
    });
  } catch (error) {
    donation.status = "failed";

    donation.resultDescription =
      error.response?.data?.message ||
      error.response?.data?.errorMessage ||
      error.message ||
      "Unable to initiate KCB payment.";

    await donation.save();

    throw error;
  }
}

/**
 * -----------------------------------------------------
 * AIRTEL MONEY
 * -----------------------------------------------------
 */
if (paymentMethod === "airtel") {
  const donation = await createDonationRecord({
    name,
    email,
    phone: normalizedPhone,
    amount: donationAmount,
    purpose,
    paymentMethod: "airtel",
  });

  try {
    const airtelResponse =
      await initiateAirtelPayment({
        phone: normalizedPhone,
        amount: donationAmount,
        reference: String(donation._id),
        description: "EMS Kenya Donation",
      });

    /**
     * Store Airtel transaction information.
     */
    donation.airtelTransactionId =
      airtelResponse.transactionId ||
      airtelResponse.transaction?.id ||
      airtelResponse.id ||
      "";

    donation.airtelReference =
      airtelResponse.reference ||
      airtelResponse.transaction?.reference ||
      "";

    donation.resultDescription =
      airtelResponse.message ||
      airtelResponse.statusMessage ||
      "";

    donation.status =
      airtelResponse.success === false
        ? "failed"
        : "processing";

    await donation.save();

    return res.status(200).json({
      success: donation.status !== "failed",

      message:
        airtelResponse.message ||
        "Airtel Money payment request submitted.",

      paymentMethod: "airtel",

      donation: {
        id: donation._id,
        amount: donation.amount,
        status: donation.status,
        paymentMethod: donation.paymentMethod,
        reference:
          donation.airtelReference ||
          donation.airtelTransactionId,
      },

      donationId: donation._id,

      reference:
        donation.airtelReference ||
        donation.airtelTransactionId,

      status: donation.status,
    });
  } catch (error) {
    donation.status = "failed";

    donation.resultDescription =
      error.response?.data?.message ||
      error.response?.data?.errorMessage ||
      error.message ||
      "Unable to initiate Airtel Money payment.";

    await donation.save();

    throw error;
  }
}

return res.status(400).json({
  success: false,
  message: "Unsupported payment method.",
});
```

} catch (error) {
console.error(
"CREATE DONATION ERROR:",
error.response?.data || error.message
);

```
return res.status(500).json({
  success: false,
  message:
    error.response?.data?.message ||
    error.response?.data?.errorMessage ||
    error.message ||
    "Unable to initiate payment.",
});
```

}
}

/**

* ---
* M-PESA CALLBACK
* ---

*/
export async function mpesaCallback(req, res) {
try {
console.log(
"M-PESA CALLBACK:",
JSON.stringify(req.body, null, 2)
);

```
const stkCallback =
  req.body?.Body?.stkCallback;

if (!stkCallback) {
  return res.json({
    ResultCode: 0,
    ResultDesc: "Accepted",
  });
}

const checkoutRequestId =
  stkCallback.CheckoutRequestID;

const resultCode =
  String(stkCallback.ResultCode);

const resultDesc =
  stkCallback.ResultDesc || "";

const donation =
  await Donation.findOne({
    checkoutRequestId,
  });

if (!donation) {
  console.warn(
    "Donation not found for CheckoutRequestID:",
    checkoutRequestId
  );

  return res.json({
    ResultCode: 0,
    ResultDesc: "Accepted",
  });
}

donation.callbackReceived = true;
donation.resultCode = resultCode;
donation.resultDescription = resultDesc;
donation.callbackData = stkCallback;

if (resultCode === "0") {
  const metadata =
    stkCallback.CallbackMetadata?.Item || [];

  const getMetadata = (name) =>
    metadata.find(
      (item) => item.Name === name
    )?.Value;

  donation.mpesaReceiptNumber =
    getMetadata("MpesaReceiptNumber") || "";

  donation.transactionDate =
    String(
      getMetadata("TransactionDate") || ""
    );

  donation.status = "completed";
} else {
  donation.status =
    resultCode === "1032"
      ? "cancelled"
      : "failed";
}

await donation.save();

console.log(
  "DONATION UPDATED:",
  donation._id,
  donation.status
);

return res.json({
  ResultCode: 0,
  ResultDesc: "Accepted",
});
```

} catch (error) {
console.error(
"M-PESA CALLBACK ERROR:",
error.message
);

```
return res.json({
  ResultCode: 0,
  ResultDesc: "Accepted",
});
```

}
}

/**

* ---
* DONATION STATUS
* ---

*/
export async function getDonationStatus(req, res) {
try {
const { id } = req.params;

```
console.log(
  "CHECKING DONATION STATUS:",
  id
);

const donation =
  await Donation.findOne({
    checkoutRequestId: id,
  }).select("-callbackData");

if (!donation) {
  return res.status(404).json({
    success: false,
    message: "Donation not found.",
  });
}

return res.json({
  success: true,

  donation: {
    id: donation._id,
    amount: donation.amount,
    status: donation.status,
    paymentMethod:
      donation.paymentMethod,
    mpesaReceiptNumber:
      donation.mpesaReceiptNumber,
    resultDescription:
      donation.resultDescription,
    createdAt:
      donation.createdAt,
    updatedAt:
      donation.updatedAt,
  },
});
```

} catch (error) {
console.error(
"GET DONATION STATUS ERROR:",
error.message
);

```
return res.status(500).json({
  success: false,
  message:
    "Unable to retrieve donation status.",
});
```

}
}

/**

* ---
* QUERY M-PESA TRANSACTION
* ---

*/
export async function queryDonationPayment(
req,
res
) {
try {
const { id } = req.params;

```
const donation =
  await Donation.findById(id);

if (!donation) {
  return res.status(404).json({
    success: false,
    message: "Donation not found.",
  });
}

if (!donation.checkoutRequestId) {
  return res.status(400).json({
    success: false,
    message:
      "This donation has no CheckoutRequestID.",
  });
}

const result =
  await querySTKPush(
    donation.checkoutRequestId
  );

const resultCode =
  String(result.ResultCode ?? "");

if (resultCode === "0") {
  donation.status = "completed";
} else if (resultCode === "1032") {
  donation.status = "cancelled";
} else if (resultCode) {
  donation.status = "failed";
}

donation.resultCode = resultCode;

donation.resultDescription =
  result.ResultDesc || "";

await donation.save();

return res.json({
  success: true,
  mpesa: result,
  donationStatus:
    donation.status,
});
```

} catch (error) {
console.error(
"QUERY DONATION ERROR:",
error.response?.data ||
error.message
);

```
return res.status(500).json({
  success: false,
  message:
    error.response?.data?.errorMessage ||
    error.message ||
    "Unable to query M-Pesa transaction.",
});
```

}
}

/**

* ---
* KCB CALLBACK
* ---
*
* KCB's exact callback payload depends on the KCB API
* product you subscribe to.
  */
  export async function kcbCallback(req, res) {
  try {
  console.log(
  "KCB CALLBACK:",
  JSON.stringify(req.body, null, 2)
  );

  const data = req.body || {};

  const reference =
  data.reference ||
  data.Reference ||
  data.transactionReference ||
  data.TransactionReference;

  const transactionId =
  data.transactionId ||
  data.TransactionId;

  let donation = null;

  if (reference) {
  donation = await Donation.findOne({
  $or: [
  { kcbReference: reference },
  { kcbTransactionId: reference },
  ],
  });
  }

  if (!donation && transactionId) {
  donation = await Donation.findOne({
  kcbTransactionId: transactionId,
  });
  }

  if (!donation) {
  console.warn(
  "KCB donation not found:",
  reference || transactionId
  );

  return res.json({
  success: true,
  message: "Callback accepted.",
  });
  }

  const status = String(
  data.status ||
  data.Status ||
  ""
  ).toLowerCase();

  if (
  status === "success" ||
  status === "completed" ||
  status === "successful"
  ) {
  donation.status = "completed";
  } else if (
  status === "cancelled" ||
  status === "canceled"
  ) {
  donation.status = "cancelled";
  } else if (status === "failed") {
  donation.status = "failed";
  }

  donation.callbackReceived = true;
  donation.callbackData = data;

  await donation.save();

  return res.json({
  success: true,
  message: "Callback accepted.",
  });
  } catch (error) {
  console.error(
  "KCB CALLBACK ERROR:",
  error.message
  );

  return res.json({
  success: true,
  message: "Callback accepted.",
  });
  }
  }

/**

* ---
* AIRTEL CALLBACK
* ---

*/
export async function airtelCallback(req, res) {
try {
console.log(
"AIRTEL CALLBACK:",
JSON.stringify(req.body, null, 2)
);

```
const data = req.body || {};

const reference =
  data.reference ||
  data.transactionReference ||
  data.transaction?.reference;

const transactionId =
  data.transactionId ||
  data.transaction?.id;

let donation = null;

if (reference) {
  donation = await Donation.findOne({
    $or: [
      { airtelReference: reference },
      { airtelTransactionId: reference },
    ],
  });
}

if (!donation && transactionId) {
  donation = await Donation.findOne({
    airtelTransactionId: transactionId,
  });
}

if (!donation) {
  console.warn(
    "Airtel donation not found:",
    reference || transactionId
  );

  return res.json({
    success: true,
    message: "Callback accepted.",
  });
}

const status = String(
  data.status ||
  data.Status ||
  data.transaction?.status ||
  ""
).toLowerCase();

if (
  status === "success" ||
  status === "completed" ||
  status === "successful"
) {
  donation.status = "completed";
} else if (
  status === "cancelled" ||
  status === "canceled"
) {
  donation.status = "cancelled";
} else if (status === "failed") {
  donation.status = "failed";
}

donation.callbackReceived = true;
donation.callbackData = data;

await donation.save();

return res.json({
  success: true,
  message: "Callback accepted.",
});
```

} catch (error) {
console.error(
"AIRTEL CALLBACK ERROR:",
error.message
);

```
return res.json({
  success: true,
  message: "Callback accepted.",
});
```

}
}
