import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// Etat mutable partage avec les mocks (hoiste au-dessus des vi.mock).
const h = vi.hoisted(() => ({
  authCb: { current: null as null | ((user: { uid: string } | null) => void) },
  snap: {
    listeners: [] as { next: (snap: unknown) => void; error: (err: Error) => void }[],
    unsubs: [] as Array<() => void>,
    lastOnSnapshotArgs: null as unknown,
  },
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: { uid: string } | null) => void) => {
    h.authCb.current = cb
    return () => {
      h.authCb.current = null
    }
  },
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ kind: 'collection', path }),
  doc: (_db: unknown, path: string, id: string) => ({ kind: 'doc', path, id }),
  query: (ref: unknown, ...constraints: unknown[]) => ({ kind: 'query', ref, constraints }),
  where: (field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value }),
  orderBy: (field: string, direction?: string) => ({ kind: 'orderBy', field, direction }),
  onSnapshot: (
    ref: unknown,
    opts: unknown,
    next: (snap: unknown) => void,
    error: (err: Error) => void,
  ) => {
    h.snap.lastOnSnapshotArgs = { ref, opts }
    h.snap.listeners.push({ next, error })
    const unsub = vi.fn()
    h.snap.unsubs.push(unsub)
    return unsub
  },
}))

vi.mock('./firebase', () => ({
  firestore: { kind: 'firestore' },
  auth: { currentUser: null },
}))

import { useCollection, useDoc } from './firestoreHooks'

// Construit un faux QuerySnapshot. `rows` = objets avec id + champs ; data()
// renvoie les champs sans l'id (comme Firestore).
function makeCollectionSnap(
  rows: Array<Record<string, unknown> & { id: string }>,
  fromCache: boolean,
) {
  return {
    metadata: { fromCache },
    docs: rows.map(({ id, ...fields }) => ({ id, data: () => fields })),
  }
}

function makeDocSnap(
  row: (Record<string, unknown> & { id: string }) | null,
  fromCache: boolean,
) {
  if (row === null) {
    return { metadata: { fromCache }, exists: () => false, id: 'missing', data: () => undefined }
  }
  const { id, ...fields } = row
  return { metadata: { fromCache }, exists: () => true, id, data: () => fields }
}

function signIn(uid: string): void {
  act(() => h.authCb.current?.({ uid }))
}

beforeEach(() => {
  h.authCb.current = null
  h.snap.listeners = []
  h.snap.unsubs = []
  h.snap.lastOnSnapshotArgs = null
})

describe('useCollection', () => {
  it("n'emet rien et ne s'abonne pas tant que l'uid est null (auth non resolue)", () => {
    const { result } = renderHook(() => useCollection('log'))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toEqual([])
    expect(h.snap.listeners).toHaveLength(0)

    // Deconnecte explicite : toujours aucun abonnement
    act(() => h.authCb.current?.(null))
    expect(h.snap.listeners).toHaveLength(0)
    expect(result.current.loading).toBe(true)
  })

  it("s'abonne une fois l'uid connu, puis passe cache -> serveur", () => {
    const { result } = renderHook(() => useCollection('log'))
    signIn('alice')
    expect(h.snap.listeners).toHaveLength(1)

    // 1er snapshot : depuis le cache local
    act(() => {
      h.snap.listeners[0].next(makeCollectionSnap([{ id: 'e1', type: 'note' }], true))
    })
    expect(result.current.loading).toBe(false)
    expect(result.current.fromCache).toBe(true)
    expect(result.current.data).toEqual([{ id: 'e1', type: 'note' }])

    // 2e snapshot : confirmation serveur
    act(() => {
      h.snap.listeners[0].next(makeCollectionSnap([{ id: 'e1', type: 'note' }], false))
    })
    expect(result.current.fromCache).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it('filtre les tombstones (deletedAt) du resultat', () => {
    const { result } = renderHook(() => useCollection('log'))
    signIn('alice')
    act(() => {
      h.snap.listeners[0].next(
        makeCollectionSnap(
          [
            { id: 'e1', type: 'note' },
            { id: 'e2', type: 'note', deletedAt: Date.now() },
          ],
          false,
        ),
      )
    })
    expect(result.current.data).toEqual([{ id: 'e1', type: 'note' }])
  })

  it('se desabonne au demontage', () => {
    const { unmount } = renderHook(() => useCollection('log'))
    signIn('alice')
    expect(h.snap.unsubs).toHaveLength(1)
    const unsub = h.snap.unsubs[0]
    unmount()
    expect(unsub).toHaveBeenCalledTimes(1)
  })

  it('ne se re-abonne pas si les options gardent le meme contenu', () => {
    const { rerender } = renderHook(({ opt }) => useCollection('log', opt), {
      initialProps: { opt: { where: [{ field: 'type', op: '==' as const, value: 'note' }] } },
    })
    signIn('alice')
    expect(h.snap.listeners).toHaveLength(1)
    // Nouveau litteral, meme contenu : pas de nouvel abonnement
    rerender({ opt: { where: [{ field: 'type', op: '==' as const, value: 'note' }] } })
    expect(h.snap.listeners).toHaveLength(1)
  })
})

describe('useDoc', () => {
  it("ne s'abonne pas tant que l'uid est null", () => {
    const { result } = renderHook(() => useDoc('log', 'e1'))
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
    expect(h.snap.listeners).toHaveLength(0)
  })

  it("ne s'abonne pas si l'id est absent", () => {
    renderHook(() => useDoc('log', null))
    signIn('alice')
    expect(h.snap.listeners).toHaveLength(0)
  })

  it('emet le document puis expose fromCache', () => {
    const { result } = renderHook(() => useDoc('log', 'e1'))
    signIn('alice')
    expect(h.snap.listeners).toHaveLength(1)
    act(() => {
      h.snap.listeners[0].next(makeDocSnap({ id: 'e1', type: 'note' }, true))
    })
    expect(result.current.loading).toBe(false)
    expect(result.current.fromCache).toBe(true)
    expect(result.current.data).toEqual({ id: 'e1', type: 'note' })
  })

  it('renvoie null pour un document inexistant', () => {
    const { result } = renderHook(() => useDoc('log', 'e1'))
    signIn('alice')
    act(() => {
      h.snap.listeners[0].next(makeDocSnap(null, false))
    })
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it('traite un tombstone (deletedAt) comme absent', () => {
    const { result } = renderHook(() => useDoc('log', 'e1'))
    signIn('alice')
    act(() => {
      h.snap.listeners[0].next(makeDocSnap({ id: 'e1', type: 'note', deletedAt: Date.now() }, false))
    })
    expect(result.current.data).toBeNull()
  })

  it('se desabonne au demontage', () => {
    const { unmount } = renderHook(() => useDoc('log', 'e1'))
    signIn('alice')
    const unsub = h.snap.unsubs[0]
    unmount()
    expect(unsub).toHaveBeenCalledTimes(1)
  })
})
