import Dexie from 'dexie'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { db, newId } from './db'
import { markRemoteWrite, softDelete, setSyncUid } from './syncHooks'
import * as firestoreClient from './firestoreClient'

const DB_NAME = 'mon-potager'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  db.close()
  await Dexie.delete(DB_NAME)
})

describe('hooks Dexie de synchro', () => {
  it('injecte updatedAt a la creation', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Test' })
    const row = await db.parcels.get(id)
    expect(row?.updatedAt).toBeTypeOf('number')
  })

  it('rafraichit updatedAt a chaque update', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Test' })
    const before = (await db.parcels.get(id))?.updatedAt as number
    await new Promise((r) => setTimeout(r, 5))
    await db.parcels.update(id, { name: 'Test modifie' })
    const after = (await db.parcels.get(id))?.updatedAt as number
    expect(after).toBeGreaterThan(before)
  })

  it('filtre les lignes avec deletedAt a la lecture', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Test' })
    await db.parcels.update(id, { deletedAt: Date.now() })
    const rows = await db.parcels.toArray()
    expect(rows).toHaveLength(0)
    const direct = await db.parcels.get(id)
    expect(direct).toBeUndefined()
  })

  it('softDelete marque deletedAt sans supprimer la ligne', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Test' })
    await softDelete('parcels', id)
    const rows = await db.parcels.toArray()
    expect(rows).toHaveLength(0)
    const rawCount = await db.table('parcels').count()
    expect(rawCount).toBe(1)
  })
})

describe('push automatique apres ecriture', () => {
  afterEach(() => {
    setSyncUid(null)
  })

  it('pousse vers Firestore apres un add, si un uid est actif', async () => {
    const pushSpy = vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()
    setSyncUid('uid-test')

    const id = newId()
    await db.parcels.add({ id, name: 'A pousser' })
    await new Promise((r) => setTimeout(r, 0))

    expect(pushSpy).toHaveBeenCalledWith(
      'uid-test',
      'parcels',
      id,
      expect.objectContaining({ name: 'A pousser' }),
    )
  })

  it('ne pousse rien si aucun uid actif (utilisateur deconnecte)', async () => {
    const pushSpy = vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()
    setSyncUid(null)

    const id = newId()
    await db.parcels.add({ id, name: 'Hors ligne sans compte' })
    await new Promise((r) => setTimeout(r, 0))

    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('ne re-pousse pas une ecriture marquee comme venant du distant (anti-echo)', async () => {
    const pushSpy = vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()
    const id = newId()
    await db.parcels.add({ id, name: 'Base' })
    setSyncUid('uid-test')

    const fromRemote = { id, name: 'Depuis Firestore', updatedAt: 999 }
    markRemoteWrite('parcels', fromRemote)
    await db.parcels.put(fromRemote)
    await new Promise((r) => setTimeout(r, 0))
    expect(pushSpy).not.toHaveBeenCalled()

    // Une vraie modification locale qui suit est, elle, bien poussee.
    await db.parcels.update(id, { name: 'Modif locale' })
    await new Promise((r) => setTimeout(r, 0))
    expect(pushSpy).toHaveBeenCalledTimes(1)
  })
})
