// ─────────────────────────────────────────────────────────────────────────────
// Therapy reference table, keyed by the exact class names in label_encoder.pkl.
//
// READ THIS BEFORE TRUSTING ANY NUMBER IN THIS FILE:
//
//   * `resistance` and `amrScore` are ILLUSTRATIVE PLACEHOLDER VALUES. They are
//     not from WHO GLASS or any other surveillance system. The UI labels them as
//     such. Replace them with sourced data before this tool is used for anything
//     beyond demonstration — see improvements.md §2.2.
//   * `aware` follows the WHO AWaRe classification (2023 update) where the drug
//     appears in it. Antituberculosis agents are outside AWaRe's scope and are
//     marked 'Not classified'.
//   * `antibioticIndicated: false` means antibiotics are NOT appropriate for the
//     condition. 24 of the 41 model classes fall into this group, including
//     several that are not infections at all.
//
// Every one of the 41 model classes has an entry here. Previously only 10 did,
// so ~76% of predictions fell through to a generic "consult specialist" card.
// ─────────────────────────────────────────────────────────────────────────────

/** Provenance banner text, rendered anywhere these numbers are displayed. */
export const DATA_PROVENANCE =
  'Resistance and AMR score values are illustrative placeholders, not live surveillance data.'

const supportive = (name, note) => ({
  name,
  note,
  aware: 'Not applicable',
  resistance: null,
  amrScore: null,
})

