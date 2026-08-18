import { Link } from 'react-router-dom'

export default function Landing() {
  return (
    <div className="min-h-screen bg-off-white">

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 text-sm font-semibold px-3 py-1 rounded-full mb-6">
          Research demonstration · for educational purposes
        </div>

        <h1 className="text-4xl lg:text-5xl font-extrabold text-navy leading-tight mb-6">
          Symptom-driven<br />
          <span className="text-teal">condition prediction</span><br />
          with stewardship guidance
        </h1>

        <p className="text-lg text-slate-600 mb-10 max-w-xl mx-auto leading-relaxed">
          Enter your symptoms and get an informed assessment of possible conditions,
          along with guidance on whether antibiotics may be appropriate.
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <Link
            to="/predict"
            className="px-8 py-4 bg-navy text-white font-bold text-lg rounded-xl hover:bg-navy-light transition-colors shadow-md"
          >
            Start Diagnosis →
          </Link>
          <Link
            to="/about"
            className="px-8 py-4 border-2 border-navy text-navy font-bold text-lg rounded-xl hover:bg-navy hover:text-white transition-colors"
          >
            Learn More
          </Link>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-navy text-white py-16 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-extrabold mb-4">Try it with an example case</h2>
          <p className="text-slate-300 mb-8">
            Preset cases are one click away, or pick your own symptoms. Read the
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
