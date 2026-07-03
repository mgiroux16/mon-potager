import { registerSW } from 'virtual:pwa-register'

// PWA restée ouverte en continu : sans ce polling, elle ne recharge jamais son
// service worker et reste bloquée sur une ancienne version.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

export function registerServiceWorker() {
  if (!import.meta.env.PROD) return

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      setInterval(() => {
        void registration.update()
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })
}
