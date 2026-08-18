import { Link } from 'react-router-dom'
import StatusBar from '../components/StatusBar'

const FEATURES = [
  {
    title: 'Knows when to abstain',
    desc: 'Below a confidence threshold the result is flagged as insufficient signal instead of being presented as a confident answer.',
  },
  {
    title: 'Antibiotic stewardship',
    desc: 'Where antibiotics are not appropriate, the tool says so. Recommendations carry WHO Access, Watch, or Reserve categories.',
  },
  {
    title: 'Transparent uncertainty',
    desc: 'Ranked alternatives with their probabilities are shown alongside the top prediction, so close calls are visible rather than hidden.',
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
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-4 mt-8">
              {['WHO AWaRe labels', 'Open source'].map((badge) => (
                <span key={badge} className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full">
                  ✓ {badge}
                </span>
              ))}
            </div>
          </div>

          {/* Right — How to use steps */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            <p className="text-center text-xs font-semibold text-slate-400 uppercase tracking-widest mb-6">
              How to use
            </p>
            <div className="space-y-6">
              {[
                {
                  step: '1',
                  title: 'Select your symptoms',
                  desc: 'Choose from a clinically validated list of symptoms you are experiencing.',
                  color: 'bg-blue-50 text-blue-700 border-blue-200',
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                      <rect x="9" y="3" width="6" height="4" rx="1" />
                      <path d="M9 12h6M9 16h6" />
                    </svg>
                  ),
                },
                {
                  step: '2',
                  title: 'Get a prediction',
                  desc: 'Your inputs are analysed and matched against known patterns to return a ranked condition prediction.',
                  color: 'bg-green-50 text-green-700 border-green-200',
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  ),
                },
                {
                  step: '3',
                  title: 'View guidance',
                  desc: 'See whether antibiotics are appropriate and what WHO stewardship says.',
                  color: 'bg-amber-50 text-amber-700 border-amber-200',
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 12l2 2 4-4" />
                      <path d="M12 2a10 10 0 110 20 10 10 0 010-20z" />
                    </svg>
                  ),
                },
              ].map(({ step, title, desc, color, icon }) => (
                <div key={step} className="flex items-start gap-4">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full ${color} border flex items-center justify-center`}>
                    {icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-navy text-sm">
                      <span className="text-teal mr-1">Step {step}.</span>
                      {title}
                    </h3>
                    <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 pt-5 border-t border-slate-100 text-center">
              <Link
                to="/predict"
                className="inline-flex items-center gap-2 text-sm font-semibold text-teal hover:text-teal-light transition-colors"
              >
                Try it now
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
