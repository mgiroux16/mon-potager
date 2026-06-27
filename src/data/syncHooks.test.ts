import Dexie from 'dexie'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { db, newId } from './db'
import { softDelete } from './syncHooks'

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
