import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Dexie from 'dexie'
import { db, newId } from '../data/db'
import {
  runInitialSync,
  startRealtimeSync,
  stopRealtimeSync,
  getSyncStatus,
  purgeOldTombstones,
  TABLE_NAMES,
  withTimeout,
} from './syncService'
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

describe('runInitialSync', () => {
  it('pousse les lignes locales absentes de Firestore', async () => {
    const id = newId()
    await db.table('expenses').add({ id, name: 'Locale uniquement' })

    vi.spyOn(firestoreClient, 'fetchAllRecords').mockResolvedValue([])
    const pushSpy = vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')

    expect(pushSpy).toHaveBeenCalledWith(
      'uid-test',
      'expenses',
      expect.arrayContaining([
        expect.objectContaining({ id, data: expect.objectContaining({ name: 'Locale uniquement' }) }),
      ]),
    )
  })

  it('tire les lignes distantes plus recentes vers Dexie', async () => {
    const id = newId()
    await db.table('expenses').add({ id, name: 'Ancienne', updatedAt: 100 })

    vi.spyOn(firestoreClient, 'fetchAllRecords').mockImplementation(async (_uid, table) =>
      table === 'expenses' ? [{ id, name: 'Nouvelle', updatedAt: 200 }] : [],
    )
    vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')

    const row = await db.table('expenses').get(id)
    expect(row?.name).toBe('Nouvelle')
  })

  it('garde la version locale si elle est plus recente que le distant', async () => {
    const id = newId()
    await db.table('expenses').add({ id, name: 'Locale recente', updatedAt: 300 })

    vi.spyOn(firestoreClient, 'fetchAllRecords').mockImplementation(async (_uid, table) =>
      table === 'expenses' ? [{ id, name: 'Distante ancienne', updatedAt: 100 }] : [],
    )
    const pushSpy = vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')

    const row = await db.table('expenses').get(id)
    expect(row?.name).toBe('Locale recente')
    expect(pushSpy).toHaveBeenCalledWith(
      'uid-test',
      'expenses',
      expect.arrayContaining([
        expect.objectContaining({ id, data: expect.objectContaining({ name: 'Locale recente' }) }),
      ]),
    )
  })

  it('synchronise toutes les tables en parallele', async () => {
    const fetchSpy = vi.spyOn(firestoreClient, 'fetchAllRecords').mockResolvedValue([])
    vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')

    expect(fetchSpy).toHaveBeenCalledTimes(TABLE_NAMES.length)
    expect(getSyncStatus()).toBe('synced')
  })

  it('continue a synchroniser les autres tables si une table echoue', async () => {
    vi.spyOn(firestoreClient, 'fetchAllRecords').mockImplementation(async (_uid, table) => {
      if (table === 'expenses') throw new Error('quota exceeded')
      return []
    })
    vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')  // ne doit pas throw

    expect(getSyncStatus()).toBe('error')
  })

  it('ne reste pas bloque indefiniment si une table ne repond jamais (getDocs pendu)', async () => {
    vi.spyOn(firestoreClient, 'fetchAllRecords').mockImplementation(async (_uid, table) => {
      if (table === 'expenses') return new Promise(() => {}) // ne resout et ne rejette jamais
      return []
    })
    vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test') // ne doit pas pendre pour toujours

    expect(getSyncStatus()).toBe('error')
  }, 25_000)

  it('utilise fetchRecordsSince si un curseur lastSyncAt existe (sync incrementale)', async () => {
    const cursor = 1_000_000
    localStorage.setItem('sync:lastAt:expenses', String(cursor))

    const incrementalSpy = vi.spyOn(firestoreClient, 'fetchRecordsSince').mockResolvedValue([])
    const fullSpy = vi.spyOn(firestoreClient, 'fetchAllRecords').mockResolvedValue([])
    vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')

    // parcels a un curseur -> fetchRecordsSince; les autres n'en ont pas -> fetchAllRecords
    expect(incrementalSpy).toHaveBeenCalledWith('uid-test', 'expenses', expect.any(Number))
    expect(fullSpy).not.toHaveBeenCalledWith('uid-test', 'expenses')
  })

  it('recupere un enregistrement distant dont updatedAt est dans le buffer de recouvrement (decalage horloge)', async () => {
    const id = newId()
    const cursor = 1_000_000
    const bufferMs = 5 * 60 * 1000
    // Simule un record ecrit par un autre appareil avec une horloge en retard de 1 min
    const skewedRecord = { id, name: 'Hors cursor mais dans buffer', updatedAt: cursor - 60_000 }

    localStorage.setItem('sync:lastAt:expenses', String(cursor))

    vi.spyOn(firestoreClient, 'fetchRecordsSince').mockImplementation(async (_uid, table, sinceMs) => {
      if (table === 'expenses') {
        // Verifie que la requete part bien de cursor - buffer (pas de cursor seul)
        expect(sinceMs).toBe(cursor - bufferMs)
        return [skewedRecord]
      }
      return []
    })
    vi.spyOn(firestoreClient, 'fetchAllRecords').mockResolvedValue([])
    vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')

    const row = await db.table('expenses').get(id)
    expect(row?.name).toBe('Hors cursor mais dans buffer')
  })
})

