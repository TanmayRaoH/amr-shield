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
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full flex flex-col max-h-[90vh]">
        {/* Fixed header */}
        <div className="flex items-start gap-3 p-7 pb-4">
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

        <div id="disclaimer-body" className="overflow-y-auto px-7 space-y-3 text-sm text-slate-600 leading-relaxed flex-1">
          <p>
            This tool is <strong className="text-navy">not a doctor</strong> and cannot
            be used to diagnose or treat any illness. Always see a real doctor before
            taking any medicine.
          </p>

          <ul className="space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <li className="flex gap-2">
              <span className="text-slate-400" aria-hidden="true">–</span>
              <span>
                This app gives you a <strong className="text-navy">possible condition</strong> based
                on your symptoms — it is not a confirmed diagnosis.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400" aria-hidden="true">–</span>
              <span>
                It will tell you whether an antibiotic is likely needed or not —
                but a <strong className="text-navy">doctor must make the final call</strong>.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400" aria-hidden="true">–</span>
              <span>
                If you select your country, the app shows how well certain antibiotics
                are still working there, based on <strong className="text-navy">WHO global data</strong>.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400" aria-hidden="true">–</span>
              <span>
                The confidence shown is an estimate — not a guarantee.
                Always trust your doctor over this app.
              </span>
            </li>
          </ul>

          <p className="text-xs text-slate-500 pb-2">
            Your symptom data is never stored or shared. History is saved only on your own device.
          </p>
        </div>

        {/* Fixed footer button — always visible */}
        <div className="p-7 pt-4">
          <button
            ref={acceptRef}
            onClick={acceptDisclaimer}
            className="w-full py-3 bg-navy text-white font-bold rounded-xl hover:bg-navy-light focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 transition-colors"
          >
            I understand — for research and educational purposes
          </button>
        </div>
      </div>
    </div>
  )
}
