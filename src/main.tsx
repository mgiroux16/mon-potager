import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// En dev, purger tout service worker laissé par une session précédente :
// un SW de dev peut servir une coquille vide et provoquer une page blanche.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (regs.length > 0) {
      Promise.all(regs.map((r) => r.unregister()))
        .then(() => caches?.keys?.())
        .then((keys) => Promise.all((keys ?? []).map((k) => caches.delete(k))))
        .then(() => window.location.reload())
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
