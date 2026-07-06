import { describe, it, expect, beforeEach } from 'vitest'
import { db, newId } from './db'

beforeEach(async () => {
  await db.auditLog.clear()
})

describe('PotagerDB', () => {
  it('expose uniquement la table auditLog (Lot 5 : demontage de la synchro maison)', () => {
    const names = db.tables.map((t) => t.name).sort()
    expect(names).toEqual(['auditLog'])
  })

  it('écrit et relit une entrée du journal système', async () => {
    const id = newId()
    await db.auditLog.add({
      id,
      type: 'export-json',
      date: Date.now(),
      label: 'test',
      recordCount: 1,
    })
    const back = await db.auditLog.get(id)
    expect(back?.type).toBe('export-json')
    expect(back?.recordCount).toBe(1)
  })
})
