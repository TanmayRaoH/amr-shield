// Symptom groupings for the picker UI, from the itachi9604 Kaggle dataset.
//
// IMPORTANT: this file is for *grouping and labelling only*. The authoritative
// list of symptom strings the models accept comes from GET /api/v1/symptoms,
// which reads features.pkl directly. Never treat the arrays below as the source
// of truth — they previously drifted from the trained features and two symptoms
// ('dischromic__patches', 'spotting__urination', which carry a double underscore
// from stray spaces in the raw CSV) could never match, so they were silently
// discarded on every request.

export const SYMPTOM_CATEGORIES = {
  'Fever & Temperature': [
    'high_fever', 'mild_fever', 'sweating', 'chills', 'shivering',
  ],
  'Pain': [
    'headache', 'chest_pain', 'back_pain', 'abdominal_pain', 'joint_pain',
    'muscle_pain', 'neck_pain', 'knee_pain', 'hip_joint_pain', 'belly_pain',
    'pain_behind_the_eyes', 'pain_during_bowel_movements', 'pain_in_anal_region',
    'painful_walking',
  ],
  'Skin': [
    'itching', 'skin_rash', 'nodal_skin_eruptions', 'dischromic__patches',
    'yellowish_skin', 'red_spots_over_body', 'blister', 'red_sore_around_nose',
    'yellow_crust_ooze', 'skin_peeling', 'silver_like_dusting',
    'small_dents_in_nails', 'inflammatory_nails', 'blackheads',
    'pus_filled_pimples', 'scurring', 'bruising',
  ],
  'Digestive': [
    'vomiting', 'nausea', 'diarrhoea', 'constipation', 'indigestion',
    'stomach_pain', 'abdominal_pain', 'loss_of_appetite', 'passage_of_gases',
    'internal_itching', 'acidity', 'ulcers_on_tongue', 'swelling_of_stomach',
    'distention_of_abdomen', 'stomach_bleeding', 'bloody_stool',
  ],
  'Respiratory': [
    'cough', 'breathlessness', 'phlegm', 'mucoid_sputum', 'rusty_sputum',
    'blood_in_sputum', 'chest_pain', 'throat_irritation', 'congestion',
    'runny_nose', 'sinus_pressure', 'loss_of_smell',
  ],
  'Neurological': [
    'headache', 'dizziness', 'loss_of_balance', 'unsteadiness',
    'spinning_movements', 'altered_sensorium', 'weakness_of_one_body_side',
    'visual_disturbances', 'blurred_and_distorted_vision', 'slurred_speech',
    'depression', 'irritability', 'anxiety', 'restlessness', 'lack_of_concentration',
    'mood_swings',
  ],
  'Urinary': [
    'burning_micturition', 'bladder_discomfort', 'foul_smell_of_urine',
    'continuous_feel_of_urine', 'yellow_urine', 'dark_urine', 'polyuria',
    'spotting__urination',
  ],
  'Metabolic & Weight': [
    'fatigue', 'weight_loss', 'weight_gain', 'obesity', 'lethargy',
    'excessive_hunger', 'increased_appetite', 'irregular_sugar_level',
    'dehydration', 'sunken_eyes', 'fluid_overload',
  ],
  'Musculoskeletal': [
    'muscle_weakness', 'muscle_wasting', 'weakness_in_limbs',
    'movement_stiffness', 'swelling_joints', 'stiff_neck', 'cramps',
    'swollen_legs', 'swollen_extremeties', 'swollen_blood_vessels',
    'prominent_veins_on_calf',
  ],
  'Eyes & ENT': [
    'yellowing_of_eyes', 'redness_of_eyes', 'watering_from_eyes',
    'continuous_sneezing', 'loss_of_smell', 'throat_irritation',
  ],
  'Liver & Jaundice': [
    'yellowish_skin', 'yellowing_of_eyes', 'dark_urine', 'yellow_urine',
    'acute_liver_failure', 'coma', 'history_of_alcohol_consumption',
  ],
  'Lymphatic & Immune': [
    'swelled_lymph_nodes', 'malaise', 'extra_marital_contacts',
    'receiving_blood_transfusion', 'receiving_unsterile_injections',
    'patches_in_throat', 'family_history',
  ],
  'Cardiovascular': [
    'fast_heart_rate', 'palpitations', 'chest_pain', 'breathlessness',
  ],
  'Endocrine': [
    'enlarged_thyroid', 'brittle_nails', 'puffy_face_and_eyes',
    'cold_hands_and_feets', 'abnormal_menstruation',
  ],
  'Miscellaneous': [
    'toxic_look_(typhos)', 'irritation_in_anus', 'drying_and_tingling_lips',
    'spinning_movements', 'prominent_veins_on_calf',
  ],
}

// Fallback flat list, used only until GET /api/v1/symptoms responds.
export const ALL_SYMPTOMS = [
  ...new Set(Object.values(SYMPTOM_CATEGORIES).flat()),
].sort()

// Human-readable label: burning_micturition → Burning Micturition
// Double underscores collapse to a single space so 'dischromic__patches'
// renders as "Dischromic Patches" rather than "Dischromic  Patches".
export const formatSymptom = (s) =>
  s.replace(/_+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase())

