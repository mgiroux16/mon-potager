import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Dexie from 'dexie'
import { db, newId } from '../data/db'
import { runInitialSync, getSyncStatus, purgeOldTombstones, TABLE_NAMES } from './syncService'
import * as firestoreClient from '../data/firestoreClient'

const DB_NAME = 'mon-potager'

beforeEach(async () => {
  localStorage.clear()
  await db.open()
})

afterEach(async () => {
  localStorage.clear()
  db.close()
  await Dexie.delete(DB_NAME)
  vi.restoreAllMocks()
})

describe('runInitialSync', () => {
  it('pousse les lignes locales absentes de Firestore', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Locale uniquement' })

    vi.spyOn(firestoreClient, 'fetchAllRecords').mockResolvedValue([])
    const pushSpy = vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')

    expect(pushSpy).toHaveBeenCalledWith(
      'uid-test',
      'parcels',
      expect.arrayContaining([
        expect.objectContaining({ id, data: expect.objectContaining({ name: 'Locale uniquement' }) }),
      ]),
    )
  })

  it('tire les lignes distantes plus recentes vers Dexie', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Ancienne', updatedAt: 100 })

    vi.spyOn(firestoreClient, 'fetchAllRecords').mockImplementation(async (_uid, table) =>
      table === 'parcels' ? [{ id, name: 'Nouvelle', updatedAt: 200 }] : [],
    )
    vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')

    const row = await db.table('parcels').get(id)
    expect(row?.name).toBe('Nouvelle')
  })

  it('garde la version locale si elle est plus recente que le distant', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Locale recente', updatedAt: 300 })

    vi.spyOn(firestoreClient, 'fetchAllRecords').mockImplementation(async (_uid, table) =>
      table === 'parcels' ? [{ id, name: 'Distante ancienne', updatedAt: 100 }] : [],
    )
    const pushSpy = vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')

    const row = await db.table('parcels').get(id)
    expect(row?.name).toBe('Locale recente')
    expect(pushSpy).toHaveBeenCalledWith(
      'uid-test',
      'parcels',
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
      if (table === 'log') throw new Error('quota exceeded')
      return []
    })
    vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')  // ne doit pas throw

    expect(getSyncStatus()).toBe('error')
  })

  it('utilise fetchRecordsSince si un curseur lastSyncAt existe (sync incrementale)', async () => {
    const cursor = 1_000_000
    localStorage.setItem('sync:lastAt:parcels', String(cursor))

    const incrementalSpy = vi.spyOn(firestoreClient, 'fetchRecordsSince').mockResolvedValue([])
    const fullSpy = vi.spyOn(firestoreClient, 'fetchAllRecords').mockResolvedValue([])
    vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')

    // parcels a un curseur -> fetchRecordsSince; les autres n'en ont pas -> fetchAllRecords
    expect(incrementalSpy).toHaveBeenCalledWith('uid-test', 'parcels', expect.any(Number))
    expect(fullSpy).not.toHaveBeenCalledWith('uid-test', 'parcels')
  })

  it('recupere un enregistrement distant dont updatedAt est dans le buffer de recouvrement (decalage horloge)', async () => {
    const id = newId()
    const cursor = 1_000_000
    const bufferMs = 5 * 60 * 1000
    // Simule un record ecrit par un autre appareil avec une horloge en retard de 1 min
    const skewedRecord = { id, name: 'Hors cursor mais dans buffer', updatedAt: cursor - 60_000 }

    localStorage.setItem('sync:lastAt:parcels', String(cursor))

    vi.spyOn(firestoreClient, 'fetchRecordsSince').mockImplementation(async (_uid, table, sinceMs) => {
      if (table === 'parcels') {
        // Verifie que la requete part bien de cursor - buffer (pas de cursor seul)
        expect(sinceMs).toBe(cursor - bufferMs)
        return [skewedRecord]
      }
      return []
    })
    vi.spyOn(firestoreClient, 'fetchAllRecords').mockResolvedValue([])
    vi.spyOn(firestoreClient, 'pushRecords').mockResolvedValue()

    await runInitialSync('uid-test')

    const row = await db.table('parcels').get(id)
    expect(row?.name).toBe('Hors cursor mais dans buffer')
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

describe('purgeOldTombstones', () => {
  it('supprime physiquement les lignes locales avec deletedAt vieux de plus de 30 jours', async () => {
    const id = newId()
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000
    await db.table('parcels').add({ id, name: 'Vieux tombstone', deletedAt: old, updatedAt: old })

    await purgeOldTombstones()

    // .get()/.toArray() filtrent deja les lignes deletedAt (hook reading) : on verifie la
    // disparition physique via count(), qui ne passe pas par ce hook.
    expect(await db.table('parcels').count()).toBe(0)
  })

  it('garde les tombstones recents', async () => {
    const id = newId()
    const recent = Date.now() - 5 * 24 * 60 * 60 * 1000
    await db.table('parcels').add({ id, name: 'Tombstone recent', deletedAt: recent, updatedAt: recent })

    await purgeOldTombstones()

    expect(await db.table('parcels').count()).toBe(1)
    void id
  })
})
