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
  const dataset = metadata?.dataset

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
            Read live from{' '}
            <code className="bg-slate-100 px-1 rounded">model_metadata.json</code> via{' '}
            <code className="bg-slate-100 px-1 rounded">/api/v1/health</code>. These figures are
            not hardcoded in the frontend, so they cannot drift from the actual trained models.
          </p>

          {!cvScores ? (
            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-4">
              Metrics unavailable — the API is unreachable or the models have not been trained yet.
              Run <code className="bg-slate-100 px-1 rounded">python run_training.py</code>.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Cross-validated F1-macro score per model
                  </caption>
                  <thead>
                    <tr className="border-b border-slate-200">
                      {['Model', 'CV F1-macro', 'Interpretability'].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="text-left py-2 px-3 text-xs font-bold text-slate-400 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(cvScores).map(([model, score]) => (
                      <tr key={model} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-3 font-semibold text-navy">{model}</td>
                        <td className="py-3 px-3 font-bold text-slate-700">
                          {Number(score).toFixed(4)}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {INTERPRETABILITY[model] || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                <p className="font-bold mb-1">Do not read these scores as quality</p>
                <p className="leading-relaxed">
                  The dataset has {dataset?.unique_patterns ?? '~304'} unique symptom patterns
                  across {dataset?.num_classes ?? 41} classes —{' '}
                  about{' '}
                  {dataset?.unique_patterns && dataset?.num_classes
                    ? Math.round(dataset.unique_patterns / dataset.num_classes)
                    : 7}{' '}
                  distinct examples per class. Cross-validation now uses{' '}
                  <strong>GroupKFold</strong> so no identical pattern appears in both train and
                  validation folds, giving honest generalisation scores rather than memorisation
                  scores.
                </p>
              </div>
            </>
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
                'Resistance figures are placeholders',
                'The AMR scores and resistance percentages in this build are illustrative constants, not surveillance data. No WHO GLASS integration exists yet.',
              ],
              [
                'Confidence is uncalibrated',
                'Scores are raw softmax/probability outputs. A 90% score does not mean the answer is right 90% of the time. Calibration is unmeasured.',
              ],
              [
                'No patient context',
                'Age, pregnancy, allergies, renal function, recent antibiotic use, and recent hospitalisation all change real prescribing. None are collected.',
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
                title: 'WHO GLASS',
                desc: 'Global Antimicrobial Resistance and Use Surveillance System. Not yet integrated — the resistance values in this build are placeholders.',
                href: 'https://www.who.int/initiatives/glass',
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
