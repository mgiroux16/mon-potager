import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS activé seulement quand la variable HTTPS est posée (commande `npm run dev:tel`).
// Le `npm run dev` habituel reste en http://localhost, sans avertissement de certificat.
const httpsForPhone = process.env.HTTPS ? [basicSsl()] : []

// Affichés dans Réglages pour vérifier facilement qu'un appareil a bien la dernière
// version (utile car le SW peut mettre du temps à se mettre à jour sur un appareil donné).
function gitShortHash(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

// Écrit version.json à la racine du build : la référence « dernière version publiée »,
// lue par UpdateBanner et Réglages avec cache: no-store. Volontairement hors des
// globPatterns du service worker (pas un .js/.css/...) pour ne jamais être caché.
function versionJson(): Plugin {
  let outDir = 'dist'
  return {
    name: 'version-json',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      mkdirSync(outDir, { recursive: true })
      writeFileSync(
        resolve(outDir, 'version.json'),
        JSON.stringify({ hash: gitShortHash(), builtAt: new Date().toISOString() }),
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Servi depuis un sous-dossier sur GitHub Pages (https://mgiroux16.github.io/mon-potager/).
  // En dev, base reste '/' pour ne pas casser localhost.
  base: process.env.GITHUB_PAGES ? '/mon-potager/' : '/',
  define: {
    __APP_BUILD_HASH__: JSON.stringify(gitShortHash()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    ...httpsForPhone,
    react(),
    tailwindcss(),
    versionJson(),
    VitePWA({
      registerType: 'autoUpdate',
      // Enregistrement piloté à la main (src/registerServiceWorker.ts) pour brancher
      // la vérification périodique de mise à jour (onRegisteredSW → registration.update()).
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Mon Potager Intelligent',
        short_name: 'Potager',
        description: "Carnet de potager et pilotage de l'arrosage à Champniers",
        theme_color: '#15803d',
        background_color: '#f0fdf4',
        display: 'standalone',
        orientation: 'portrait',
        // Relatif au manifeste : marche aussi bien à la racine qu'en sous-dossier /mon-potager/.
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Le HTML n'est plus précaché : il est servi par la route NetworkFirst
        // ci-dessous pour toujours charger la dernière version quand le réseau est là.
        globPatterns: ['**/*.{js,css,svg,png,ico}'],
        // Désactive le fallback de navigation par défaut de vite-plugin-pwa
        // (navigateFallback: 'index.html' → createHandlerBoundToURL('index.html')).
        // index.html n'étant plus précaché, ce handler levait `non-precached-url`.
        // La navigation passe entièrement par la route NetworkFirst ci-dessous.
        navigateFallback: null,
        runtimeCaching: [
          {
            // NetworkFirst : online → dernière version servie ; offline → repli sur
            // la réponse HTML mise en cache lors d'un précédent chargement en ligne.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
