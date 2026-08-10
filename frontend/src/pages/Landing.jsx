import { Link } from 'react-router-dom'
import PipelineDiagram from '../components/PipelineDiagram'
import StatusBar from '../components/StatusBar'

const FEATURES = [
  {
    title: 'Soft-voting ensemble',
    desc: 'Logistic Regression, Random Forest, and XGBoost each produce a full probability distribution. The three are averaged rather than deferring to one model, and you see every vote.',
  },
  {
    title: 'Honest agreement count',
    desc: 'The badge reports how many models actually back the answer. A dissenting model is shown as a dissent, not hidden behind a fixed label.',
  },
  {
    title: 'Knows when to abstain',
    desc: 'Below a 40% ensemble probability the result is flagged as insufficient signal instead of being presented as a confident answer.',
  },
  {
    title: 'Says no to antibiotics',
    desc: 'For the 34 of 41 classes where antibiotics are not appropriate, the result explains why rather than recommending a drug. Declining to prescribe is the point of stewardship.',
  },
  {
    title: 'AWaRe stewardship labels',
    desc: 'Options carry WHO Access, Watch, or Reserve categories, with a warning when a regimen reaches for a Watch or Reserve agent.',
  },
  {
    title: 'Ranked alternatives',
    desc: 'The next most probable conditions are listed with their probabilities, so a close second is visible instead of being discarded.',
  },
  {
    title: 'Stated limitations',
    desc: 'The methodology page publishes the real cross-validated scores, the true training set size, and what the tool cannot do.',
  },
  {
    title: 'Local history and CSV export',
    desc: 'Analyses are stored in your browser and survive a refresh. Export the full comparison to CSV at any time.',
  },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-off-white">

      {/* ── Hero ── */}
      <section className="max-w-7xl mx-auto px-6 pt-16 pb-12">
        <div className="grid lg:grid-cols-2 gap-12 items-center">

          {/* Left — Text */}
          <div>
            <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 text-sm font-semibold px-3 py-1 rounded-full mb-6">
              Research demonstration · for educational purposes
            </div>

            <h1 className="text-4xl lg:text-5xl font-extrabold text-navy leading-tight mb-4">
              Symptom-driven<br />
              <span className="text-teal">condition prediction</span><br />
              with stewardship guidance
            </h1>

            <p className="text-lg text-slate-600 mb-8 max-w-md leading-relaxed">
              Enter symptoms. Three ML models each vote, and their probabilities are averaged
              into one answer with an honest confidence band. Where antibiotics are not
              appropriate, the tool says so.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/predict"
                className="px-6 py-3 bg-navy text-white font-bold rounded-xl hover:bg-navy-light transition-colors shadow-md"
              >
                Start Diagnosis →
              </Link>
              <Link
                to="/about"
                className="px-6 py-3 border-2 border-navy text-navy font-bold rounded-xl hover:bg-navy hover:text-white transition-colors"
              >
                View Methodology
              </Link>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-4 mt-8">
              {['41 conditions', '131 symptoms', 'WHO AWaRe labels', 'Open source'].map((badge) => (
                <span key={badge} className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full">
                  ✓ {badge}
                </span>
              ))}
            </div>
          </div>

          {/* Right — Pipeline diagram */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            <p className="text-center text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
              How it works
            </p>
            <PipelineDiagram />
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Input', val: 'Symptoms', color: 'bg-blue-50 text-blue-700' },
                { label: 'Engine', val: '3 ML Models', color: 'bg-green-50 text-green-700' },
                { label: 'Output', val: 'Diagnosis', color: 'bg-amber-50 text-amber-700' },
              ].map(({ label, val, color }) => (
                <div key={label} className={`${color} rounded-lg p-2`}>
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="text-sm font-bold">{val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Live Stats Bar ── */}
      <StatusBar />

      {/* ── Features ── */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-extrabold text-navy text-center mb-2">
          What this build does differently
        </h2>
        <p className="text-slate-500 text-center mb-10 max-w-2xl mx-auto">
          Most symptom checkers report a confident-looking label and stop. The emphasis here is on
          showing the disagreement, the uncertainty, and the cases where no antibiotic is the right
          answer.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map(({ title, desc }) => (
            <div key={title} className="bg-white rounded-xl border border-slate-200 p-6 card-hover">
              <h3 className="font-bold text-navy mb-2">{title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-navy text-white py-16 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-extrabold mb-4">Try it with an example case</h2>
          <p className="text-slate-300 mb-8">
            Three preset cases are one click away, or pick your own symptoms. Read the
            methodology page first if you want to know what the numbers actually mean.
          </p>
          <Link
            to="/predict"
            className="inline-block px-8 py-4 bg-teal text-white font-bold text-lg rounded-xl hover:bg-teal-light transition-colors shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
          >
            Start analysis →
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-slate-200 py-6 px-6 text-center text-sm text-slate-400">
        AMR Shield · symptom-driven condition prediction with stewardship guidance
        <br />
        <span className="text-slate-500">
          For research and educational purposes. Always consult a qualified clinician before making any prescribing decision.
        </span>
      </footer>
    </div>
  )
}
