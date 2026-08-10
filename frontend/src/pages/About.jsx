import { useState } from 'react'
import PipelineDiagram from '../components/PipelineDiagram'
import useAppStore from '../store/useAppStore'

const STAGES = [
  {
    num: '01',
    title: 'Symptom input and preprocessing',
    desc: 'Symptoms are mapped onto the binary feature columns the models were trained on. The picker is populated from GET /api/v1/symptoms, which reads features.pkl directly, so the UI cannot offer a symptom the models do not recognise. Anything unmatched is reported back explicitly rather than dropped silently.',
  },
  {
    num: '02',
    title: 'Multi-model inference',
    desc: 'The feature vector goes to three independently trained classifiers. Each returns a full probability distribution over all classes. No model sees the others\' output.',
  },
  {
    num: '03',
    title: 'Soft-voting ensemble',
    desc: 'The three probability distributions are averaged and the highest-scoring class becomes the answer. Earlier versions took the answer from XGBoost alone, which is the weakest of the three by cross-validated F1 — averaging removes that arbitrary choice. Agreement is reported as a real count, and results below a 40% ensemble probability are flagged as low confidence instead of being presented as answers.',
  },
]

const INTERPRETABILITY = {
  'Logistic Regression': 'High — coefficients are directly readable',
  'Random Forest': 'Medium — feature importances available',
  XGBoost: 'Low — needs SHAP or similar to explain',
}