export const THERAPY_DATA = {
  // ── Bacterial infections: antibiotics appropriate ──────────────────────────
  'Urinary tract infection': {
    antibioticIndicated: true,
    summary:
      'Empiric choice depends on whether the infection is uncomplicated, and on local resistance. Send urine culture before starting where possible.',
    options: [
      { name: 'Nitrofurantoin', aware: 'Access', resistance: 12, amrScore: 18, note: 'First-line for uncomplicated lower UTI' },
      { name: 'Trimethoprim', aware: 'Access', resistance: 28, amrScore: 35, note: 'Only where local resistance is known to be low' },
      { name: 'Ciprofloxacin', aware: 'Watch', resistance: 45, amrScore: 62, note: 'Escalation option — avoid as first-line' },
    ],
  },
  Pneumonia: {
    antibioticIndicated: true,
    summary:
      'Distinguish community-acquired from hospital-acquired: the likely organisms and the empiric choice differ substantially.',
    options: [
      { name: 'Amoxicillin', aware: 'Access', resistance: 18, amrScore: 22, note: 'First-line for community-acquired pneumonia' },
      { name: 'Doxycycline', aware: 'Access', resistance: 21, amrScore: 26, note: 'Alternative with atypical cover' },
      { name: 'Azithromycin', aware: 'Watch', resistance: 32, amrScore: 41, note: 'Add for atypical cover in severe disease' },
    ],
  },
  Tuberculosis: {
    antibioticIndicated: true,
    summary:
      'Never treat with a single agent. Requires a supervised multi-drug regimen and drug-susceptibility testing.',
    options: [
      { name: 'Isoniazid + Rifampicin', aware: 'Not classified', resistance: 22, amrScore: 30, note: 'Backbone of the standard regimen' },
      { name: 'Pyrazinamide', aware: 'Not classified', resistance: 19, amrScore: 28, note: 'Intensive phase component' },
      { name: 'Ethambutol', aware: 'Not classified', resistance: 16, amrScore: 25, note: 'Intensive phase component' },
    ],
  },
  Typhoid: {
    antibioticIndicated: true,
    summary:
      'Fluoroquinolone resistance is now widespread in South Asia. Blood culture guides definitive therapy.',
    options: [
      { name: 'Azithromycin', aware: 'Watch', resistance: 20, amrScore: 28, note: 'Uncomplicated enteric fever' },
      { name: 'Ceftriaxone', aware: 'Watch', resistance: 25, amrScore: 35, note: 'Severe or multidrug-resistant disease' },
      { name: 'Ciprofloxacin', aware: 'Watch', resistance: 58, amrScore: 70, note: 'High resistance — generally avoid' },
    ],
  },
  Impetigo: {
    antibioticIndicated: true,
    summary: 'Localised disease can often be managed topically; oral therapy is for extensive or bullous disease.',
    options: [
      { name: 'Mupirocin (topical)', aware: 'Access', resistance: 11, amrScore: 16, note: 'First-line for localised impetigo' },
      { name: 'Flucloxacillin', aware: 'Access', resistance: 19, amrScore: 24, note: 'Oral option for extensive disease' },
      { name: 'Clindamycin', aware: 'Access', resistance: 27, amrScore: 34, note: 'Where MRSA is a concern' },
    ],
  },
  'Peptic ulcer diseae': {
    antibioticIndicated: true,
    summary:
      'Antibiotics are indicated only for confirmed Helicobacter pylori infection, always as combination eradication therapy with acid suppression.',
    options: [
      { name: 'Amoxicillin + Clarithromycin + PPI', aware: 'Watch', resistance: 24, amrScore: 33, note: 'Standard triple eradication therapy' },
      { name: 'Metronidazole (substitute)', aware: 'Access', resistance: 36, amrScore: 44, note: 'Replaces amoxicillin in penicillin allergy' },
      supportive('Proton pump inhibitor alone', 'For ulcers not caused by H. pylori'),
    ],
  },
  Acne: {
    antibioticIndicated: true,
    summary:
      'Topical agents first. Oral antibiotics only for moderate-to-severe disease and never as monotherapy, to limit resistance.',
    options: [
      supportive('Benzoyl peroxide / topical retinoid', 'First-line, no resistance risk'),
      { name: 'Clindamycin (topical)', aware: 'Access', resistance: 29, amrScore: 37, note: 'Always combine with benzoyl peroxide' },
      { name: 'Doxycycline', aware: 'Access', resistance: 23, amrScore: 30, note: 'Moderate-severe disease, time-limited course' },
    ],
  },

  // ── Non-bacterial infections: antibiotics NOT appropriate ─────────────────
  'Fungal infection': {
    antibioticIndicated: false,
    reason: 'Fungal, not bacterial. Antibacterials have no effect and disturb normal flora.',
    summary: 'Antifungal therapy. Topical agents suffice for most superficial disease.',
    options: [
      supportive('Clotrimazole (topical)', 'Superficial dermatophyte infection'),
      supportive('Fluconazole', 'Extensive or systemic disease'),
      supportive('Itraconazole', 'Resistant dermatophyte infection'),
    ],
  },
  Malaria: {
    antibioticIndicated: false,
    reason: 'Parasitic, not bacterial. Requires antimalarials guided by species and severity.',
    summary: 'Confirm with a rapid diagnostic test or blood film before treating.',
    options: [
      supportive('Artemether-lumefantrine', 'WHO-recommended first-line for uncomplicated falciparum malaria'),
      supportive('Artesunate (IV)', 'Severe malaria'),
      supportive('Chloroquine', 'Only where local susceptibility is confirmed'),
    ],
  },
  Dengue: {
    antibioticIndicated: false,
    reason: 'Viral. No antibiotic or antiviral shortens the illness.',
    summary: 'Supportive care with careful fluid management. Watch for warning signs of severe dengue.',
    options: [
      supportive('Paracetamol', 'Fever and pain — avoid NSAIDs and aspirin (bleeding risk)'),
      supportive('Oral or IV fluids', 'Guided by haematocrit and urine output'),
      supportive('Platelet monitoring', 'Escalate on warning signs'),
    ],
  },
  'Common Cold': {
    antibioticIndicated: false,
    reason: 'Viral. Antibiotics give no benefit and drive resistance — a key stewardship point.',
    summary: 'Symptomatic relief only. Self-limiting in 7–10 days.',
    options: [
      supportive('Rest and fluids', 'Mainstay of management'),
      supportive('Paracetamol or ibuprofen', 'Fever and discomfort'),
      supportive('Saline nasal spray', 'Congestion relief'),
    ],
  },
  'Chicken pox': {
    antibioticIndicated: false,
    reason: 'Viral (varicella-zoster).',
    summary: 'Usually supportive. Antivirals for adults, immunocompromised, or severe disease.',
    options: [
      supportive('Aciclovir', 'Adults, immunocompromised, or severe disease'),
      supportive('Calamine / antihistamine', 'Itch relief'),
      supportive('Paracetamol', 'Fever — avoid aspirin in children'),
    ],
  },
  AIDS: {
    antibioticIndicated: false,
    reason: 'Viral (HIV). Requires lifelong antiretroviral therapy under specialist care.',
    summary: 'Specialist referral. Antibiotics only for specific opportunistic infections.',
    options: [
      supportive('Antiretroviral therapy', 'Specialist-initiated combination regimen'),
      supportive('Opportunistic infection prophylaxis', 'Based on CD4 count'),
      supportive('Specialist referral', 'Essential — do not manage empirically'),
    ],
  },
  'Hepatitis B': {
    antibioticIndicated: false,
    reason: 'Viral.',
    summary: 'Antiviral therapy for chronic infection, decided on viral load and liver fibrosis.',
    options: [
      supportive('Tenofovir', 'First-line antiviral for chronic HBV'),
      supportive('Entecavir', 'Alternative first-line'),
      supportive('Hepatology referral', 'For staging and monitoring'),
    ],
  },
  'Hepatitis C': {
    antibioticIndicated: false,
    reason: 'Viral.',
    summary: 'Curable in most cases with direct-acting antivirals.',
    options: [
      supportive('Direct-acting antivirals', 'Genotype-guided, typically 8–12 weeks'),
      supportive('Fibrosis assessment', 'Before and after treatment'),
      supportive('Hepatology referral', 'For regimen selection'),
    ],
  },
  'Hepatitis D': {
    antibioticIndicated: false,
    reason: 'Viral. Only occurs alongside hepatitis B.',
    summary: 'Specialist management; treat the underlying HBV co-infection.',
    options: [
      supportive('Specialist referral', 'Management is highly specialised'),
      supportive('HBV co-infection control', 'Delta virus requires HBV to replicate'),
      supportive('Liver function monitoring', 'Higher risk of rapid progression'),
    ],
  },
  'Hepatitis E': {
    antibioticIndicated: false,
    reason: 'Viral.',
    summary: 'Usually self-limiting. Higher risk in pregnancy.',
    options: [
      supportive('Supportive care', 'Most cases resolve without treatment'),
      supportive('Avoid hepatotoxins', 'Including alcohol and paracetamol excess'),
      supportive('Close monitoring in pregnancy', 'Substantially higher mortality'),
    ],
  },
  'hepatitis A': {
    antibioticIndicated: false,
    reason: 'Viral.',
    summary: 'Self-limiting. Prevention is by vaccination and sanitation.',
    options: [
      supportive('Supportive care', 'Rest, fluids, nutrition'),
      supportive('Avoid alcohol', 'Reduces additional liver injury'),
      supportive('Contact vaccination', 'Post-exposure prophylaxis for close contacts'),
    ],
  },
  Gastroenteritis: {
    antibioticIndicated: false,
    reason: 'Most cases are viral and self-limiting. Antibiotics are reserved for specific confirmed pathogens.',
    summary: 'Rehydration is the priority. Send stool culture if there is blood, high fever, or a travel history.',
    options: [
      supportive('Oral rehydration solution', 'Cornerstone of management'),
      supportive('Zinc supplementation', 'Reduces duration in children'),
      supportive('Stool culture if red flags', 'Blood, persistent fever, recent travel'),
    ],
  },
  'Drug Reaction': {
    antibioticIndicated: false,
    reason: 'An adverse reaction, not an infection. A new antibiotic may worsen it.',
    summary: 'Identify and stop the culprit drug. Assess for severe cutaneous reaction.',
    options: [
      supportive('Withdraw the suspected drug', 'Single most important step'),
      supportive('Antihistamine / corticosteroid', 'Symptom control as indicated'),
      supportive('Urgent review if blistering', 'Possible SJS/TEN — medical emergency'),
    ],
  },

  // ── Not infections: antibiotics NOT appropriate ───────────────────────────
  Diabetes: {
    antibioticIndicated: false,
    reason: 'A metabolic disorder, not an infection.',
    summary: 'Glycaemic control, lifestyle modification, and complication screening.',
    options: [
      supportive('Metformin', 'Usual first-line glucose-lowering agent'),
      supportive('Lifestyle modification', 'Diet, activity, weight'),
      supportive('Complication screening', 'Retinal, renal, and foot review'),
    ],
  },
  Hypertension: {
    antibioticIndicated: false,
    reason: 'A cardiovascular condition, not an infection.',
    summary: 'Confirm with repeated or ambulatory measurement before treating.',
    options: [
      supportive('Lifestyle modification', 'Sodium reduction, activity, weight'),
      supportive('ACE inhibitor / ARB / CCB', 'Choice depends on age and comorbidity'),
      supportive('Cardiovascular risk assessment', 'Guides treatment threshold'),
    ],
  },
  'Heart attack': {
    antibioticIndicated: false,
    reason: 'A medical emergency, not an infection.',
    summary: 'Call emergency services immediately. Do not use this tool to manage suspected MI.',
    options: [
      supportive('Emergency services now', 'Time to reperfusion determines outcome'),
      supportive('Aspirin if not contraindicated', 'Given en route in most protocols'),
      supportive('ECG and troponin', 'Immediate hospital assessment'),
    ],
  },
  GERD: {
    antibioticIndicated: false,
    reason: 'Acid reflux, not an infection.',
    summary: 'Lifestyle change plus acid suppression. Investigate persistent or alarm symptoms.',
    options: [
      supportive('Proton pump inhibitor', 'Typically a 4–8 week trial'),
      supportive('Lifestyle modification', 'Meal timing, weight, trigger foods'),
      supportive('Endoscopy if alarm features', 'Dysphagia, weight loss, bleeding'),
    ],
  },
  Migraine: {
    antibioticIndicated: false,
    reason: 'A primary headache disorder, not an infection.',
    summary: 'Acute relief plus prophylaxis if attacks are frequent.',
    options: [
      supportive('NSAID or triptan', 'Acute attack treatment'),
      supportive('Trigger and headache diary', 'Identifies modifiable precipitants'),
      supportive('Prophylaxis if frequent', 'Consider at 4+ attacks per month'),
    ],
  },
  Allergy: {
    antibioticIndicated: false,
    reason: 'An immune-mediated reaction, not an infection.',
    summary: 'Avoid the trigger; treat symptoms. Anaphylaxis is an emergency.',
    options: [
      supportive('Antihistamine', 'First-line symptom control'),
      supportive('Allergen avoidance', 'Most effective long-term measure'),
      supportive('Adrenaline auto-injector', 'If any history of anaphylaxis'),
    ],
  },
  'Bronchial Asthma': {
    antibioticIndicated: false,
    reason: 'A chronic airway disease. Antibiotics do not treat exacerbations unless there is a confirmed bacterial infection.',
    summary: 'Inhaled therapy with an assessed technique and a written action plan.',
    options: [
      supportive('Inhaled corticosteroid', 'Controller therapy'),
      supportive('Short-acting beta-agonist', 'Reliever for symptoms'),
      supportive('Inhaler technique review', 'A common cause of poor control'),
    ],
  },
  Arthritis: {
    antibioticIndicated: false,
    reason: 'Inflammatory joint disease. Septic arthritis is a separate emergency requiring urgent specialist care.',
    summary: 'Establish the type before treating. Acute hot swollen joint needs same-day assessment.',
    options: [
      supportive('NSAID', 'Symptomatic relief'),
      supportive('Rheumatology referral', 'For suspected inflammatory arthritis'),
      supportive('Urgent review if hot swollen joint', 'Possible septic arthritis'),
    ],
  },
  Osteoarthristis: {
    antibioticIndicated: false,
    reason: 'Degenerative joint disease, not an infection.',
    summary: 'Exercise and weight management have the strongest evidence base.',
    options: [
      supportive('Exercise therapy', 'Strongest evidence for pain and function'),
      supportive('Weight management', 'Reduces joint loading'),
      supportive('Topical NSAID', 'Preferred over oral for knee and hand'),
    ],
  },
  'Cervical spondylosis': {
    antibioticIndicated: false,
    reason: 'Degenerative spinal change, not an infection.',
    summary: 'Conservative management. Image only if there are neurological signs.',
    options: [
      supportive('Physiotherapy', 'Mainstay of management'),
      supportive('Analgesia', 'Simple analgesics first'),
      supportive('Imaging if neurological signs', 'Weakness, myelopathy, radiculopathy'),
    ],
  },
  'Paralysis (brain hemorrhage)': {
    antibioticIndicated: false,
    reason: 'A neurological emergency, not an infection.',
    summary: 'Immediate emergency imaging and stroke-unit care. Do not delay.',
    options: [
      supportive('Emergency services now', 'Time-critical — call immediately'),
      supportive('Urgent CT head', 'Distinguishes haemorrhage from infarct'),
      supportive('Stroke unit admission', 'Improves survival and function'),
    ],
  },
  Hyperthyroidism: {
    antibioticIndicated: false,
    reason: 'An endocrine disorder, not an infection.',
    summary: 'Confirm biochemically, then determine the cause before definitive treatment.',
    options: [
      supportive('Thyroid function tests', 'Confirm before treating'),
      supportive('Beta-blocker', 'Symptom control while awaiting diagnosis'),
      supportive('Endocrinology referral', 'For antithyroid drugs or definitive therapy'),
    ],
  },
  Hypothyroidism: {
    antibioticIndicated: false,
    reason: 'An endocrine disorder, not an infection.',
    summary: 'Levothyroxine replacement titrated against TSH.',
    options: [
      supportive('Levothyroxine', 'Dose titrated to TSH'),
      supportive('Repeat TSH after 6–8 weeks', 'Guides dose adjustment'),
      supportive('Check for other causes of fatigue', 'Symptoms overlap widely'),
    ],
  },
  Hypoglycemia: {
    antibioticIndicated: false,
    reason: 'A metabolic emergency, not an infection.',
    summary: 'Treat immediately with glucose, then find the cause.',
    options: [
      supportive('Fast-acting glucose now', 'Oral if conscious, IV/IM glucagon if not'),
      supportive('Follow with complex carbohydrate', 'Prevents recurrence'),
      supportive('Review diabetes medication', 'Common precipitant'),
    ],
  },
  'Chronic cholestasis': {
    antibioticIndicated: false,
    reason: 'Impaired bile flow. Antibiotics apply only if cholangitis is present.',
    summary: 'Determine whether the obstruction is intra- or extrahepatic.',
    options: [
      supportive('Liver imaging', 'Ultrasound then MRCP as indicated'),
      supportive('Ursodeoxycholic acid', 'For specific cholestatic liver diseases'),
      supportive('Urgent review if fever with jaundice', 'Possible ascending cholangitis'),
    ],
  },
  'Alcoholic hepatitis': {
    antibioticIndicated: false,
    reason: 'Alcohol-related liver injury, not a primary bacterial infection.',
    summary: 'Abstinence plus nutritional support. Severe disease needs inpatient care.',
    options: [
      supportive('Alcohol cessation support', 'The single most important intervention'),
      supportive('Nutritional support', 'Including thiamine'),
      supportive('Severity scoring', 'Guides steroid consideration in hospital'),
    ],
  },
  Jaundice: {
    antibioticIndicated: false,
    reason: 'A sign, not a diagnosis. Treating it as an infection risks missing the actual cause.',
    summary: 'Investigate the underlying cause before any treatment.',
    options: [
      supportive('Liver function tests and split bilirubin', 'Directs the differential'),
      supportive('Abdominal ultrasound', 'Looks for obstruction'),
      supportive('Viral hepatitis serology', 'Common cause'),
    ],
  },
  Psoriasis: {
    antibioticIndicated: false,
    reason: 'A chronic immune-mediated skin disease, not an infection.',
    summary: 'Topical therapy first; escalate by severity and body surface area.',
    options: [
      supportive('Topical corticosteroid + vitamin D analogue', 'First-line for plaque psoriasis'),
      supportive('Emollients', 'Reduce scaling and irritation'),
      supportive('Dermatology referral', 'For extensive or refractory disease'),
    ],
  },
  'Dimorphic hemmorhoids(piles)': {
    antibioticIndicated: false,
    reason: 'A vascular and structural problem, not an infection.',
    summary: 'Fibre and fluid first. Exclude other causes of rectal bleeding.',
    options: [
      supportive('Increase dietary fibre and fluid', 'First-line'),
      supportive('Topical treatment', 'Short-term symptom relief'),
      supportive('Exclude other causes of bleeding', 'Do not assume haemorrhoids'),
    ],
  },
  'Varicose veins': {
    antibioticIndicated: false,
    reason: 'A venous disorder, not an infection.',
    summary: 'Compression and activity. Refer for skin changes or ulceration.',
    options: [
      supportive('Compression stockings', 'Symptom relief and progression control'),
      supportive('Leg elevation and activity', 'Reduces venous pressure'),
      supportive('Vascular referral', 'For skin changes, bleeding, or ulceration'),
    ],
  },
  '(vertigo) Paroymsal  Positional Vertigo': {
    antibioticIndicated: false,
    reason: 'A disorder of the inner ear balance organs, not an infection.',
    summary: 'Diagnosed and treated with positional manoeuvres, not medication.',
    options: [
      supportive('Dix-Hallpike test', 'Confirms the diagnosis'),
      supportive('Epley repositioning manoeuvre', 'Definitive treatment for BPPV'),
      supportive('Avoid long-term vestibular sedatives', 'They delay compensation'),
    ],
  },
}

