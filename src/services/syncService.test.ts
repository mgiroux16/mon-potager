import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Dexie from 'dexie'
import { db } from '../data/db'
import { runInitialSync, stopRealtimeSync, getSyncStatus, TABLE_NAMES, withTimeout } from './syncService'
import { setSyncUid } from '../data/syncHooks'
import * as firestoreClient from '../data/firestoreClient'

const DB_NAME = 'mon-potager'

beforeEach(async () => {
  localStorage.clear()
  await db.open()
})

afterEach(async () => {
  localStorage.clear()
  stopRealtimeSync()
  setSyncUid(null)
  db.close()
  await Dexie.delete(DB_NAME)
  vi.restoreAllMocks()
})

// Toutes les tables sont passees en cloud-first (Lots 1 a 4) : TABLE_NAMES est
// desormais vide, la synchro maison n'a plus rien a synchroniser. Ce module
// disparaitra completement au Lot 5 (voir docs/superpowers/plans/) ; ces tests ne
// couvrent plus que l'etat inerte, le detail du mecanisme n'est plus testable
// sans table reelle a lui donner en exemple.
describe('runInitialSync (couche maison desormais inerte)', () => {
  it("TABLE_NAMES est vide : plus aucune table n'est synchronisee", () => {
    expect(TABLE_NAMES).toHaveLength(0)
  })

  it('se termine en "synced" sans emettre le moindre appel Firestore', async () => {
    const fetchSpy = vi.spyOn(firestoreClient, 'fetchAllRecords')
    const pushSpy = vi.spyOn(firestoreClient, 'pushRecords')

    await runInitialSync('uid-test')

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(pushSpy).not.toHaveBeenCalled()
    expect(getSyncStatus()).toBe('synced')
  })
})

describe('withTimeout', () => {
  it('resout avec la valeur de la promesse si elle resout avant le delai', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 50, 'test')
    expect(result).toBe('ok')
  })

  it('rejette avec l erreur d origine si la promesse rejette avant le delai', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50, 'test')).rejects.toThrow('boom')
  })

  it('rejette au bout du delai si la promesse ne resout ni ne rejette jamais', async () => {
    const stuck = new Promise(() => {})
    await expect(withTimeout(stuck, 20, 'table-test')).rejects.toThrow(/delai depasse/)
  })
})
