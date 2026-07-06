import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerPwaUpdates } from './services/pwaUpdates'

const redirectToCanonicalOrigin = () => {
  const canonicalOrigin = (
    import.meta.env.VITE_CANONICAL_ORIGIN ||
    import.meta.env.VITE_ONESIGNAL_PRIMARY_ORIGIN ||
    ''
  ).replace(/\/+$/, '')

  if (!canonicalOrigin) return false

  try {
    const canonicalUrl = new URL(canonicalOrigin)
    const currentHost = window.location.hostname.replace(/^www\./, '')
    const canonicalHost = canonicalUrl.hostname.replace(/^www\./, '')

    if (currentHost === canonicalHost && window.location.origin !== canonicalUrl.origin) {
      window.location.replace(
        `${canonicalUrl.origin}${window.location.pathname}${window.location.search}${window.location.hash}`,
      )
      return true
    }
  } catch {
    return false
  }

  return false
}

if (!redirectToCanonicalOrigin()) {
  registerPwaUpdates()

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
