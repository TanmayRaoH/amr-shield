// Static SVG pipeline diagram: Symptoms → [LR | RF | XGBoost] → Recommendation
export default function PipelineDiagram() {
  return (
    <div className="w-full max-w-lg mx-auto select-none">
      <svg viewBox="0 0 480 200" fill="none" xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto">

        {/* ── Stage 1: Symptoms Input ── */}
        <rect x="10" y="70" width="110" height="60" rx="10"
          fill="#EFF6FF" stroke="#0F2D5C" strokeWidth="1.5" />
        <text x="65" y="95" textAnchor="middle" fill="#0F2D5C"
          fontSize="11" fontWeight="700">Symptoms</text>
        <text x="65" y="111" textAnchor="middle" fill="#64748B" fontSize="9">
          131 features
        </text>
        {/* Symptom icons */}
        <circle cx="40" cy="118" r="3" fill="#0D9488" />
        <circle cx="52" cy="118" r="3" fill="#0D9488" />
        <circle cx="64" cy="118" r="3" fill="#0D9488" />
        <circle cx="76" cy="118" r="3" fill="#0D9488" />

        {/* Arrow 1 */}
        <path d="M122 100 L148 100" stroke="#94A3B8" strokeWidth="2"
          strokeDasharray="4 2" markerEnd="url(#arrow)" />

        {/* ── Stage 2: ML Models (3 stacked) ── */}
        {/* LR */}
        <rect x="152" y="55" width="100" height="28" rx="6"
          fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1.2" />
        <text x="202" y="74" textAnchor="middle" fill="#1D4ED8"
          fontSize="9.5" fontWeight="600">Logistic Regression</text>

        {/* RF */}
        <rect x="152" y="90" width="100" height="28" rx="6"
          fill="#D1FAE5" stroke="#10B981" strokeWidth="1.2" />
        <text x="202" y="109" textAnchor="middle" fill="#065F46"
          fontSize="9.5" fontWeight="600">Random Forest</text>

        {/* XGBoost */}
        <rect x="152" y="125" width="100" height="28" rx="6"
          fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1.2" />
        <text x="202" y="144" textAnchor="middle" fill="#92400E"
          fontSize="9.5" fontWeight="600">XGBoost</text>

        {/* Label */}
        <text x="202" y="30" textAnchor="middle" fill="#0F2D5C"
          fontSize="10" fontWeight="700">ML Models</text>

        {/* Arrow 2 */}
        <path d="M254 100 L280 100" stroke="#94A3B8" strokeWidth="2"
          strokeDasharray="4 2" markerEnd="url(#arrow)" />

        {/* ── Stage 3: Recommendation ── */}
        <rect x="284" y="70" width="120" height="60" rx="10"
          fill="#F0FDF4" stroke="#16A34A" strokeWidth="1.5" />
        <text x="344" y="93" textAnchor="middle" fill="#15803D"
          fontSize="11" fontWeight="700">Antibiotic</text>
        <text x="344" y="108" textAnchor="middle" fill="#15803D"
          fontSize="11" fontWeight="700">Recommendation</text>
        {/* Checkmark */}
        <circle cx="344" cy="122" r="7" fill="#16A34A" />
        <path d="M340 122l2.5 2.5 4-4" stroke="white" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" />

        {/* WHO badge */}
        <rect x="360" y="48" width="44" height="16" rx="8"
          fill="#0D9488" opacity="0.15" />
        <text x="382" y="60" textAnchor="middle" fill="#0D9488"
          fontSize="8" fontWeight="700">WHO GLASS</text>

        {/* Arrow marker */}
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8"
            refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#94A3B8" />
          </marker>
        </defs>
      </svg>
    </div>
  )
}
