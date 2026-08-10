import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Global application state.
 *
 * History and the disclaimer acknowledgement are persisted to localStorage.
 * They were previously in-memory only, which meant the History page claimed
 * "N saved predictions" while a refresh silently wiped everything.
 *
 * The live prediction result is deliberately NOT persisted — a stale result
 * restored on load would be shown as if it were current.
 */
const useAppStore = create(
  persist(
    (set) => ({
      // ── Health / system status ──
      health: null,
      healthLoading: true,
      healthError: null,
      setHealth: (health) => set({ health, healthLoading: false, healthError: null }),
      setHealthError: (err) => set({ healthError: err, healthLoading: false }),

      // ── Symptom vocabulary, fetched from GET /api/v1/symptoms ──
      // The backend owns this list. An empty array means "not fetched yet",
      // and the UI falls back to the static grouping file until it arrives.
      knownSymptoms: [],
      knownConditions: [],
      symptomsLoaded: false,
      setSymptomVocabulary: ({ symptoms, conditions }) =>
        set({
          knownSymptoms: symptoms ?? [],
          knownConditions: conditions ?? [],
          symptomsLoaded: true,
        }),

      // ── Medical disclaimer ──
      disclaimerAccepted: false,
      acceptDisclaimer: () => set({ disclaimerAccepted: true }),

      // ── Symptom selection ──
      selectedSymptoms: [],
      addSymptom: (s) =>
        set((state) => ({
          selectedSymptoms: state.selectedSymptoms.includes(s)
            ? state.selectedSymptoms
            : [...state.selectedSymptoms, s],
        })),
      removeSymptom: (s) =>
        set((state) => ({
          selectedSymptoms: state.selectedSymptoms.filter((x) => x !== s),
        })),
      setSymptoms: (list) => set({ selectedSymptoms: [...new Set(list)] }),
      clearSymptoms: () => set({ selectedSymptoms: [] }),

      // ── Prediction results ──
      predictionResult: null,
      predictionLoading: false,
      predictionError: null,
      setPredictionResult: (r) =>
        set({ predictionResult: r, predictionLoading: false, predictionError: null }),
      setPredictionLoading: () => set({ predictionLoading: true, predictionError: null }),
      setPredictionError: (e) => set({ predictionError: e, predictionLoading: false }),
      dismissPredictionError: () => set({ predictionError: null }),
      clearPrediction: () => set({ predictionResult: null, predictionError: null }),

      // ── WHO GLASS live resistance data ──
      // Fetched after a prediction lands, keyed by country code.
      // Null means not yet fetched or country has no GLASS enrollment.
      glassData: null,
      glassLoading: false,
      glassError: null,
      setGlassData: (d) => set({ glassData: d, glassLoading: false, glassError: null }),
      setGlassLoading: () => set({ glassLoading: true, glassError: null }),
      setGlassError: (e) => set({ glassError: e, glassLoading: false }),
      clearGlass: () => set({ glassData: null, glassError: null }),

      // ── History ──
      history: [],
      addToHistory: (entry) =>
        set((state) => ({ history: [entry, ...state.history].slice(0, 50) })),
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: 'amr-shield-store',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // Only durable user data is persisted. Health status, the in-flight
      // prediction, and the symptom vocabulary are all re-fetched on load.
      partialize: (state) => ({
        history: state.history,
        disclaimerAccepted: state.disclaimerAccepted,
      }),
    },
  ),
)

export default useAppStore
