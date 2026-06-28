import { describe, it, expect } from 'vitest'
import { buildSeasonHistoryLines } from './diagnosticContext'
import type { SeasonNote, Diagnostic } from '../data/model'

describe('buildSeasonHistoryLines', () => {
  it('combine les notes de saison et les diagnostics clos de la meme culture', () => {
    const notes: SeasonNote[] = [
      { id: 'n1', year: 2025, cropId: 'crop1', text: 'Mildiou fin juillet' },
      { id: 'n2', year: 2025, cropId: 'crop2', text: 'Sans rapport' },
    ]
    const diagnostics: Diagnostic[] = [
      {
        id: 'd1',
        problemEntryId: 'e0',
        cropId: 'crop1',
        createdAt: 1,
        hypotheses: [],
        status: 'clos',
        conclusion: 'Traiter preventivement plus tot',
      },
    ]
    const lines = buildSeasonHistoryLines({ cropId: 'crop1', notes, diagnostics })
    expect(lines).toEqual([
      '2025 : Mildiou fin juillet',
      'Diagnostic precedent conclu : Traiter preventivement plus tot',
    ])
  })

  it('renvoie un tableau vide si rien ne correspond a la culture', () => {
    const lines = buildSeasonHistoryLines({ cropId: 'crop9', notes: [], diagnostics: [] })
    expect(lines).toEqual([])
  })
})