describe('boucle d echo sync (regression fuite memoire/CPU)', () => {
  it('ne re-echange pas une ligne identique des deux cotes (meme updatedAt)', async () => {
    const id = newId()
    await db.table('expenses').add({ id, name: 'En phase', updatedAt: 100 })

    vi.spyOn(firestoreClient, 'fetchAllRecords').mockImplementation(async (_uid, table) =>
      table === 'expenses' ? [{ id, name: 'En phase', updatedAt: 100 }] : [],
    )
    const pushRecordsSpy = vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')

    expect(pushRecordsSpy).not.toHaveBeenCalled()
  })

  it('laisse en paix un tombstone identique en local et en distant', async () => {
    const id = newId()
    await db.table('expenses').add({ id, name: 'Supprimee', deletedAt: 500, updatedAt: 500 })
    setSyncUid('uid-test')

    vi.spyOn(firestoreClient, 'fetchAllRecords').mockImplementation(async (_uid, table) =>
      table === 'expenses' ? [{ id, name: 'Supprimee', deletedAt: 500, updatedAt: 500 }] : [],
    )
    const pushRecordsSpy = vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()
    const pushRecordSpy = vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()

    await runInitialSync('uid-test')
    await new Promise((r) => setTimeout(r, 10))

    expect(pushRecordsSpy).not.toHaveBeenCalled()
    expect(pushRecordSpy).not.toHaveBeenCalled()
  })

  it('applique une ligne distante plus recente sans la re-pousser vers Firestore', async () => {
    const id = newId()
    await db.table('expenses').add({ id, name: 'Ancienne', updatedAt: 100 })
    setSyncUid('uid-test')

    vi.spyOn(firestoreClient, 'fetchAllRecords').mockImplementation(async (_uid, table) =>
      table === 'expenses' ? [{ id, name: 'Nouvelle', updatedAt: 200 }] : [],
    )
    vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()
    const pushRecordSpy = vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()

    await runInitialSync('uid-test')
    await new Promise((r) => setTimeout(r, 10))

    const row = await db.table('expenses').get(id)
    expect(row?.name).toBe('Nouvelle')
    expect(pushRecordSpy).not.toHaveBeenCalled()
  })

  it('en temps reel, applique un changement distant sans echo ni re-put d un tombstone deja connu', async () => {
    const id = newId()
    await db.table('expenses').add({ id, name: 'Supprimee', deletedAt: 500, updatedAt: 500 })
    setSyncUid('uid-test')

    const callbacks = new Map<string, (changes: firestoreClient.DocChange[]) => void>()
    vi.spyOn(firestoreClient, 'watchTable').mockImplementation((_uid, table, onChange) => {
      callbacks.set(table, onChange)
      return () => {}
    })
    const pushRecordSpy = vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()
    const putSpy = vi.spyOn(db.expenses, 'put')

    startRealtimeSync('uid-test')
    // Le serveur renvoie le tombstone deja present en local : rien ne doit bouger.
    callbacks.get('expenses')!([
      { type: 'modified', record: { id, name: 'Supprimee', deletedAt: 500, updatedAt: 500 } },
    ])
    await new Promise((r) => setTimeout(r, 10))

    expect(putSpy).not.toHaveBeenCalled()
    expect(pushRecordSpy).not.toHaveBeenCalled()

    // Un vrai changement distant est applique, sans repartir vers Firestore.
    callbacks.get('expenses')!([
      { type: 'modified', record: { id, name: 'Restauree', updatedAt: 900 } },
    ])
    await new Promise((r) => setTimeout(r, 10))

    const row = await db.table('expenses').get(id)
    expect(row?.name).toBe('Restauree')
    expect(pushRecordSpy).not.toHaveBeenCalled()
  })
})

describe('getSyncStatus', () => {
  it('passe a "synced" une fois la sync initiale terminee avec succes', async () => {
    vi.spyOn(firestoreClient, 'fetchAllRecords').mockResolvedValue([])
    vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')

    expect(getSyncStatus()).toBe('synced')
  })

  it('passe a "error" si toutes les tables echouent', async () => {
    vi.spyOn(firestoreClient, 'fetchAllRecords').mockRejectedValue(new Error('reseau coupe'))
    vi.spyOn(firestoreClient, 'fetchRecordsSince').mockRejectedValue(new Error('reseau coupe'))
    vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')  // resout sans throw, erreurs absorbees par table

    expect(getSyncStatus()).toBe('error')
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

describe('purgeOldTombstones', () => {
  it('supprime physiquement les lignes locales avec deletedAt vieux de plus de 30 jours', async () => {
    const id = newId()
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000
    await db.table('expenses').add({ id, name: 'Vieux tombstone', deletedAt: old, updatedAt: old })

    await purgeOldTombstones()

    // .get()/.toArray() filtrent deja les lignes deletedAt (hook reading) : on verifie la
    // disparition physique via count(), qui ne passe pas par ce hook.
    expect(await db.table('expenses').count()).toBe(0)
  })

  it('garde les tombstones recents', async () => {
    const id = newId()
    const recent = Date.now() - 5 * 24 * 60 * 60 * 1000
    await db.table('expenses').add({ id, name: 'Tombstone recent', deletedAt: recent, updatedAt: recent })

    await purgeOldTombstones()

    expect(await db.table('expenses').count()).toBe(1)
    void id
  })
})
