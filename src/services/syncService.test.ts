import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Dexie from 'dexie'
import { db, newId } from '../data/db'
import { runInitialSync, getSyncStatus, purgeOldTombstones } from './syncService'
import * as firestoreClient from '../data/firestoreClient'

const DB_NAME = 'mon-potager'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  db.close()
  await Dexie.delete(DB_NAME)
  vi.restoreAllMocks()
})

describe('runInitialSync', () => {
  it('pousse les lignes locales absentes de Firestore', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Locale uniquement' })

    vi.spyOn(firestoreClient, 'fetchAllRecords').mockResolvedValue([])
    const pushSpy = vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()

    await runInitialSync('uid-test')

    expect(pushSpy).toHaveBeenCalledWith(
      'uid-test',
      'parcels',
      id,
      expect.objectContaining({ name: 'Locale uniquement' }),
    )
  })

  it('tire les lignes distantes plus recentes vers Dexie', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Ancienne', updatedAt: 100 })

    vi.spyOn(firestoreClient, 'fetchAllRecords').mockImplementation(async (_uid, table) =>
      table === 'parcels' ? [{ id, name: 'Nouvelle', updatedAt: 200 }] : [],
    )
    vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()

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
    const pushSpy = vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()

    await runInitialSync('uid-test')

    const row = await db.table('parcels').get(id)
    expect(row?.name).toBe('Locale recente')
    expect(pushSpy).toHaveBeenCalledWith(
      'uid-test',
      'parcels',
      id,
      expect.objectContaining({ name: 'Locale recente' }),
    )
  })
})

describe('getSyncStatus', () => {
  it('passe a "synced" une fois la sync initiale terminee avec succes', async () => {
    vi.spyOn(firestoreClient, 'fetchAllRecords').mockResolvedValue([])
    vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()

    await runInitialSync('uid-test')

    expect(getSyncStatus()).toBe('synced')
  })

  it('passe a "error" si la sync initiale echoue', async () => {
    vi.spyOn(firestoreClient, 'fetchAllRecords').mockRejectedValue(new Error('reseau coupe'))

    await expect(runInitialSync('uid-test')).rejects.toThrow('reseau coupe')

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
