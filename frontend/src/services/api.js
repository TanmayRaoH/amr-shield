import axios from 'axios'

// Base URL is overridable so a production build can point at a separate API
// host. Without this the bundle hardcodes a relative path and only works
// behind a reverse proxy that maps /api to the Flask server.
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

const client = axios.create({
  baseURL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

/**
 * Turn any axios failure into a single Error carrying a message that is safe
 * and useful to show a user. Previously every caller had to reach into
 * err.response?.data?.message itself and fell back to a generic string.
 *
 * @param {unknown} error The rejection from axios.
 * @returns {Error} An error with `userMessage` and `status` attached.
 */
function normaliseError(error) {
  const status = error?.response?.status ?? null
  const serverMessage = error?.response?.data?.message

  let userMessage

  if (error?.code === 'ECONNABORTED') {
    userMessage = 'The request timed out. The server may be busy — please try again.'
  } else if (!error?.response) {
    userMessage =
      'Cannot reach the API. Check that the Flask server is running on port 5000.'
  } else if (status === 503) {
    userMessage =
      serverMessage ||
      'The models are not loaded. Run `python run_training.py` and restart the server.'
  } else if (status >= 500) {
    userMessage =
      serverMessage || 'The server hit an unexpected error. Check the server logs.'
  } else if (status === 429) {
    userMessage = 'Too many requests. Please wait a moment and try again.'
  } else if (serverMessage) {
    userMessage = serverMessage
  } else {
    userMessage = 'The request failed. Please try again.'
  }

  const normalised = new Error(userMessage)
  normalised.userMessage = userMessage
  normalised.status = status
  normalised.details = error?.response?.data ?? null
  return normalised
}

client.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(normaliseError(error)),
)

export const fetchHealth = async () => {
  const { data } = await client.get('/health')
  return data
}

/**
 * Fetch the authoritative symptom and condition lists from the backend.
 * These come straight from features.pkl / label_encoder.pkl, so the UI can
 * never offer a symptom the models do not recognise.
 */
export const fetchSymptoms = async () => {
  const { data } = await client.get('/symptoms')
  return data
}

export const runPrediction = async (symptoms) => {
  const { data } = await client.post('/predict', { symptoms })
  return data
}

export default client
