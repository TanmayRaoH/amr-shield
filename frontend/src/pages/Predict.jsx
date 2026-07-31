import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import { runPrediction } from '../services/api'
import {
  ALL_SYMPTOMS,
  PRESET_CASES,
  formatSymptom,
  groupSymptoms,
  normaliseQuery,
} from '../data/symptoms'

const MIN_SYMPTOMS = 3
// The training cases average ~4 symptoms. Beyond roughly double that, the input
// stops resembling anything the models were fitted on, so warn rather than block.
const SYMPTOM_SOFT_LIMIT = 8

export default function Predict() {
  const navigate = useNavigate()
  const {
    selectedSymptoms, addSymptom, removeSymptom, clearSymptoms, setSymptoms,
    setPredictionResult, setPredictionLoading, setPredictionError, dismissPredictionError,
    addToHistory, health, healthError,
    knownSymptoms, symptomsLoaded,
    predictionLoading, predictionError,
  } = useAppStore()

  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')

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

  const applyPreset = (preset) => {
    dismissPredictionError()
    setSymptoms(preset.symptoms)
    setActiveCategory('All')
    setSearch('')
  }

  const handleAnalyse = async () => {
    if (!canSubmit) return
    setPredictionLoading()
    try {
      const result = await runPrediction(selectedSymptoms)
      setPredictionResult(result)
      addToHistory({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        symptoms: [...selectedSymptoms],
        result,
      })
      navigate('/results')
    } catch (err) {
      // api.js normalises every failure into a user-safe message.
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

        {/* Preset cases — removes the friction of hand-picking from 131 chips */}
        <div className="mb-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Or start from an example
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESET_CASES.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                title={preset.description}
                className="text-left px-3 py-2 bg-white border border-slate-200 rounded-xl hover:border-teal hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
              >
                <span className="block text-sm font-bold text-navy">{preset.label}</span>
                <span className="block text-xs text-slate-500">{preset.description}</span>
              </button>
            ))}
          </div>
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
                  Pick from the list or use an example above.
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
              Research demonstration only. Not medical advice, and not for use with real
              patients.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
