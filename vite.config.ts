import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS activé seulement quand la variable HTTPS est posée (commande `npm run dev:tel`).
// Le `npm run dev` habituel reste en http://localhost, sans avertissement de certificat.
const httpsForPhone = process.env.HTTPS ? [basicSsl()] : []

// https://vite.dev/config/
export default defineConfig({
  // Servi depuis un sous-dossier sur GitHub Pages (https://mgiroux16.github.io/mon-potager/).
  // En dev, base reste '/' pour ne pas casser localhost.
  base: process.env.GITHUB_PAGES ? '/mon-potager/' : '/',
  plugins: [
    ...httpsForPhone,
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
      devOptions: { enabled: false },
    }),
  ],
})
