import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import { runPrediction, fetchGlassData } from '../services/api'
import {
  ALL_SYMPTOMS,
  formatSymptom,
  groupSymptoms,
  normaliseQuery,
} from '../data/symptoms'

const MIN_SYMPTOMS = 3
const SYMPTOM_SOFT_LIMIT = 8

// Age groups for context — affects contraindication warnings on results
const AGE_GROUPS = [
  { value: '', label: 'Select age group' },
  { value: 'child', label: 'Child (under 12)' },
  { value: 'adolescent', label: 'Adolescent (12–17)' },
  { value: 'adult', label: 'Adult (18–64)' },
  { value: 'elderly', label: 'Elderly (65+)' },
]

// ISO 3166-1 alpha-3 country codes for the GLASS-enrolled countries
// with the best coverage in WHO GHO (covers most demo-likely selections)
const COUNTRIES = [
  { code: '', label: 'Select country (optional)' },
  { code: 'IND', label: 'India' },
  { code: 'GBR', label: 'United Kingdom' },
  { code: 'USA', label: 'United States' },
  { code: 'DEU', label: 'Germany' },
  { code: 'FRA', label: 'France' },
  { code: 'AUS', label: 'Australia' },
  { code: 'NLD', label: 'Netherlands' },
  { code: 'ZAF', label: 'South Africa' },
  { code: 'BRA', label: 'Brazil' },
  { code: 'CHN', label: 'China' },
  { code: 'NGA', label: 'Nigeria' },
  { code: 'KEN', label: 'Kenya' },
  { code: 'UGA', label: 'Uganda' },
  { code: 'THA', label: 'Thailand' },
  { code: 'PAK', label: 'Pakistan' },
  { code: 'BGD', label: 'Bangladesh' },
  { code: 'PHL', label: 'Philippines' },
  { code: 'JPN', label: 'Japan' },
  { code: 'KOR', label: 'South Korea' },
  { code: 'CAN', label: 'Canada' },
  { code: 'ESP', label: 'Spain' },
  { code: 'ITA', label: 'Italy' },
  { code: 'SWE', label: 'Sweden' },
  { code: 'ZWE', label: 'Zimbabwe' },
]

