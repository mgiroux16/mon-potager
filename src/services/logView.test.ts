import { describe, it, expect } from 'vitest'
import type { GardenLogEntry } from '../data/model'
import { describeLogEntry, formatLogDate, formatSnapshotTemp, type LogRefs } from './logView'

const refs: LogRefs = {
  parcels: new Map([[1, { id: 1, name: 'Planche tomates' }]]),
  crops: new Map([[2, { id: 2, name: 'Tomate', status: 'en_place' }]]),
  oyas: new Map([[3, { id: 3, name: 'Oya nord', capacityLiters: 10 }]]),
  trees: new Map([[4, { id: 4, name: 'Pommier' }]]),
}

function entry(partial: Partial<GardenLogEntry>): GardenLogEntry {
  return { type: 'note', date: '2026-06-24', createdAt: 0, ...partial }
}

describe('describeLogEntry', () => {
  it('arrosage : libellé, parcelle cible, volume en détail', () => {
    const view = describeLogEntry(
      entry({ type: 'arrosage', parcelId: 1, volumeLiters: 30 }),
      refs,
    )
    expect(view).toEqual({ typeLabel: 'Arrosage', target: 'Planche tomates', detail: '30 L' })
  })

  it('récolte : culture cible, quantité en détail', () => {
    const view = describeLogEntry(entry({ type: 'recolte', cropId: 2, quantityKg: 2 }), refs)
    expect(view).toEqual({ typeLabel: 'Récolte', target: 'Tomate', detail: '2 kg' })
  })

  it("remplissage d'oya : oya cible, volume en détail", () => {
    const view = describeLogEntry(entry({ type: 'remplissage_oya', oyaId: 3, volumeLiters: 8 }), refs)
    expect(view).toEqual({ typeLabel: "Remplissage d'oya", target: 'Oya nord', detail: '8 L' })
  })

  it('observation : description en détail', () => {
    const view = describeLogEntry(
      entry({ type: 'observation', parcelId: 1, description: 'feuilles jaunes' }),
      refs,
    )
    expect(view).toEqual({
      typeLabel: 'Observation',
      target: 'Planche tomates',
      detail: 'feuilles jaunes',
    })
  })

  it('problème sans cible : description en détail, target indéfini', () => {
    const view = describeLogEntry(entry({ type: 'probleme', description: 'pucerons' }), refs)
    expect(view).toEqual({ typeLabel: 'Problème', target: undefined, detail: 'pucerons' })
  })

  it('référence manquante : ne plante pas, target indéfini', () => {
    const view = describeLogEntry(entry({ type: 'recolte', cropId: 999, quantityKg: 1 }), refs)
    expect(view.target).toBeUndefined()
    expect(view.detail).toBe('1 kg')
  })
})

describe('formatLogDate', () => {
  const now = new Date(2026, 5, 24, 18, 30) // 24 juin 2026, 18:30

  it("aujourd'hui avec heure", () => {
    expect(formatLogDate(entry({ date: '2026-06-24', time: '18:30' }), now)).toBe("aujourd'hui 18:30")
  })

  it("aujourd'hui sans heure", () => {
    expect(formatLogDate(entry({ date: '2026-06-24' }), now)).toBe("aujourd'hui")
  })

  it('hier', () => {
    expect(formatLogDate(entry({ date: '2026-06-23' }), now)).toBe('hier')
  })

  it('il y a N jours', () => {
    expect(formatLogDate(entry({ date: '2026-06-20' }), now)).toBe('il y a 4 j')
  })

  it('date ancienne en JJ/MM/AAAA', () => {
    expect(formatLogDate(entry({ date: '2026-05-01' }), now)).toBe('01/05/2026')
  })
})

describe('formatSnapshotTemp', () => {
  it('arrondit la température courante du snapshot', () => {
    expect(formatSnapshotTemp({ capturedAt: 1, source: 'open-meteo', tempC: 36.3 })).toBe('36 °C')
  })
  it('retombe sur le max si pas de température courante', () => {
    expect(formatSnapshotTemp({ capturedAt: 1, source: 'open-meteo', tempMaxC: 40.6 })).toBe('41 °C')
  })
  it('renvoie null si aucune température', () => {
    expect(formatSnapshotTemp({ capturedAt: 1, source: 'manuel' })).toBeNull()
    expect(formatSnapshotTemp(undefined)).toBeNull()
  })
})
