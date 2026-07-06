import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const setDocMock = vi.fn(() => Promise.resolve())
const deleteDocMock = vi.fn(() => Promise.resolve())
const SERVER_TS = { __serverTimestamp: true }
const DELETE_FIELD = { __deleteField: true }

// uid mutable pour tester le cas deconnecte sans second fichier de test
const authState: { currentUser: { uid: string } | null } = {
  currentUser: { uid: 'uid-test' },
}

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, path: string, id: string) => ({ path: `${path}/${id}` })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  serverTimestamp: () => SERVER_TS,
  deleteField: () => DELETE_FIELD,
}))
vi.mock('./firebase', () => ({
  firestore: {},
  auth: authState,
}))

// Meme precaution que firestoreClient.test.ts : setup.ts a deja charge le vrai
// ./firebase, on reimporte apres resetModules pour brancher les mocks.
let cloudPut: typeof import('./firestoreWrites').cloudPut
let cloudAdd: typeof import('./firestoreWrites').cloudAdd
let cloudDelete: typeof import('./firestoreWrites').cloudDelete
let registerWrites: typeof import('./writeGuard').registerWrites
let resetWriteGuard: typeof import('./writeGuard').resetWriteGuard
let WRITE_GUARD_LIMIT: number

beforeAll(async () => {
  vi.resetModules()
  ;({ cloudPut, cloudAdd, cloudDelete } = await import('./firestoreWrites'))
  ;({ registerWrites, resetWriteGuard, WRITE_GUARD_LIMIT } = await import('./writeGuard'))
})

describe('firestoreWrites', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetWriteGuard()
    authState.currentUser = { uid: 'uid-test' }
  })

  it('cloudPut ecrit en merge avec updatedAt serverTimestamp sous users/<uid>/<table>', () => {
    cloudPut('log', 'e1', { type: 'note' })
    expect(setDocMock).toHaveBeenCalledWith(
      { path: 'users/uid-test/log/e1' },
      { type: 'note', updatedAt: SERVER_TS },
      { merge: true },
    )
  })

  it('cloudAdd genere un id, le renvoie et le pose dans le document', () => {
    const id = cloudAdd('log', { type: 'note' })
    expect(id).toBeTruthy()
    expect(setDocMock).toHaveBeenCalledWith(
      { path: `users/uid-test/log/${id}` },
      { type: 'note', id, updatedAt: SERVER_TS },
      { merge: true },
    )
  })

  it('cloudPut traduit undefined en deleteField (efface le champ en merge)', () => {
    cloudPut('trees', 't1', { variety: undefined, name: 'Poirier' })
    expect(setDocMock).toHaveBeenCalledWith(
      { path: 'users/uid-test/trees/t1' },
      { variety: DELETE_FIELD, name: 'Poirier', updatedAt: SERVER_TS },
      { merge: true },
    )
  })

  it('cloudDelete supprime le document (vraie suppression, pas de tombstone)', () => {
    cloudDelete('log', 'e1')
    expect(deleteDocMock).toHaveBeenCalledWith({ path: 'users/uid-test/log/e1' })
  })

  it('cloudPut ne jette pas si deconnecte (no-op signale en console)', () => {
    authState.currentUser = null
    expect(() => cloudPut('log', 'e1', { type: 'note' })).not.toThrow()
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('cloudDelete ne jette pas si deconnecte', () => {
    authState.currentUser = null
    expect(() => cloudDelete('log', 'e1')).not.toThrow()
    expect(deleteDocMock).not.toHaveBeenCalled()
  })

  it('cloudPut respecte le disjoncteur quota', () => {
    registerWrites(WRITE_GUARD_LIMIT + 1)
    cloudPut('log', 'e1', { type: 'note' })
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('cloudDelete respecte le disjoncteur quota', () => {
    registerWrites(WRITE_GUARD_LIMIT + 1)
    cloudDelete('log', 'e1')
    expect(deleteDocMock).not.toHaveBeenCalled()
  })

  it('cloudPut compte dans le disjoncteur', () => {
    cloudPut('log', 'e1', { type: 'note' })
    registerWrites(WRITE_GUARD_LIMIT - 1)
    cloudPut('log', 'e2', { type: 'note' })
    // limite atteinte apres e2 : la suivante est bloquee
    cloudPut('log', 'e3', { type: 'note' })
    expect(setDocMock).toHaveBeenCalledTimes(2)
  })
})
