import useAppStore from '../store/useAppStore'

function timeAgo(isoString) {
  if (!isoString) return null
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000)
  if (diff < 0) return 'clock skew — check the system date'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function Divider() {
  return <div className="h-4 w-px bg-slate-300" aria-hidden="true" />
}

/**
 * System status strip.
 *
 * Health polling lives in App.jsx only — this component reads from the store.
 * It previously ran its own 30-second interval alongside App's, so the API was
 * being polled twice for the same data.
 *
 * The old version also displayed a green pulsing "WHO GLASS: Live" indicator.
 * No GLASS integration exists, so that has been replaced with an honest status.
 */
export default function StatusBar() {
  const { health, healthLoading, healthError, knownSymptoms, knownConditions } = useAppStore()

  const modelsLoaded = health?.models_loaded ?? false
  const trainedAt = health?.model_metadata?.trained_at
  const synced = timeAgo(trainedAt)
  const conditionCount = knownConditions.length || health?.model_metadata?.dataset?.num_classes || 41
  const symptomCount = knownSymptoms.length || health?.model_metadata?.dataset?.num_features || 131

  return (
    <div className="w-full bg-navy/5 border-y border-navy/10 py-3">
      <div className="max-w-7xl mx-auto px-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">

        {/* API status */}
        <div className="flex items-center gap-2">
          {healthLoading ? (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" aria-hidden="true" />
              <span className="text-slate-500">Checking API…</span>
            </>
          ) : healthError ? (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
              <span className="text-red-700 font-semibold">API unreachable</span>
            </>
          ) : (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
                  aria-hidden="true"
                />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
              </span>
              <span className="text-navy font-semibold">API connected</span>
            </>
          )}
        </div>

        <Divider />

        {/* Models */}
        <div className="flex items-center gap-1.5 text-slate-600">
          <span className="font-bold text-navy">3</span>
          <span>ML models</span>
          <span
            className={`ml-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
              modelsLoaded ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {modelsLoaded ? 'Ready' : 'Not loaded'}
          </span>
        </div>

        <Divider />

        {/* Vocabulary */}
        <div className="flex items-center gap-1.5 text-slate-600">
          <span className="font-bold text-navy">{conditionCount}</span>
          <span>conditions ·</span>
          <span className="font-bold text-navy">{symptomCount}</span>
          <span>symptoms</span>
        </div>

        {synced && (
          <>
            <Divider />
            <div className="flex items-center gap-1.5 text-slate-500">
              <span>Models trained {synced}</span>
            </div>
          </>
        )}

        <Divider />

        {/* Honest data provenance — no GLASS integration exists yet */}
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-600">
            Resistance data: placeholder
          </span>
        </div>
      </div>
    </div>
  )
}
