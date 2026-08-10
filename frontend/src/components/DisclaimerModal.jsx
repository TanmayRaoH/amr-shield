import { useEffect, useRef } from 'react'
import useAppStore from '../store/useAppStore'

/**
 * Blocking medical disclaimer, shown once per browser and remembered in
 * localStorage via the persisted store.
 *
 * A tool that names a condition and lists antibiotics needs the user to
 * acknowledge its limits before they see any output. Previously the only
 * caveat was a single grey line in the landing page footer, which a user could
 * reach the results screen without ever passing.
 */
export default function DisclaimerModal() {
  const { disclaimerAccepted, acceptDisclaimer } = useAppStore()
  const acceptRef = useRef(null)

  // Move focus to the primary action and lock background scroll while open.
  useEffect(() => {
    if (disclaimerAccepted) return

    acceptRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [disclaimerAccepted])

  if (disclaimerAccepted) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
      aria-describedby="disclaimer-body"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-7">
        <div className="flex items-start gap-3 mb-4">
          <span
            className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg"
            aria-hidden="true"
          >
            !
          </span>
          <div>
            <h2 id="disclaimer-title" className="text-xl font-extrabold text-navy">
              Read before you continue
            </h2>
            <p className="text-sm text-slate-500">
              AMR Shield is a research and teaching demonstration.
            </p>
          </div>
        </div>

        <div id="disclaimer-body" className="space-y-3 text-sm text-slate-600 leading-relaxed">
          <p>
            This tool is <strong className="text-navy">not a medical device</strong> and must
            not be used to diagnose, treat, or make prescribing decisions for any real person.
            Always consult a qualified clinician.
          </p>

          <ul className="space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <li className="flex gap-2">
              <span className="text-slate-400" aria-hidden="true">–</span>
              <span>
                The models were trained on{' '}
                <strong className="text-navy">304 unique symptom combinations</strong> across 41
                classes — for research and educational exploration only.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400" aria-hidden="true">–</span>
              <span>
                Only <strong className="text-navy">7 of the 41 target classes</strong> are
                conditions where antibiotics have any role. The tool clearly states when
                antibiotics are not appropriate.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400" aria-hidden="true">–</span>
              <span>
                Live resistance data is fetched from the{' '}
                <strong className="text-navy">WHO GHO API</strong> when a country is selected.
                Global averages are used as fallback where country data is unavailable.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400" aria-hidden="true">–</span>
              <span>
                Confidence scores are model probabilities. Always consult a qualified clinician
                before making any prescribing decision.
              </span>
            </li>
          </ul>

          <p className="text-xs text-slate-500">
            No symptom data leaves your browser except to this project&apos;s own prediction API.
            History is stored locally on this device.
          </p>
        </div>

        <button
          ref={acceptRef}
          onClick={acceptDisclaimer}
          className="mt-6 w-full py-3 bg-navy text-white font-bold rounded-xl hover:bg-navy-light focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 transition-colors"
        >
          I understand — for research and educational purposes
        </button>
      </div>
    </div>
  )
}
