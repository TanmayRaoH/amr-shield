import { useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import useAppStore from '../store/useAppStore'
import {
  DATA_PROVENANCE,
  getTherapy,
  getAwareColor,
  getResistanceColor,
} from '../data/antibiotics'
import { formatSymptom } from '../data/symptoms'

// ── Confidence Donut ────────────────────────────────────────────────────────
function ConfidenceDonut({ confidence, color = '#0F2D5C' }) {
  const pct = Math.round(confidence * 100)
  const circumference = 2 * Math.PI * 45
  const offset = circumference - (pct / 100) * circumference

  return (
    <svg width="110" height="110" viewBox="0 0 110 110" role="img"
      aria-label={`${pct} percent model probability`}>
      <circle cx="55" cy="55" r="45" fill="none" stroke="#E2E8F0" strokeWidth="10" />
      <circle
        cx="55" cy="55" r="45" fill="none"
        stroke={color} strokeWidth="10"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 55 55)"
        className="animate-dash"
        style={{ '--target-offset': offset, transition: 'stroke-dashoffset 1.2s ease-out' }}
      />
      <text x="55" y="52" textAnchor="middle" fontSize="18" fontWeight="800" fill={color}>
        {pct}%
      </text>
      <text x="55" y="68" textAnchor="middle" fontSize="9" fill="#94A3B8">
        probability
      </text>
    </svg>
  )
}

// ── Model Card ──────────────────────────────────────────────────────────────
const MODEL_COLORS = {
  'Logistic Regression': '#3B82F6',
  'Random Forest': '#10B981',
  XGBoost: '#F59E0B',
}

