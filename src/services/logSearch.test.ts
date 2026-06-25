import { describe, it, expect } from 'vitest'
import type { GardenLogEntry } from '../data/model'
import { searchLogEntries } from './logSearch'

function entry(partial: Partial<GardenLogEntry>): GardenLogEntry {
  return { type: 'note', date: '2026-06-24', createdAt: 0, ...partial }
}

const noTarget = () => undefined

describe('searchLogEntries', () => {
  const entries: GardenLogEntry[] = [
    entry({ id: 1, type: 'observation', description: 'feuilles jaunes' }),
    entry({ id: 2, type: 'recolte', quantityKg: 2 }),
    entry({ id: 3, type: 'note', title: 'Pucerons sur le rosier' }),
  ]

  it('requête vide renvoie toutes les entrées', () => {
    expect(searchLogEntries(entries, '', noTarget)).toHaveLength(3)
  })

  it('match sur la description', () => {
    const out = searchLogEntries(entries, 'jaunes', noTarget)
    expect(out.map((e) => e.id)).toEqual([1])
  })

  it('match sur le titre', () => {
    const out = searchLogEntries(entries, 'rosier', noTarget)
    expect(out.map((e) => e.id)).toEqual([3])
  })

  it('match sur le libellé de type, insensible aux accents et à la casse', () => {
    const out = searchLogEntries(entries, 'RECOLTE', noTarget)
    expect(out.map((e) => e.id)).toEqual([2])
  })

  it('match sur le nom de cible résolu', () => {
    const out = searchLogEntries(
      entries,
      'rosier',
      (e) => (e.id === 1 ? 'Massif rosier' : undefined),
    )
    expect(out.map((e) => e.id).sort()).toEqual([1, 3])
  })

  it('multi-termes : tous les termes doivent matcher (ET)', () => {
    const out = searchLogEntries(entries, 'feuilles jaunes', noTarget)
    expect(out.map((e) => e.id)).toEqual([1])
    expect(searchLogEntries(entries, 'feuilles rosier', noTarget)).toHaveLength(0)
  })

  it('opère sur le sous-ensemble fourni (déjà filtré par type)', () => {
    const subset = entries.filter((e) => e.type === 'note')
    expect(searchLogEntries(subset, 'jaunes', noTarget)).toHaveLength(0)
  })
})
