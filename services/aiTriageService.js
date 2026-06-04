/**
 * AI Triage Service
 * Rule-based NLP triage engine for Kenyan emergency scenarios
 * Supports Swahili and English keyword detection
 * In production: integrate with OpenAI GPT or Google Healthcare NLP API
 */

// Keyword maps for emergency classification
const emergencyKeywords = {
  cardiac: {
    en: ['heart attack', 'cardiac', 'chest pain', 'chest pressure', 'heart', 'palpitation', 'defibrillator', 'cpr needed', 'not breathing', 'pulse gone', 'collapsed', 'blue lips'],
    sw: ['maumivu ya moyo', 'moyo', 'mshtuko wa moyo', 'maumivu kifua', 'hakuna mapigo', 'amezimia'],
    score: 10,
    severity: 'critical'
  },
  stroke: {
    en: ['stroke', 'facial droop', 'face drooping', 'arm weakness', 'speech difficulty', 'sudden confusion', 'sudden headache', 'paralysis', 'slurred speech'],
    sw: ['kiharusi', 'uso umepooza', 'mkono dhaifu', 'usemi mgumu', 'confusion'],
    score: 10,
    severity: 'critical'
  },
  respiratory: {
    en: ['cant breathe', 'cannot breathe', 'difficulty breathing', 'choking', 'asthma', 'gasping', 'suffocating', 'oxygen', 'breathing trouble', 'wheeze'],
    sw: ['hawezi kupumua', 'kushindwa kupumua', 'kupumua kwa shida', 'kuziba koo', 'pumzi'],
    score: 9,
    severity: 'high'
  },
  obstetric: {
    en: ['labor', 'labour', 'pregnant', 'delivery', 'baby coming', 'water broke', 'contractions', 'giving birth', 'miscarriage', 'bleeding pregnant', 'maternity'],
    sw: ['kujifungua', 'mzazi', 'mimba', 'mtoto anakuja', 'maji yamevunjika', 'mikazo', 'kuzaa', 'mimba ya hatari'],
    score: 9,
    severity: 'high'
  },
  trauma: {
    en: ['accident', 'crash', 'hit', 'bleeding', 'bone broken', 'fracture', 'knife', 'stabbed', 'gunshot', 'fell', 'fall', 'head injury', 'unconscious'],
    sw: ['ajali', 'mgongano', 'kupigwa', 'damu', 'mfupa umevunjika', 'kisu', 'risasi', 'kuanguka', 'jeraha la kichwa', 'amezimia'],
    score: 8,
    severity: 'high'
  },
  poisoning: {
    en: ['poison', 'overdose', 'swallowed', 'snake bite', 'snakebite', 'bite', 'chemicals', 'medication overdose', 'drunk unconscious', 'toxic'],
    sw: ['sumu', 'nyoka', 'kuumwa nyoka', 'dawa nyingi', 'kemikali', 'sumu ya chakula'],
    score: 8,
    severity: 'high'
  },
  accident: {
    en: ['road accident', 'car accident', 'matatu', 'motorcycle accident', 'boda boda', 'bus crash', 'vehicle', 'knocked down', 'pedestrian'],
    sw: ['ajali ya barabara', 'ajali ya gari', 'matatu', 'boda boda', 'gari', 'mgongano wa barabara'],
    score: 7,
    severity: 'high'
  }
};

/**
 * Perform NLP triage on emergency description
 * Returns triage score, type, severity, and guidance
 */
