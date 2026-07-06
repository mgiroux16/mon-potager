import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { GardenLogEntry } from '../data/model'

const cloudPutMock = vi.fn()
vi.mock('../data/firestoreWrites', () => ({
  cloudPut: (...args: unknown[]) => cloudPutMock(...args),
}))

import { addLogEntry, updateLogEntry, sortLog, filterLogByType } from './logService'

function entry(partial: Partial<GardenLogEntry>): GardenLogEntry {
  return { id: crypto.randomUUID(), type: 'note', date: '2026-06-24', createdAt: 0, ...partial }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('logService (écritures cloud)', () => {
  it('ajoute une entrée dans le cloud et renvoie son id', () => {
    const id = addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    expect(typeof id).toBe('string')
    expect(cloudPutMock).toHaveBeenCalledTimes(1)
    const [table, calledId, data] = cloudPutMock.mock.calls[0]
    expect(table).toBe('log')
    expect(calledId).toBe(id)
    expect(data).toMatchObject({ id, type: 'recolte', quantityKg: 2 })
  })

  it('renseigne createdAt automatiquement si absent', () => {
    const before = Date.now()
    addLogEntry({ type: 'note', date: '2026-06-24', title: 'test' })
    const [, , data] = cloudPutMock.mock.calls[0]
    expect(data.createdAt).toBeGreaterThanOrEqual(before)
  })

  it('met le statut à "valide" par défaut et conserve les champs variété/phrase', () => {
    addLogEntry({
      type: 'recolte',
      date: '2026-06-25',
      quantityKg: 2.4,
      varietyId: '1',
      sourcePhrase: 'Aujourd hui 2,4 kg de courgettes',
    })
    const [, , data] = cloudPutMock.mock.calls[0]
    expect(data.status).toBe('valide')
    expect(data.varietyId).toBe('1')
    expect(data.sourcePhrase).toBe('Aujourd hui 2,4 kg de courgettes')
  })

  it('respecte un statut explicite', () => {
    addLogEntry({ type: 'note', date: '2026-06-25', status: 'brouillon' })
    const [, , data] = cloudPutMock.mock.calls[0]
    expect(data.status).toBe('brouillon')
  })

  it('updateLogEntry transmet la mise a jour partielle telle quelle (merge cote cloud)', () => {
    updateLogEntry('id-1', { type: 'arrosage', date: '2026-06-25', volumeLiters: 45 })
    expect(cloudPutMock).toHaveBeenCalledWith('log', 'id-1', {
      type: 'arrosage',
      date: '2026-06-25',
      volumeLiters: 45,
    })
  })
})

describe('sortLog / filterLogByType (purs)', () => {
  it('trie le journal du plus récent au plus ancien (date puis createdAt)', () => {
    const vieux = entry({ date: '2026-06-01', title: 'vieux' })
    const recent = entry({ date: '2026-06-24', title: 'recent' })
    const memeJourTard = entry({ date: '2026-06-24', title: 'tard', createdAt: 100 })
    const sorted = sortLog([vieux, recent, memeJourTard])
    expect(sorted.map((e) => e.title)).toEqual(['tard', 'recent', 'vieux'])
  })

  it('ne modifie pas le tableau source', () => {
    const a = entry({ date: '2026-06-01' })
    const b = entry({ date: '2026-06-24' })
    const source = [a, b]
    sortLog(source)
    expect(source[0]).toBe(a)
  })

  it('filtre par type (vue dérivée triée)', () => {
    const rows = [
      entry({ type: 'arrosage', date: '2026-06-24', volumeLiters: 30 }),
      entry({ type: 'recolte', date: '2026-06-24', quantityKg: 1 }),
      entry({ type: 'arrosage', date: '2026-06-23', volumeLiters: 20 }),
    ]
    const arrosages = filterLogByType(rows, 'arrosage')
    expect(arrosages).toHaveLength(2)
    expect(arrosages.every((e) => e.type === 'arrosage')).toBe(true)
    expect(arrosages[0].volumeLiters).toBe(30)
  })
})