// ── Lay-language search synonyms ────────────────────────────────────────────
// Maps everyday phrasing to the underlying feature name so a user who types
// "burning pee" or "throwing up" still finds the right chip. Keys are matched
// as substrings against the normalised search query.
export const SYMPTOM_SYNONYMS = {
  'burning pee': 'burning_micturition',
  'painful pee': 'burning_micturition',
  'painful urination': 'burning_micturition',
  'burning urination': 'burning_micturition',
  'throwing up': 'vomiting',
  'throw up': 'vomiting',
  'puking': 'vomiting',
  'sick to stomach': 'nausea',
  'runny nose': 'runny_nose',
  'blocked nose': 'congestion',
  'stuffy nose': 'congestion',
  'sneezing': 'continuous_sneezing',
  'short of breath': 'breathlessness',
  'cant breathe': 'breathlessness',
  'shortness of breath': 'breathlessness',
  'tired': 'fatigue',
  'exhausted': 'fatigue',
  'no energy': 'fatigue',
  'temperature': 'high_fever',
  'high temperature': 'high_fever',
  'loose motion': 'diarrhoea',
  'loose motions': 'diarrhoea',
  'diarrhea': 'diarrhoea',
  'the runs': 'diarrhoea',
  'tummy ache': 'stomach_pain',
  'belly ache': 'stomach_pain',
  'stomach ache': 'stomach_pain',
  'heartburn': 'acidity',
  'acid reflux': 'acidity',
  'yellow eyes': 'yellowing_of_eyes',
  'yellow skin': 'yellowish_skin',
  'jaundice': 'yellowish_skin',
  'itchy': 'itching',
  'rash': 'skin_rash',
  'spots': 'red_spots_over_body',
  'dizzy': 'dizziness',
  'light headed': 'dizziness',
  'room spinning': 'spinning_movements',
  'not hungry': 'loss_of_appetite',
  'no appetite': 'loss_of_appetite',
  'always hungry': 'excessive_hunger',
  'always thirsty': 'dehydration',
  'peeing a lot': 'polyuria',
  'frequent urination': 'polyuria',
  'racing heart': 'fast_heart_rate',
  'heart racing': 'fast_heart_rate',
  'sore throat': 'throat_irritation',
  'swollen glands': 'swelled_lymph_nodes',
  'stiff joints': 'movement_stiffness',
  'cant sleep': 'restlessness',
  'sad': 'depression',
  'low mood': 'depression',
  'worried': 'anxiety',
  'weight loss': 'weight_loss',
  'losing weight': 'weight_loss',
  'gaining weight': 'weight_gain',
}

/**
 * Normalise a raw search query into the underscore form used by feature names,
 * resolving lay-language synonyms first.
 *
 * @param {string} query Raw text from the search box.
 * @returns {string} A normalised fragment to match against feature names.
 */
export const normaliseQuery = (query) => {
  const cleaned = query.toLowerCase().trim().replace(/[^a-z0-9\s_]/g, '')
  if (!cleaned) return ''

  // Longest synonym key first so "shortness of breath" wins over "breath"
  const match = Object.keys(SYMPTOM_SYNONYMS)
    .sort((a, b) => b.length - a.length)
    .find((phrase) => cleaned.includes(phrase))

  if (match) return SYMPTOM_SYNONYMS[match]
  return cleaned.replace(/\s+/g, '_')
}

/**
 * Group an arbitrary symptom list into the display categories above.
 * Anything the categories do not cover lands in "Other" so a symptom fetched
 * from the API can never become unreachable in the UI.
 *
 * @param {string[]} symptoms Feature names, typically from GET /api/v1/symptoms.
 * @returns {Record<string, string[]>} Category name → symptoms present in it.
 */
export const groupSymptoms = (symptoms) => {
  const available = new Set(symptoms)
  const grouped = {}
  const claimed = new Set()

  for (const [category, members] of Object.entries(SYMPTOM_CATEGORIES)) {
    const present = members.filter((m) => available.has(m))
    if (present.length > 0) {
      grouped[category] = present
      present.forEach((m) => claimed.add(m))
    }
  }

  const leftover = symptoms.filter((s) => !claimed.has(s)).sort()
  if (leftover.length > 0) grouped['Other'] = leftover

  return grouped
}

// ── Preset cases ────────────────────────────────────────────────────────────
// One-click starting points. Picking 3+ symptoms from a 131-item grid is a lot
// of friction just to see whether the tool is worth using, so these give a
// visitor a working result immediately. Symptom strings match features.pkl.
export const PRESET_CASES = [
  {
    label: 'Suspected UTI',
    description: 'Burning urination, bladder discomfort, foul-smelling urine — select a country for live WHO GLASS resistance data',
    symptoms: ['burning_micturition', 'bladder_discomfort', 'foul_smell_of_urine'],
  },
  {
    label: 'Febrile respiratory',
    description: 'High fever, cough, breathlessness, fatigue',
    symptoms: ['high_fever', 'cough', 'breathlessness', 'fatigue'],
  },
  {
    label: 'Skin presentation',
    description: 'Itching, rash, nodal eruptions, discoloured patches — select a country for live WHO GLASS resistance data',
    symptoms: ['itching', 'skin_rash', 'nodal_skin_eruptions', 'dischromic__patches'],
  },
]