function ModelCard({ name, prediction, confidence, agrees }) {
  const color = MODEL_COLORS[name] || '#0F2D5C'
  return (
    <div
      className={`bg-white rounded-xl border p-5 card-hover ${
        agrees ? 'border-navy/30' : 'border-amber-300 bg-amber-50/40'
      }`}
    >
      <span
        className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-2 ${
          agrees ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'
        }`}
      >
        {agrees ? 'Agrees with ensemble' : 'Dissents'}
      </span>
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{name}</p>
          <p className="text-lg font-extrabold text-navy mt-0.5">{prediction}</p>
        </div>
        <ConfidenceDonut confidence={confidence} color={color} />
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${confidence * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

// ── Therapy Card ────────────────────────────────────────────────────────────
function TherapyCard({ option, rank }) {
  const { name, amrScore, resistance, aware, note } = option
  const hasResistanceData = resistance !== null && resistance !== undefined
  const resColor = getResistanceColor(resistance)
  const awareColor = getAwareColor(aware)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 card-hover">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <span className="text-xs font-bold text-slate-400">#{rank}</span>
          <h4 className="font-extrabold text-navy text-base">{name}</h4>
          <p className="text-xs text-slate-500 mt-0.5">{note}</p>
        </div>
        {aware !== 'Not applicable' && (
          <span
            className="px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap"
            style={{ backgroundColor: `${awareColor}20`, color: awareColor }}
          >
            {aware === 'Not classified' ? 'Outside AWaRe' : `AWaRe: ${aware}`}
          </span>
        )}
      </div>

      {hasResistanceData && (
        <>
          <div className="mb-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Resistance rate (illustrative)</span>
              <span style={{ color: resColor }} className="font-bold">
                {resistance}%
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${resistance}%`, backgroundColor: resColor }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">AMR score</span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${amrScore}%`, backgroundColor: resColor }}
              />
            </div>
            <span className="text-xs font-bold" style={{ color: resColor }}>
              {amrScore}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main Results Page ───────────────────────────────────────────────────────
export default function Results() {
  const navigate = useNavigate()
  const { predictionResult, selectedSymptoms, clearSymptoms, clearPrediction } = useAppStore()

  useEffect(() => {
    if (!predictionResult) navigate('/predict', { replace: true })
  }, [predictionResult, navigate])

  if (!predictionResult) {
    return (
      <div className="min-h-screen bg-off-white flex items-center justify-center">
        <p className="text-slate-500">No active result — returning to symptom input…</p>
      </div>
    )
  }

  const {
    comparison,
    final_prediction,
    final_prediction_source,
    ensemble_confidence,
    confidence_level,
    low_confidence,
    agreement_count,
    total_models = 3,
    agreeing_models = [],
    differentials = [],
    unrecognized_symptoms,
    recognized_symptoms,
  } = predictionResult

  const therapy = getTherapy(final_prediction)
  const options = therapy.options || []

  // Only antibacterial entries carry resistance data worth charting.
  const chartData = options
    .filter((o) => o.resistance !== null && o.resistance !== undefined && o.resistance > 0)
    .map((o) => ({ name: o.name.split(/[\s(+]/)[0], resistance: o.resistance }))

  const topAware = options.find((o) => o.aware === 'Watch' || o.aware === 'Reserve')
  const agreementCount = agreement_count ?? agreeing_models.length
  const fullAgreement = agreementCount === total_models

  const confidenceStyles = {
    high: 'bg-green-100 text-green-800',
    moderate: 'bg-amber-100 text-amber-800',
    low: 'bg-red-100 text-red-800',
  }

  const handleNewDiagnosis = () => {
    clearSymptoms()
    clearPrediction()
    navigate('/predict')
  }

  return (
    <div className="min-h-screen bg-off-white">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold text-navy">Results</h1>
            <p className="text-slate-500 mt-1">
              Based on {recognized_symptoms?.length || selectedSymptoms.length} recognised symptoms
            </p>
          </div>
          <button
            onClick={handleNewDiagnosis}
            className="px-4 py-2 border-2 border-navy text-navy font-semibold rounded-xl hover:bg-navy hover:text-white transition-colors text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            ← New analysis
          </button>
        </div>

        {/* Persistent disclaimer */}
        <div className="bg-slate-100 border border-slate-300 rounded-xl p-4 text-sm text-slate-600">
          <strong className="text-navy">Not medical advice.</strong> This is a research
          demonstration trained on 304 unique symptom combinations. Do not use it for any real
          clinical decision.
        </div>

        {/* Low confidence — abstain */}
        {low_confidence && (
          <div
            role="alert"
            className="bg-red-50 border border-red-300 rounded-xl p-5 flex items-start gap-3"
          >
            <span className="text-red-500 font-bold text-xl" aria-hidden="true">!</span>
            <div>
              <p className="font-bold text-red-800">Insufficient signal for a confident answer</p>
              <p className="text-sm text-red-700 mt-1">
                The ensemble probability is only{' '}
                {Math.round((ensemble_confidence ?? 0) * 100)}%. The symptom combination you
                entered does not closely match any pattern in the training data. Treat the
                prediction below as a weak hint at best — clinical evaluation is the appropriate
                next step.
              </p>
            </div>
          </div>
        )}

        {/* Antibiotic appropriateness — the core stewardship message */}
        {therapy.antibioticIndicated ? (
          topAware && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
              <span className="text-amber-600 font-bold text-xl" aria-hidden="true">!</span>
              <div>
                <p className="font-bold text-amber-800">Stewardship warning</p>
                <p className="text-sm text-amber-700">
                  This regimen includes <strong>{topAware.name}</strong>, a WHO{' '}
                  <strong>{topAware.aware}</strong> category agent. Prefer a narrower Access-group
                  option where it provides adequate cover.
                </p>
              </div>
            </div>
          )
        ) : (
          <div className="bg-blue-50 border border-blue-300 rounded-xl p-4 flex items-start gap-3">
            <span className="text-blue-600 font-bold text-xl" aria-hidden="true">✓</span>
            <div>
              <p className="font-bold text-blue-900">Antibiotics are not indicated here</p>
              <p className="text-sm text-blue-800">
                {therapy.reason} Prescribing an antibiotic anyway offers no benefit and drives
                resistance.
              </p>
            </div>
          </div>
        )}

        {/* Symptom breadcrumb */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Symptoms entered</p>
          <div className="flex flex-wrap gap-1.5">
            {(recognized_symptoms || selectedSymptoms).map((s) => (
              <span
                key={s}
                className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full text-xs font-medium"
              >
                {formatSymptom(s)}
              </span>
            ))}
            {unrecognized_symptoms?.map((s) => (
              <span
                key={s}
                className="bg-red-50 text-red-500 border border-red-200 px-2 py-0.5 rounded-full text-xs line-through"
                title="Not a recognised training feature — excluded from the prediction"
              >
                {formatSymptom(s)}
              </span>
            ))}
          </div>
          {unrecognized_symptoms?.length > 0 && (
            <p className="text-xs text-slate-400 mt-2">
              Struck-through symptoms were not recognised and did not affect the result.
            </p>
          )}
        </div>

        {/* Section A — Verdict */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            Most likely condition
          </p>
          <h2 className="text-4xl font-extrabold text-navy mb-4">{final_prediction}</h2>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <span
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-bold text-sm ${
                fullAgreement ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {fullAgreement ? '✓' : '△'} {agreementCount}/{total_models} models agree
            </span>

            {confidence_level && (
              <span
                className={`px-4 py-1.5 rounded-full font-bold text-sm ${
                  confidenceStyles[confidence_level] || 'bg-slate-100 text-slate-700'
                }`}
              >
                {Math.round((ensemble_confidence ?? 0) * 100)}% — {confidence_level} confidence
              </span>
            )}
          </div>

          {final_prediction_source && (
            <p className="text-xs text-slate-400 mt-4">
              Decided by {final_prediction_source}. Probabilities are uncalibrated.
            </p>
          )}
        </div>

        {/* Differentials */}
        {differentials.length > 1 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-extrabold text-navy mb-1">Ranked alternatives</h3>
            <p className="text-xs text-slate-400 mb-4">
              Next most probable conditions from the same ensemble. A close second means the
              result is not clear-cut.
            </p>
            <ul className="space-y-2">
              {differentials.map((d, i) => (
                <li key={d.condition} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                  <span
                    className={`flex-1 text-sm ${
                      i === 0 ? 'font-bold text-navy' : 'text-slate-600'
                    }`}
                  >
                    {d.condition}
                  </span>
                  <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-navy"
                      style={{ width: `${Math.max(d.probability * 100, 1)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-500 w-12 text-right">
                    {(d.probability * 100).toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Section B — Model comparison */}
        <div>
          <h3 className="text-lg font-extrabold text-navy mb-1">Model comparison</h3>
          <p className="text-xs text-slate-400 mb-4">
            Each model votes independently. The final answer is the mean of their probability
            distributions, so a dissenting model does not automatically decide the outcome.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            {Object.entries(comparison).map(([name, { prediction, confidence }]) => (
              <ModelCard
                key={name}
                name={name}
                prediction={prediction}
                confidence={confidence}
                agrees={prediction === final_prediction}
              />
            ))}
          </div>
        </div>

        {/* Section C — Therapy guidance */}
        <div>
          <h3 className="text-lg font-extrabold text-navy mb-1">
            {therapy.antibioticIndicated ? 'Antibiotic guidance' : 'Management guidance'}
          </h3>
          {therapy.summary && <p className="text-sm text-slate-500 mb-4">{therapy.summary}</p>}
          <div className="grid md:grid-cols-3 gap-4">
            {options.map((option, i) => (
              <TherapyCard key={option.name} option={option} rank={i + 1} />
            ))}
          </div>
        </div>

        {/* Section D — Resistance chart */}
        {chartData.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-lg font-extrabold text-navy">Resistance overview</h3>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" aria-hidden="true" />
                &lt;20% low
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block ml-2" aria-hidden="true" />
                20–40% moderate
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block ml-2" aria-hidden="true" />
                &gt;40% high
              </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} domain={[0, 100]} unit="%" />
                <Tooltip formatter={(v) => [`${v}%`, 'Resistance']} />
                <Bar dataKey="resistance" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={getResistanceColor(entry.resistance)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-3">
              {DATA_PROVENANCE} Wiring real WHO GLASS or local antibiogram data is tracked in
              improvements.md.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Link
            to="/history"
            className="px-4 py-2 border border-slate-300 text-slate-600 rounded-xl text-sm font-medium hover:border-navy hover:text-navy transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
          >
            View history
          </Link>
          <button
            onClick={handleNewDiagnosis}
            className="px-6 py-2 bg-navy text-white rounded-xl text-sm font-bold hover:bg-navy-light transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
          >
            New analysis →
          </button>
        </div>
      </div>
    </div>
  )
}
