import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { seedDatabase } from './data/seed'
import { installSyncHooks } from './data/syncHooks'

// Installe les hooks Dexie (updatedAt/deletedAt/push) ici plutot que dans db.ts :
// db.ts et syncHooks.ts s'importent mutuellement (syncHooks a besoin de `db`), et
// appeler installSyncHooks() au chargement de db.ts creait un cycle d'import dont
// l'ordre d'evaluation n'est pas garanti par le bundler de production (TABLE_NAMES
// pouvait ne pas encore exister au moment de l'appel, plantant toute l'app au demarrage).
installSyncHooks()

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

// Charge le vrai jardin au premier lancement (idempotent : sans effet si déjà présent).
void seedDatabase()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
