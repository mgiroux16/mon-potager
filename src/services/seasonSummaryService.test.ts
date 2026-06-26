import { describe, it, expect } from 'vitest'
import { seasonBounds } from './seasonSummaryService'
import { DEFAULT_SETTINGS } from './settingsService'

describe('seasonBounds', () => {
  it('calcule les bornes de saison pour une annee donnee a partir des reglages', () => {
    const settings = { ...DEFAULT_SETTINGS, seasonStartMonth: 3, seasonEndMonth: 11 }
    const bounds = seasonBounds(2026, settings)
    expect(bounds).toEqual({ start: '2026-03-01', end: '2026-11-30' })
  })

  it('gere les mois a 31 jours et a 30 jours pour la borne de fin', () => {
    const settings = { ...DEFAULT_SETTINGS, seasonStartMonth: 4, seasonEndMonth: 9 }
    const bounds = seasonBounds(2025, settings)
    expect(bounds).toEqual({ start: '2025-04-01', end: '2025-09-30' })
  })

  it('gere fevrier sur une annee bissextile', () => {
    const settings = { ...DEFAULT_SETTINGS, seasonStartMonth: 1, seasonEndMonth: 2 }
    const bounds = seasonBounds(2024, settings)
    expect(bounds).toEqual({ start: '2024-01-01', end: '2024-02-29' })
  })
})
