import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import { fetchHistory, deleteHistory as apiDeleteHistory } from '../services/api'
import { formatSymptom } from '../data/symptoms'

/**
 * Escape a value for CSV. A field containing a comma, quote, or newline must be
 * quoted, and any embedded quote must be doubled. The previous implementation
 * wrapped every value in quotes without escaping, so a condition name
 * containing a quote produced a malformed file.
 */
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCSV(history) {
  const headers = [
    'Timestamp',
    'Symptoms',
    'Final Prediction',
    'Ensemble Confidence',
    'Confidence Level',
    'Agreement',
    'LR Prediction',
    'LR Confidence',
    'RF Prediction',
    'RF Confidence',
    'XGB Prediction',
    'XGB Confidence',
  ]

  const rows = history.map((h) => {
    const r = h.result || {}
    const c = r.comparison || {}
    const total = r.total_models ?? 3
    const agreed = r.agreement_count ?? (r.model_agreement ? total : '')
    return [
      new Date(h.timestamp).toLocaleString(),
      (h.symptoms || []).join('; '),
      r.final_prediction || '',
      r.ensemble_confidence ?? '',
      r.confidence_level || '',
      agreed === '' ? '' : `${agreed}/${total}`,
      c['Logistic Regression']?.prediction || '',
      c['Logistic Regression']?.confidence ?? '',
      c['Random Forest']?.prediction || '',
      c['Random Forest']?.confidence ?? '',
      c['XGBoost']?.prediction || '',
      c['XGBoost']?.confidence ?? '',
    ]
  })

  const csv = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `amr-shield-history-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const CONFIDENCE_STYLES = {
  high: 'bg-green-100 text-green-700',
  moderate: 'bg-amber-100 text-amber-800',
  low: 'bg-red-100 text-red-700',
}

export default function History() {
  const { history: localHistory, clearHistory: clearLocalHistory } = useAppStore()
  const [filter, setFilter] = useState('')
  const [sortDesc, setSortDesc] = useState(true)
  const [confirmingClear, setConfirmingClear] = useState(false)

  // DB-backed history — loaded on mount, falls back to localStorage if API unavailable
  const [dbHistory, setDbHistory] = useState(null)  // null = loading, [] = loaded empty
  const [dbError, setDbError] = useState(false)
  const [dbLoading, setDbLoading] = useState(true)

  useEffect(() => {
    fetchHistory(50)
      .then((res) => {
        setDbHistory(res.history || [])
        setDbLoading(false)
      })
      .catch(() => {
        setDbError(true)
        setDbLoading(false)
      })
  }, [])

  // Use DB history if available, otherwise fall back to localStorage
  // Deduplicate: DB is source of truth — only show localStorage entries
  // that don't already exist in the DB (matched by prediction + timestamp proximity)
  const history = useMemo(() => {
    if (dbHistory !== null && !dbError) {
      return dbHistory  // DB is authoritative — use it exclusively
    }
    return localHistory  // fallback to localStorage
  }, [dbHistory, dbError, localHistory])

  const source = dbHistory !== null && !dbError ? 'database' : 'browser'

  const handleClearAll = async () => {
    if (dbHistory !== null && !dbError) {
      // Clear from DB
      await apiDeleteHistory().catch(() => {})
      setDbHistory([])
    }
    clearLocalHistory()
    setConfirmingClear(false)
  }

  const filtered = useMemo(() => {
    const query = filter.toLowerCase().trim()
    return history
      .filter(
        (h) =>
          !query ||
          h.result?.final_prediction?.toLowerCase().includes(query) ||
          h.symptoms?.some((s) => s.toLowerCase().includes(query)),
      )
      .sort((a, b) =>
        sortDesc
          ? new Date(b.timestamp) - new Date(a.timestamp)
          : new Date(a.timestamp) - new Date(b.timestamp),
      )
  }, [history, filter, sortDesc])

  return (
    <div className="min-h-screen bg-off-white">
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-navy">Prediction History</h1>
            <p className="text-slate-500 mt-1">
              {dbLoading ? (
                'Loading history…'
              ) : (
                <>
                  {history.length} saved prediction{history.length !== 1 ? 's' : ''}
                  {' · '}
                  {source === 'database' ? (
                    <span className="text-teal font-medium">synced to database</span>
                  ) : (
                    <span className="text-amber-600">stored in this browser (DB unavailable)</span>
                  )}
                </>
              )}
            </p>
          </div>
          {history.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => downloadCSV(history)}
                className="px-4 py-2 bg-teal text-white text-sm font-semibold rounded-xl hover:bg-teal-light transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy"
              >
                Export CSV
              </button>
              <button
                onClick={() => setConfirmingClear(true)}
                className="px-4 py-2 border border-red-200 text-red-500 text-sm font-medium rounded-xl hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Clear confirmation */}
        {confirmingClear && (
          <div className="mb-4 bg-red-50 border border-red-300 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-red-800">
              Delete all {history.length} saved predictions? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmingClear(false)}
                className="px-3 py-1.5 border border-slate-300 text-slate-600 text-sm rounded-lg hover:bg-white"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700"
              >
                Delete all
              </button>
            </div>
          </div>
        )}

        {history.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
            <h2 className="text-xl font-bold text-navy mb-2">No history yet</h2>
            <p className="text-slate-500 mb-6">Run your first analysis to see results here.</p>
            <Link
              to="/predict"
              className="inline-block px-6 py-2.5 bg-navy text-white font-bold rounded-xl hover:bg-navy-light transition-colors"
            >
              Start analysis →
            </Link>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <label htmlFor="history-filter" className="sr-only">
                Filter history
              </label>
              <input
                id="history-filter"
                type="text"
                placeholder="Filter by condition or symptom..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="flex-1 min-w-48 px-4 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:outline-none focus:border-navy"
              />
              <button
                onClick={() => setSortDesc((d) => !d)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-sm bg-white hover:border-navy text-slate-600"
              >
                {sortDesc ? 'Newest first' : 'Oldest first'}
              </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Saved predictions with condition, confidence, symptoms, and model agreement
                </caption>
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Time', 'Condition', 'Confidence', 'Symptoms', 'Agreement'].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="text-left py-3 px-4 text-xs font-bold text-slate-400 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => {
                    const r = entry.result || {}
                    // Fall back to the XGBoost score for entries saved before the
                    // ensemble was introduced.
                    const confidence =
                      r.ensemble_confidence ?? r.comparison?.['XGBoost']?.confidence ?? 0
                    const total = r.total_models ?? 3
                    const agreed = r.agreement_count ?? (r.model_agreement ? total : null)
                    const level = r.confidence_level

                    return (
                      <tr
                        key={entry.id}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-3 px-4 text-slate-500 text-xs whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-bold text-navy">
                          {r.final_prediction || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-navy rounded-full"
                                style={{ width: `${confidence * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-slate-600">
                              {(confidence * 100).toFixed(0)}%
                            </span>
                            {level && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                  CONFIDENCE_STYLES[level] || 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {level}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {(entry.symptoms || []).slice(0, 3).map((s) => (
                              <span
                                key={s}
                                className="bg-blue-50 text-blue-600 text-xs px-1.5 py-0.5 rounded-full"
                              >
                                {formatSymptom(s)}
                              </span>
                            ))}
                            {entry.symptoms?.length > 3 && (
                              <span className="text-slate-400 text-xs">
                                +{entry.symptoms.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {agreed === null ? (
                            <span className="text-slate-400 text-xs">—</span>
                          ) : (
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${
                                agreed === total
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {agreed}/{total}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <p className="text-center text-slate-400 py-8">No results match your filter.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
