import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { installSyncHooks } from '../data/syncHooks'

// La config Vitest n'active pas `globals`, donc l'auto-cleanup de Testing Library
// ne se branche pas tout seul : on démonte explicitement après chaque test pour
// éviter que les composants s'accumulent dans le DOM d'un test à l'autre.
afterEach(() => {
  cleanup()
})

// En production, installSyncHooks() est appelé depuis main.tsx (jamais charge par les
// tests) pour eviter un cycle d'import entre db.ts et syncHooks.ts. Les tests doivent
// donc l'appeler explicitement ici pour que updatedAt/deletedAt/softDelete fonctionnent.
installSyncHooks()
