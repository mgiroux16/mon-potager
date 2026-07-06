// A utiliser via vi.mock('../data/firestoreHooks', ...) dans les tests de pages :
// les pages migrees lisent Firestore, pas Dexie. Les tests alimentent ce store.
// Reactif : setCollectionData notifie les composants montes (useSyncExternalStore),
// comme le ferait onSnapshot.
import { useSyncExternalStore } from 'react'
import { vi } from 'vitest'

const store = new Map<string, Record<string, unknown>[]>()
const listeners = new Set<() => void>()
const EMPTY: Record<string, unknown>[] = []

function emit(): void {
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setCollectionData(table: string, rows: Record<string, unknown>[]): void {
  store.set(table, rows)
  emit()
}

export function getCollectionData(table: string): Record<string, unknown>[] {
  return store.get(table) ?? EMPTY
}

export function clearCollectionData(): void {
  store.clear()
  emit()
}

function useRows(table: string): Record<string, unknown>[] {
  return useSyncExternalStore(subscribe, () => store.get(table) ?? EMPTY)
}

// Mock de firestoreWrites qui applique les ecritures au store ci-dessus (upsert
// avec semantique merge de setDoc) : les tests verifient l'etat du store et les
// composants montes se re-rendent comme avec onSnapshot.
export const firestoreWritesMock = {
  cloudPut: vi.fn((table: string, id: string, data: Record<string, unknown>) => {
    const rows = store.get(table) ?? EMPTY
    const exists = rows.some((r) => r.id === id)
    setCollectionData(
      table,
      exists ? rows.map((r) => (r.id === id ? { ...r, ...data } : r)) : [...rows, { id, ...data }],
    )
  }),
  cloudAdd: vi.fn((table: string, data: Record<string, unknown>) => {
    const id = crypto.randomUUID()
    firestoreWritesMock.cloudPut(table, id, { ...data, id })
    return id
  }),
  cloudDelete: vi.fn((table: string, id: string) => {
    setCollectionData(table, (store.get(table) ?? EMPTY).filter((r) => r.id !== id))
  }),
}

export const firestoreHooksMock = {
  useCollection: vi.fn((table: string) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const data = useRows(table)
    return { data, loading: false, error: null, fromCache: false }
  }),
  useDoc: vi.fn((table: string, id: string | null | undefined) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const rows = useRows(table)
    return {
      data: rows.find((r) => r.id === id) ?? null,
      loading: false,
      error: null,
      fromCache: false,
    }
  }),
}
