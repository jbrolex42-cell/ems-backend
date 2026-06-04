const axios = require('axios');

/**
 * Social Health Authority (SHA) API Integration
 * Handles ECCIF pre-authorization and claims processing
 * API Version: 1.67.0
 */

const SHA_BASE_URL = process.env.SHA_API_URL || 'https://api.sha.go.ke/v1';
const SHA_API_KEY = process.env.SHA_API_KEY;

const shaClient = axios.create({
  baseURL: SHA_BASE_URL,
  headers: {
    'Authorization': `Bearer ${SHA_API_KEY}`,
    'Content-Type': 'application/json',
    'X-API-Version': '1.67.0'
  },
  timeout: 10000
});

/**
 * Verify beneficiary eligibility using National ID or SHA number
 */
const verifyBeneficiary = async (identifier, idType = 'national_id') => {
  try {
    const response = await shaClient.post('/beneficiary/verify', {
      identifier,
      id_type: idType, // 'national_id' | 'sha_number' | 'phone'
      fund: 'ECCIF'
    });

    return {
      success: true,
      eligible: response.data.eligible,
      memberNumber: response.data.member_number,
      name: response.data.full_name,
      coverageLevel: response.data.coverage_level,
      remainingBenefit: response.data.remaining_benefit_amount,
      fundType: response.data.fund_type
    };
  } catch (error) {
    console.error('SHA Verify Error:', error.response?.data || error.message);
    // Graceful fallback — don't block emergency for SHA failure
    return {
      success: false,
      eligible: false,
      error: error.response?.data?.message || 'SHA verification unavailable'
    };
  }
};

/**
 * Submit pre-authorization for emergency services
 * Called at dispatch — before service rendered
 */
const preAuthorize = async ({ patientId, patientName, emergencyType, facilityCode, providerCode }) => {
  try {
    const response = await shaClient.post('/preauth/emergency', {
      patient_id: patientId,
      patient_name: patientName,
      emergency_type: emergencyType,
      facility_code: facilityCode || process.env.SHA_FACILITY_CODE,
      provider_code: providerCode || process.env.SHA_PROVIDER_CODE,
      service_codes: getServiceCodes(emergencyType),
      fund: 'ECCIF',
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      authCode: response.data.authorization_code,
      approvedAmount: response.data.approved_amount,
      expiresAt: response.data.expires_at,
      services: response.data.approved_services
    };
  } catch (error) {
    console.error('SHA PreAuth Error:', error.response?.data || error.message);
    return {
      success: false,
      authCode: null,
      error: error.response?.data?.message || 'Pre-authorization failed'
    };
  }
};

/**
 * Submit claim after service delivery
 * Called when emergency is marked completed
 */
const submitClaim = async ({
  emergencyId,
  patientShaNumber,
  authCode,
  servicesRendered,
  facilityCode,
  emtId,
  totalAmount,
  incidentDate
}) => {
  try {
    const response = await shaClient.post('/claims/submit', {
      claim_reference: `EMS-${emergencyId}`,
      patient_sha_number: patientShaNumber,
      authorization_code: authCode,
      fund: 'ECCIF',
      facility_code: facilityCode,
      provider_id: emtId,
      incident_date: incidentDate,
      submission_date: new Date().toISOString(),
      services: servicesRendered,
      total_amount: totalAmount,
      currency: 'KES'
    });

    return {
      success: true,
      claimId: response.data.claim_id,
      status: response.data.status,
      expectedPaymentDate: response.data.expected_payment_date,
      approvedAmount: response.data.approved_amount
    };
  } catch (error) {
    console.error('SHA Claim Error:', error.response?.data || error.message);
    return {
      success: false,
      claimId: null,
      error: error.response?.data?.message || 'Claim submission failed'
    };
  }
};

/**
 * Check existing claim status
 */
const checkClaimStatus = async (claimId) => {
  try {
    const response = await shaClient.get(`/claims/${claimId}/status`);
    return {
      success: true,
      status: response.data.status, // pending | processing | approved | rejected | paid
      paymentDate: response.data.payment_date,
      paidAmount: response.data.paid_amount,
      rejectionReason: response.data.rejection_reason
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Map emergency type to SHA service codes (ECCIF billable items)
 */
const getServiceCodes = (emergencyType) => {
  const serviceMap = {
    cardiac: ['ECC-001', 'ALS-002', 'DEFIB-001'],
    stroke: ['ECC-001', 'ALS-003', 'NEURO-001'],
    trauma: ['ECC-002', 'BLS-001', 'TRAUMA-001'],
    obstetric: ['ECC-003', 'OBS-001', 'MATER-001'],
    respiratory: ['ECC-001', 'OXY-001', 'BLS-002'],
    poisoning: ['ECC-002', 'TOX-001', 'BLS-001'],
    accident: ['ECC-002', 'TRAUMA-001', 'IMMOB-001'],
    general: ['ECC-001', 'BLS-001']
  };
  return serviceMap[emergencyType] || serviceMap.general;
};

/**
 * Mock response for development/demo when SHA API is unavailable
 */
const mockVerifyBeneficiary = (identifier) => ({
  success: true,
  eligible: true,
  memberNumber: `SHA-${Date.now().toString().slice(-8)}`,
  name: 'SHA Member',
  coverageLevel: 'full',
  remainingBenefit: 50000,
  fundType: 'ECCIF'
});

module.exports = {
  verifyBeneficiary: process.env.SHA_API_KEY ? verifyBeneficiary : mockVerifyBeneficiary,
  preAuthorize,
  submitClaim,
  checkClaimStatus
};