const analyzeEmergency = (description = '', selectedType = '') => {
  const text = description.toLowerCase().trim();

  if (!text && selectedType) {
    const typeInfo = emergencyKeywords[selectedType];
    return {
      type: selectedType,
      score: typeInfo?.score || 5,
      severity: typeInfo?.severity || 'medium',
      confidence: 0.7,
      guidance: getFirstAidGuidance(selectedType),
      keywordsDetected: []
    };
  }

  let highestScore = 0;
  let detectedType = 'general';
  let detectedSeverity = 'medium';
  let detectedKeywords = [];

  for (const [type, config] of Object.entries(emergencyKeywords)) {
    const allKeywords = [...config.en, ...config.sw];
    const found = allKeywords.filter(kw => text.includes(kw));

    if (found.length > 0) {
      const matchScore = config.score + (found.length * 0.5);
      if (matchScore > highestScore) {
        highestScore = matchScore;
        detectedType = type;
        detectedSeverity = config.severity;
        detectedKeywords = found;
      }
    }
  }

  // Severity modifiers
  const criticalModifiers = ['not responding', 'unconscious', 'not breathing', 'no pulse', 'hakuna mapigo', 'amezimia', 'hayupo'];
  const hasCriticalModifier = criticalModifiers.some(m => text.includes(m));
  if (hasCriticalModifier && detectedSeverity !== 'critical') {
    detectedSeverity = 'critical';
    highestScore = Math.min(10, highestScore + 2);
  }

  // Age modifiers
  const childModifiers = ['child', 'baby', 'infant', 'newborn', 'mtoto', 'watoto', 'years old'];
  const isChild = childModifiers.some(m => text.includes(m));
  if (isChild) highestScore = Math.min(10, highestScore + 1);

  const finalType = selectedType || detectedType;
  const finalScore = Math.min(10, Math.round(highestScore));

  return {
    type: finalType,
    score: finalScore,
    severity: detectedSeverity,
    confidence: detectedKeywords.length > 0 ? Math.min(1, 0.5 + detectedKeywords.length * 0.1) : 0.5,
    guidance: getFirstAidGuidance(finalType),
    keywordsDetected: detectedKeywords,
    isChild,
    hasCriticalModifier
  };
};

/**
 * Pre-arrival first aid guidance for bystanders
 */
const getFirstAidGuidance = (emergencyType) => {
  const guidance = {
    cardiac: [
      'Call for help immediately',
      'Start CPR: 30 chest compressions, 2 rescue breaths',
      'Push hard and fast — 100-120 per minute',
      'Do NOT stop until EMT arrives',
      'If AED available, use it NOW'
    ],
    stroke: [
      'FAST: Face drooping, Arm weak, Speech slurred, Time to call EMS',
      'Keep patient still and calm',
      'Do NOT give food or water',
      'Note the time symptoms started',
      'Do NOT leave patient alone'
    ],
    respiratory: [
      'Keep patient upright — sitting is better than lying',
      'Loosen tight clothing around neck and chest',
      'If asthma inhaler available, use it',
      'Stay calm — panic makes breathing worse',
      'Do NOT lay patient flat'
    ],
    obstetric: [
      'Keep patient calm and comfortable',
      'Do NOT attempt delivery unless it is imminent',
      'If baby is coming, lay patient on clean surface',
      'Do NOT cut the cord — wait for EMT',
      'Keep patient warm'
    ],
    trauma: [
      'Control bleeding with direct pressure — use cloth, do NOT remove',
      'Do NOT move patient if neck/spine injury suspected',
      'Keep patient warm and still',
      'If unconscious, place in recovery position (not if spine injury)',
      'Count breaths — less than 10 per minute is critical'
    ],
    poisoning: [
      'Do NOT induce vomiting unless instructed by poison control',
      'If snake bite: immobilize the limb, keep below heart level',
      'Remove contaminated clothing',
      'Note what was ingested and how much',
      'Poison Control Kenya: 0800 723 253 (toll free)'
    ],
    accident: [
      'Ensure scene is safe before approaching',
      'Do NOT move victim unless in immediate danger',
      'Control visible bleeding with direct pressure',
      'Keep victim warm and reassured',
      'Note number of injured'
    ],
    general: [
      'Stay calm and reassure the patient',
      'Keep patient comfortable',
      'Monitor breathing and pulse',
      'Help is on the way'
    ]
  };

  return guidance[emergencyType] || guidance.general;
};

/**
 * Estimate required equipment based on triage
 */
const getEquipmentNeeds = (emergencyType, triageScore) => {
  const needs = {
    cardiac: { defibrillator: true, oxygen: true, iv_access: true },
    stroke: { oxygen: true, iv_access: true, glucometer: true },
    respiratory: { oxygen: true, nebulizer: true },
    obstetric: { delivery_kit: true, oxygen: true },
    trauma: { trauma_kit: true, immobilization: true, oxygen: triageScore >= 8 },
    poisoning: { oxygen: true, iv_access: true, charcoal: true },
    accident: { trauma_kit: true, immobilization: true },
    general: { basic_kit: true }
  };

  return needs[emergencyType] || needs.general;
};

module.exports = { analyzeEmergency, getFirstAidGuidance, getEquipmentNeeds };
