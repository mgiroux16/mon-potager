import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const setDocMock = vi.fn()
const batchSetMock = vi.fn()
const batchCommitMock = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({})),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(() => ({ set: batchSetMock, commit: batchCommitMock })),
}))
vi.mock('./firebase', () => ({ firestore: {} }))

// setup.ts (installSyncHooks) a deja charge le vrai ./firestoreClient avant que les
// mocks de ce fichier soient enregistres : un import statique renverrait l'instance
// en cache, NON mockee, qui taperait le vrai Firestore (constate le 05/07 : un test
// a envoye une vraie ecriture, rejetee resource-exhausted). On reimporte donc apres
// vi.resetModules() pour obtenir une instance branchee sur les mocks.
let pushRecord: typeof import('./firestoreClient').pushRecord
let pushRecords: typeof import('./firestoreClient').pushRecords
let registerWrites: typeof import('./writeGuard').registerWrites
let resetWriteGuard: typeof import('./writeGuard').resetWriteGuard
let WRITE_GUARD_LIMIT: number

beforeAll(async () => {
  vi.resetModules()
  ;({ pushRecord, pushRecords } = await import('./firestoreClient'))
  ;({ registerWrites, resetWriteGuard, WRITE_GUARD_LIMIT } = await import('./writeGuard'))
})

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

describe('disjoncteur des pushes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetWriteGuard()
    setOnLine(true)
  })

  it('pushRecord ne pousse plus quand le disjoncteur est declenche', async () => {
    registerWrites(WRITE_GUARD_LIMIT + 1)
    await pushRecord('uid1', 'log', 'e1', { id: 'e1' })
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('pushRecords ne pousse plus quand le disjoncteur est declenche', async () => {
    registerWrites(WRITE_GUARD_LIMIT + 1)
    await pushRecords('uid1', 'log', [{ id: 'e1', data: { id: 'e1' } }])
    expect(batchCommitMock).not.toHaveBeenCalled()
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('les pushes comptent dans le disjoncteur', async () => {
    for (let i = 0; i <= WRITE_GUARD_LIMIT; i++) {
      await pushRecord('uid1', 'log', `e${i}`, { id: `e${i}` })
    }
    expect(setDocMock).toHaveBeenCalledTimes(WRITE_GUARD_LIMIT + 1)
    await pushRecord('uid1', 'log', 'trop', { id: 'trop' })
    expect(setDocMock).toHaveBeenCalledTimes(WRITE_GUARD_LIMIT + 1)
  })
})
