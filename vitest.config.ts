/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_BUILD_HASH__: JSON.stringify('test'),
    __APP_BUILD_TIME__: JSON.stringify(new Date(0).toISOString()),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Filet de securite : cles Firebase FACTICES pour tous les tests. Le 05/07, un
    // test dont les mocks ne s'appliquaient pas (module deja charge par setup.ts) a
    // envoye une vraie ecriture au projet de production. Avec ces valeurs, un test
    // qui echapperait encore aux mocks viserait un projet inexistant.
    env: {
      VITE_FIREBASE_API_KEY: 'cle-de-test',
      VITE_FIREBASE_AUTH_DOMAIN: 'projet-test-inexistant.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'projet-test-inexistant',
      VITE_FIREBASE_STORAGE_BUCKET: 'projet-test-inexistant.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
      VITE_FIREBASE_APP_ID: 'app-de-test',
    },
  },
})