export default function About() {
  const { health } = useAppStore()
  const metadata = health?.model_metadata
  const cvScores = metadata?.cross_validation_f1_macro
  const cvWeighted = metadata?.cross_validation_f1_weighted
  const mcScores = metadata?.monte_carlo_f1_macro
  const mcIters = metadata?.monte_carlo_iterations ?? 100
  const dataset = metadata?.dataset
  const confusionMatrices = metadata?.confusion_matrices
  const [showConfusion, setShowConfusion] = useState(false)

  return (
    <div className="min-h-screen bg-off-white">
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-extrabold text-navy mb-2">Methodology</h1>
          <p className="text-slate-500">
            How AMR Shield works, what it is trained on, and where it falls short.
          </p>
        </div>

        {/* Scope */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-xl font-extrabold text-navy mb-3">What this tool actually does</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-3">
            AMR Shield predicts a <strong className="text-navy">condition from a symptom
            checklist</strong>, then looks up reference guidance for that condition. It is a triage
            layer, not a resistance predictor.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            The real antimicrobial resistance problem is different: given an isolated pathogen, a
            specimen type, and patient context, predict susceptibility per antibiotic. That is what
            clinical microbiology labs produce and what prescribers act on. This tool sits{' '}
            <em>in front of</em> that problem, and it is worth being explicit about the boundary —
            symptoms alone cannot determine resistance.
          </p>
        </div>

        {/* Pipeline diagram */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <h2 className="text-xl font-extrabold text-navy mb-6 text-center">3-stage pipeline</h2>
          <PipelineDiagram />
        </div>

        {/* Stage explanations */}
        <div className="space-y-4">
          {STAGES.map(({ num, title, desc }) => (
            <div key={num} className="bg-white rounded-xl border border-slate-200 p-6 flex gap-5">
              <div className="text-3xl font-black text-slate-100 leading-none">{num}</div>
              <div>
                <h3 className="font-extrabold text-navy mb-1">{title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Model performance — read live from the API, never hardcoded */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-xl font-extrabold text-navy mb-1">Model performance</h2>
          <p className="text-xs text-slate-400 mb-4">
            All metrics are read live from{' '}
            <code className="bg-slate-100 px-1 rounded">model_metadata.json</code> via{' '}
            <code className="bg-slate-100 px-1 rounded">/api/v1/health</code> — never hardcoded.
          </p>

          {!cvScores ? (
            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-4">
              Metrics unavailable — the API is unreachable or the models have not been trained yet.
              Run <code className="bg-slate-100 px-1 rounded">python run_training.py</code>.
            </p>
          ) : (
            <div className="space-y-6">

              {/* GroupKFold CV table */}
              <div>
                <h3 className="text-sm font-bold text-navy mb-2">
                  5-Fold GroupKFold Cross-Validation
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    — no identical pattern appears in both train and validation folds
                  </span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">5-Fold GroupKFold CV scores per model</caption>
                    <thead>
                      <tr className="border-b border-slate-200">
                        {['Model', 'F1-macro', 'F1-weighted', 'Interpretability'].map((h) => (
                          <th key={h} scope="col"
                            className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(cvScores).map(([model, score]) => (
                        <tr key={model} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 px-3 font-semibold text-navy">{model}</td>
                          <td className="py-3 px-3 font-bold text-slate-700">{Number(score).toFixed(4)}</td>
                          <td className="py-3 px-3 text-slate-600">
                            {cvWeighted?.[model] != null ? Number(cvWeighted[model]).toFixed(4) : '—'}
                          </td>
                          <td className="py-3 px-3 text-slate-600">{INTERPRETABILITY[model] || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Monte Carlo table */}
              {mcScores && (
                <div>
                  <h3 className="text-sm font-bold text-navy mb-2">
                    {mcIters}-Iteration Monte Carlo Validation
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      — random 80/20 group-aware splits, mean F1-macro across all iterations
                    </span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Monte Carlo validation scores per model</caption>
                      <thead>
                        <tr className="border-b border-slate-200">
                          {['Model', 'Mean F1-macro', 'Verdict'].map((h) => (
                            <th key={h} scope="col"
                              className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(mcScores).map(([model, score]) => {
                          const passes = score >= 0.85
                          return (
                            <tr key={model} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="py-3 px-3 font-semibold text-navy">{model}</td>
                              <td className="py-3 px-3 font-bold text-slate-700">{Number(score).toFixed(4)}</td>
                              <td className="py-3 px-3">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                  passes ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {passes ? '✓ Meets F1 ≥ 0.85 threshold' : '△ Below 0.85 threshold'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    The F1 ≥ 0.85 threshold is the production-readiness criterion from the project methodology.
                    XGBoost falls below it on this dataset — Random Forest and Logistic Regression meet it.
                  </p>
                </div>
              )}

              {/* Confusion matrix toggle */}
              {confusionMatrices && (
                <div>
                  <button
                    onClick={() => setShowConfusion((v) => !v)}
                    className="text-sm font-semibold text-navy underline hover:text-teal focus:outline-none"
                  >
                    {showConfusion ? '▾ Hide' : '▸ Show'} confusion matrix summary (test set)
                  </button>
                  {showConfusion && (
                    <div className="mt-4 grid md:grid-cols-3 gap-4">
                      {Object.entries(confusionMatrices).map(([model, cm]) => (
                        <div key={model} className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-center">
                          <p className="text-xs font-bold text-navy mb-3">{model}</p>
                          <div className="grid grid-cols-2 gap-1 text-xs font-mono max-w-[160px] mx-auto">
                            <div className="bg-green-100 text-green-800 rounded p-2 font-bold">TN {cm.tn}</div>
                            <div className="bg-red-100 text-red-700 rounded p-2 font-bold">FP {cm.fp}</div>
                            <div className="bg-amber-100 text-amber-800 rounded p-2 font-bold">FN {cm.fn}</div>
                            <div className="bg-green-100 text-green-800 rounded p-2 font-bold">TP {cm.tp}</div>
                          </div>
                          <p className="text-xs text-slate-500 mt-2">
                            Accuracy {((cm.tp + cm.tn) / (cm.tp + cm.tn + cm.fp + cm.fn) * 100).toFixed(1)}%
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                <p className="font-bold mb-1">Context for interpreting these scores</p>
                <p className="leading-relaxed">
                  The dataset has {dataset?.unique_patterns ?? '~304'} unique symptom patterns
                  across {dataset?.num_classes ?? 41} classes — about{' '}
                  {dataset?.unique_patterns && dataset?.num_classes
                    ? Math.round(dataset.unique_patterns / dataset.num_classes)
                    : 7}{' '}
                  distinct examples per class. High F1 scores reflect the dataset's synthetic,
                  low-variance structure rather than real clinical generalisation ability.
                  GroupKFold and Monte Carlo validation prevent memorisation from inflating the numbers,
                  but the fundamental limitation is the dataset itself.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Dataset facts */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-xl font-extrabold text-navy mb-4">Training data</h2>
          <dl className="grid sm:grid-cols-2 gap-4 text-sm">
            {[
              ['Source', 'Disease-Symptom Prediction dataset (itachi9604, Kaggle)'],
              ['Raw rows in CSV', `${dataset?.total_rows ?? 4920} (each unique symptom combination is repeated ~120 times)`],
              ['Unique patterns', `${dataset?.unique_patterns ?? '~304'} distinct binary feature vectors across ${dataset?.num_classes ?? 41} classes`],
              ['Features', `${dataset?.num_features ?? 131} binary symptom columns`],
              ['Target classes', `${dataset?.num_classes ?? 41}`],
              ['Last trained', metadata?.trained_at ? new Date(metadata.trained_at).toLocaleString() : 'Unknown'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {label}
                </dt>
                <dd className="text-slate-700 mt-0.5">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Known limitations */}
        <div className="bg-white rounded-xl border border-red-200 p-6 shadow-sm">
          <h2 className="text-xl font-extrabold text-navy mb-1">Known limitations</h2>
          <p className="text-xs text-slate-400 mb-4">
            Stated plainly, because they materially affect how the output should be read.
          </p>
          <ul className="space-y-3 text-sm text-slate-600">
            {[
              [
                'Most target classes are not bacterial infections',
                'Only 7 of the 41 classes are ones where antibiotics have a role. Diabetes, hypertension, heart attack, GERD, migraine, allergy and others sit in the same output. The results page now states when antibiotics are not indicated instead of offering a drug.',
              ],
              [
                'The effective training set is tiny',
                'Roughly 7 unique examples per class. Any model will look excellent on data this repetitive and generalise poorly.',
              ],
              [
                'WHO GLASS coverage is partial',
                'Live resistance data is fetched from the WHO GHO API for E. coli and MRSA across ~60 enrolled countries. Conditions outside this mapping (Tuberculosis, most viral conditions) still use embedded GLASS 2022 global averages. Country-specific data is only available when a country is selected before analysis.',
              ],
              [
                'Confidence is uncalibrated',
                'Scores are raw softmax/probability outputs. A 90% score does not mean the answer is right 90% of the time. Calibration is unmeasured.',
              ],
              [
                'Patient context is basic',
                'Age group, penicillin allergy, and pregnancy are collected and used to flag contraindications. Renal function, recent antibiotic use, symptom duration, and hospitalisation history — which all change empiric prescribing — are not yet collected.',
              ],
              [
                'No explainability yet',
                'There is no per-symptom attribution for a given prediction. SHAP is the planned addition.',
              ],
            ].map(([title, desc]) => (
              <li key={title} className="flex gap-3">
                <span className="text-red-400 mt-0.5" aria-hidden="true">
                  –
                </span>
                <div>
                  <span className="font-bold text-navy">{title}.</span>{' '}
                  <span>{desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Data sources */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-xl font-extrabold text-navy mb-4">References</h2>
          <ul className="space-y-3 text-sm">
            {[
              {
                title: 'Training dataset',
                desc: 'Disease-Symptom Prediction dataset (itachi9604) on Kaggle.',
                href: 'https://www.kaggle.com/datasets/itachi9604/disease-symptom-description-dataset',
              },
              {
                title: 'WHO AWaRe classification',
                desc: 'Access, Watch, and Reserve grouping of antibiotics, 2023 update. Used for the AWaRe labels shown on results. Antituberculosis agents fall outside its scope.',
                href: 'https://www.who.int/publications/i/item/9789240062382',
              },
              {
                title: 'WHO GLASS 2022 Annual Report',
                desc: 'Global Antimicrobial Resistance and Use Surveillance System. Resistance rates shown in this build are sourced from the 2022 global aggregates. A live API integration is a Phase 2 objective.',
                href: 'https://www.who.int/publications/i/item/9789240062350',
              },
            ].map(({ title, desc, href }) => (
              <li key={title} className="flex gap-3">
                <span className="text-teal mt-0.5" aria-hidden="true">
                  →
                </span>
                <div>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-navy underline hover:text-teal"
                  >
                    {title}
                  </a>
                  : <span className="text-slate-600">{desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
