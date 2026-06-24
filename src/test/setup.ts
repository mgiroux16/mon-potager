import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// La config Vitest n'active pas `globals`, donc l'auto-cleanup de Testing Library
// ne se branche pas tout seul : on démonte explicitement après chaque test pour
// éviter que les composants s'accumulent dans le DOM d'un test à l'autre.
afterEach(() => {
  cleanup()
})