/** Shown when a predicted class somehow has no entry above. */
export const DEFAULT_THERAPY = {
  antibioticIndicated: false,
  reason: 'No reference entry exists for this condition in this demonstration dataset.',
  summary: 'Identify the pathogen before prescribing. Culture and sensitivity testing guides therapy.',
  options: [
    supportive('Clinical assessment', 'No automated recommendation available'),
    supportive('Culture and sensitivity first', 'Identify the pathogen before prescribing'),
    supportive('Specialist consultation', 'Where the diagnosis is uncertain'),
  ],
}

/**
 * Look up therapy guidance for a predicted condition.
 *
 * Matching is exact on the trimmed key. The previous implementation fell back to
 * a bidirectional case-insensitive substring match, which could map one
 * condition onto a similarly named but clinically unrelated one — for example
 * any string containing "hepatitis" collapsing onto a single entry.
 *
 * @param {string} condition A class name from the model.
 * @returns {object} The therapy entry, or DEFAULT_THERAPY if unknown.
 */
export const getTherapy = (condition) => {
  if (!condition) return DEFAULT_THERAPY

  if (THERAPY_DATA[condition]) return THERAPY_DATA[condition]

  // Tolerate stray leading/trailing whitespace in class names only.
  const trimmed = condition.trim()
  const key = Object.keys(THERAPY_DATA).find((k) => k.trim() === trimmed)
  return key ? THERAPY_DATA[key] : DEFAULT_THERAPY
}

/** Resistance percentage → colour, per the stewardship thresholds in the UI legend. */
export const getResistanceColor = (pct) => {
  if (pct === null || pct === undefined) return '#64748B'
  if (pct < 20) return '#16A34A' // green
  if (pct < 40) return '#D97706' // amber
  return '#DC2626' // red
}

/** WHO AWaRe category → colour. */
export const getAwareColor = (aware) => {
  const map = {
    Access: '#16A34A',
    Watch: '#D97706',
    Reserve: '#DC2626',
  }
  return map[aware] || '#64748B'
}
