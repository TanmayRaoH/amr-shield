import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Navbar from './components/Navbar'
import DisclaimerModal from './components/DisclaimerModal'
import Landing from './pages/Landing'
import Predict from './pages/Predict'
import Results from './pages/Results'
import About from './pages/About'
import History from './pages/History'
import useAppStore from './store/useAppStore'
import { fetchHealth, fetchSymptoms } from './services/api'

const HEALTH_POLL_MS = 30000

export default function App() {
  const { setHealth, setHealthError, setSymptomVocabulary } = useAppStore()

  // Single source of health polling for the whole app. StatusBar used to run a
  // second identical interval, so /health was being hit twice every 30s.
  useEffect(() => {
    let cancelled = false

    const loadHealth = async () => {
      try {
        const data = await fetchHealth()
        if (!cancelled) setHealth(data)
      } catch (err) {
        if (!cancelled) setHealthError(err.userMessage || 'API unreachable')
      }
    }

    loadHealth()
    const interval = setInterval(loadHealth, HEALTH_POLL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [setHealth, setHealthError])

  // Fetch the symptom vocabulary once. The backend reads it straight from
  // features.pkl, which keeps the picker and the models permanently in sync.
  useEffect(() => {
    let cancelled = false

    const loadVocabulary = async () => {
      try {
        const data = await fetchSymptoms()
        if (!cancelled) {
          setSymptomVocabulary({
            symptoms: data.symptoms,
            conditions: data.conditions,
          })
        }
      } catch {
        // Non-fatal: the UI falls back to the static grouping file.
      }
    }

    loadVocabulary()
    return () => {
      cancelled = true
    }
  }, [setSymptomVocabulary])

  return (
    <div className="min-h-screen bg-off-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-navy focus:text-white focus:rounded-lg"
      >
        Skip to content
      </a>

      <DisclaimerModal />
      <Navbar />

      <main id="main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/predict" element={<Predict />} />
          <Route path="/results" element={<Results />} />
          <Route path="/about" element={<About />} />
          <Route path="/history" element={<History />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
