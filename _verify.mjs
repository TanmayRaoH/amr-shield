import fs from 'node:fs'
import * as ab from './frontend/src/data/antibiotics.js'
import * as sym from './frontend/src/data/symptoms.js'

const features = JSON.parse(fs.readFileSync('_features.json', 'utf8'))
const classes = JSON.parse(fs.readFileSync('_classes.json', 'utf8'))

const keys = Object.keys(ab.THERAPY_DATA)
console.log('THERAPY_DATA keys:', keys.length, '| model classes:', classes.length)
console.log('classes with NO therapy entry:', classes.filter((c) => !keys.includes(c)))
console.log('therapy keys not in classes:', keys.filter((k) => !classes.includes(k)))
console.log(
  'classes falling back to DEFAULT:',
  classes.filter((c) => ab.getTherapy(c) === ab.DEFAULT_THERAPY),
)
console.log(
  'antibioticIndicated=false count:',
  classes.filter((c) => !ab.getTherapy(c).antibioticIndicated).length,
)

const categorised = [...new Set(Object.values(sym.SYMPTOM_CATEGORIES).flat())]
console.log('\nstale names in categories:', categorised.filter((c) => !features.includes(c)))
const grouped = sym.groupSymptoms(features)
const reachable = [...new Set(Object.values(grouped).flat())]
console.log('features reachable via groupSymptoms:', reachable.length, '/', features.length)
console.log('unreachable:', features.filter((f) => !reachable.includes(f)))
console.log(
  'bad synonym targets:',
  [...new Set(Object.values(sym.SYMPTOM_SYNONYMS))].filter((v) => !features.includes(v)),
)
console.log(
  'preset symptoms all valid:',
  sym.PRESET_CASES.every((p) => p.symptoms.every((s) => features.includes(s))),
)
console.log('normaliseQuery("burning pee") ->', sym.normaliseQuery('burning pee'))
console.log('formatSymptom("dischromic__patches") ->', sym.formatSymptom('dischromic__patches'))