export default function Predict() {
  const navigate = useNavigate()
  const {
    selectedSymptoms, addSymptom, removeSymptom, clearSymptoms, setSymptoms,
    setPredictionResult, setPredictionLoading, setPredictionError, dismissPredictionError,
    setGlassData, setGlassLoading, setGlassError, clearGlass,
    addToHistory, health, healthError,
    knownSymptoms, symptomsLoaded,
    predictionLoading, predictionError,
  } = useAppStore()

  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')

  // Patient context
  const [ageGroup, setAgeGroup] = useState('')
  const [penicillinAllergy, setPenicillinAllergy] = useState(false)
  const [pregnant, setPregnant] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState('')

  const modelsLoaded = health?.models_loaded ?? false

  // The backend owns the symptom vocabulary. Fall back to the static grouping
  // file only until GET /api/v1/symptoms responds.
  const vocabulary = symptomsLoaded && knownSymptoms.length > 0 ? knownSymptoms : ALL_SYMPTOMS
  const categories = useMemo(() => groupSymptoms(vocabulary), [vocabulary])

  const filteredSymptoms = useMemo(() => {
    const query = normaliseQuery(search)
    const pool =
      activeCategory === 'All' ? [...vocabulary].sort() : categories[activeCategory] || []
    if (!query) return pool
    return pool.filter((s) => s.includes(query))
  }, [search, activeCategory, vocabulary, categories])

  const canSubmit = selectedSymptoms.length >= MIN_SYMPTOMS && !predictionLoading

  const handleAnalyse = async () => {
    if (!canSubmit) return
    setPredictionLoading()
    clearGlass()
    try {
      const result = await runPrediction(selectedSymptoms, selectedCountry || null)
      // Attach patient context to the result so Results page can use it
      const resultWithContext = {
        ...result,
        patientContext: {
          ageGroup: ageGroup || null,
          penicillinAllergy,
          pregnant,
          countryCode: selectedCountry || null,
          countryLabel: COUNTRIES.find(c => c.code === selectedCountry)?.label || null,
        },
      }
      setPredictionResult(resultWithContext)
      addToHistory({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        symptoms: [...selectedSymptoms],
        result: resultWithContext,
      })

      // Fire GLASS fetch in background if country selected — non-blocking
      if (selectedCountry) {
        setGlassLoading()
        fetchGlassData(selectedCountry, result.final_prediction)
          .then(setGlassData)
          .catch((err) => setGlassError(err.userMessage || 'GLASS data unavailable'))
      }

      navigate('/results')
    } catch (err) {
      setPredictionError(err.userMessage || 'Prediction failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-off-white">
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold text-navy mb-1">Symptom Input</h1>
          <p className="text-slate-500">
            Select at least {MIN_SYMPTOMS} symptoms. Below that, the models cannot
            meaningfully discriminate between 41 possible conditions.
          </p>
        </div>

        {/* API unreachable */}
        {healthError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-red-500 font-bold text-lg" aria-hidden="true">!</span>
            <div>
              <p className="font-semibold text-red-800">API unreachable</p>
              <p className="text-sm text-red-700">
                Start the backend with{' '}
                <code className="bg-red-100 px-1 rounded">python -m backend.app</code> from the
                project root.
              </p>
            </div>
          </div>
        )}

        {/* Models not loaded */}
        {modelsLoaded === false && health !== null && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-amber-600 font-bold text-lg" aria-hidden="true">!</span>
            <div>
              <p className="font-semibold text-amber-800">Models not loaded</p>
              <p className="text-sm text-amber-700">
                Run <code className="bg-amber-100 px-1 rounded">python run_training.py</code> and
                restart the Flask server.
              </p>
            </div>
          </div>
        )}

        {/* Prediction error */}
        {predictionError && (
          <div
            role="alert"
            className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3"
          >
            <span className="text-red-500 font-bold text-lg" aria-hidden="true">!</span>
            <div className="flex-1">
              <p className="font-semibold text-red-800">Prediction failed</p>
              <p className="text-sm text-red-700">{predictionError}</p>
            </div>
            <button
              onClick={dismissPredictionError}
              className="text-red-400 hover:text-red-700 text-sm font-bold px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}


        {/* Patient context — affects contraindication warnings on Results */}
        <div className="mb-6 bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Patient context <span className="text-slate-300 font-normal normal-case">(optional — used for contraindication warnings and live WHO GLASS resistance data)</span>
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Country — drives live GLASS resistance lookup */}
            <div>
              <label htmlFor="country" className="block text-xs font-medium text-slate-600 mb-1">
                Country
                <span className="ml-1 text-teal font-semibold">→ live WHO GLASS data</span>
              </label>
              <select
                id="country"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal bg-white"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
              {selectedCountry && (
                <p className="text-xs text-teal mt-1">
                  ✓ Live resistance rates will load from WHO GHO API
                </p>
              )}
            </div>

            {/* Age group */}
            <div>
              <label htmlFor="age-group" className="block text-xs font-medium text-slate-600 mb-1">
                Age group
              </label>
              <select
                id="age-group"
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-navy bg-white"
              >
                {AGE_GROUPS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>

            {/* Penicillin allergy */}
            <div className="flex items-center gap-3 pt-5">
              <input
                type="checkbox"
                id="penicillin-allergy"
                checked={penicillinAllergy}
                onChange={(e) => setPenicillinAllergy(e.target.checked)}
                className="w-4 h-4 accent-navy"
              />
              <label htmlFor="penicillin-allergy" className="text-sm text-slate-700 font-medium">
                Penicillin allergy
              </label>
            </div>

            {/* Pregnancy */}
            <div className="flex items-center gap-3 pt-5">
              <input
                type="checkbox"
                id="pregnant"
                checked={pregnant}
                onChange={(e) => setPregnant(e.target.checked)}
                className="w-4 h-4 accent-navy"
              />
              <label htmlFor="pregnant" className="text-sm text-slate-700 font-medium">
                Pregnant / possibly pregnant
              </label>
            </div>
          </div>

          {/* Active context warnings */}
          {(penicillinAllergy || pregnant || ageGroup === 'child') && (
            <div className="mt-3 flex flex-wrap gap-2">
              {penicillinAllergy && (
                <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-full">
                  ⚠ Penicillin allergy — amoxicillin/ampicillin options will be flagged
                </span>
              )}
              {pregnant && (
                <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-full">
                  ⚠ Pregnancy — tetracyclines, fluoroquinolones, and metronidazole (1st trimester) will be flagged
                </span>
              )}
              {ageGroup === 'child' && (
                <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-full">
                  ⚠ Child — tetracyclines and fluoroquinolones contraindicated
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">

          {/* Left — Symptom picker */}
          <div className="lg:col-span-2 space-y-4">

            {/* Search */}
            <div className="relative">
              <label htmlFor="symptom-search" className="sr-only">
                Search symptoms
              </label>
              <input
                id="symptom-search"
                type="text"
                placeholder="Search symptoms — plain English works too, e.g. burning pee"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy bg-white"
              />
            </div>

            {/* Category filter */}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
              {['All', ...Object.keys(categories)].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  aria-pressed={activeCategory === cat}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy ${
                    activeCategory === cat
                      ? 'bg-navy text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-navy hover:text-navy'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Symptom chips grid */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 max-h-80 overflow-y-auto">
              {filteredSymptoms.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">
                  No symptoms match your search.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {filteredSymptoms.map((s) => {
                    const selected = selectedSymptoms.includes(s)
                    return (
                      <button
                        key={s}
                        onClick={() => (selected ? removeSymptom(s) : addSymptom(s))}
                        aria-pressed={selected}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border focus:outline-none focus-visible:ring-2 focus-visible:ring-navy ${
                          selected
                            ? 'bg-navy text-white border-navy'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-navy hover:text-navy'
                        }`}
                      >
                        {formatSymptom(s)}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400">
              {vocabulary.length} symptoms available
              {symptomsLoaded ? ' (loaded from the trained model)' : ' (offline list)'}
            </p>
          </div>

          {/* Right — Selected symptoms + Analyse */}
          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-navy text-sm">
                  Selected ({selectedSymptoms.length})
                </h2>
                {selectedSymptoms.length > 0 && (
                  <button
                    onClick={clearSymptoms}
                    className="text-xs text-red-500 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {selectedSymptoms.length === 0 ? (
                <p className="text-slate-400 text-xs text-center py-6">
                  No symptoms selected yet.
                  <br />
                  Pick from the list on the left.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {selectedSymptoms.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-full text-xs font-medium"
                    >
                      {formatSymptom(s)}
                      <button
                        onClick={() => removeSymptom(s)}
                        className="hover:text-blue-900 ml-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded"
                        aria-label={`Remove ${formatSymptom(s)}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {selectedSymptoms.length > SYMPTOM_SOFT_LIMIT && (
                <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  Training cases carry about 4 symptoms each. With{' '}
                  {selectedSymptoms.length} selected, this input is unlike anything the models
                  were fitted on, so treat the result with extra caution.
                </p>
              )}
            </div>

            {/* Progress indicator */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex justify-between text-xs text-slate-500 mb-2">
                <span>Minimum symptoms</span>
                <span>
                  {Math.min(selectedSymptoms.length, MIN_SYMPTOMS)}/{MIN_SYMPTOMS}
                </span>
              </div>
              <div
                className="h-2 bg-slate-100 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.min(selectedSymptoms.length, MIN_SYMPTOMS)}
                aria-valuemin={0}
                aria-valuemax={MIN_SYMPTOMS}
              >
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    selectedSymptoms.length >= MIN_SYMPTOMS ? 'bg-green-500' : 'bg-navy'
                  }`}
                  style={{
                    width: `${Math.min((selectedSymptoms.length / MIN_SYMPTOMS) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Analyse button */}
            <button
              onClick={handleAnalyse}
              disabled={!canSubmit}
              aria-busy={predictionLoading}
              className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 ${
                canSubmit
                  ? 'bg-navy text-white hover:bg-navy-light shadow-md hover:shadow-lg'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {predictionLoading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span
                    className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin"
                    aria-hidden="true"
                  />
                  Analysing…
                </span>
              ) : selectedSymptoms.length < MIN_SYMPTOMS ? (
                `Add ${MIN_SYMPTOMS - selectedSymptoms.length} more symptom${
                  MIN_SYMPTOMS - selectedSymptoms.length > 1 ? 's' : ''
                }`
              ) : (
                `Analyse ${selectedSymptoms.length} symptoms →`
              )}
            </button>

            <p className="text-xs text-slate-400 text-center leading-relaxed">
              For research and educational purposes. Always consult a qualified clinician
              before making any prescribing decision.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
