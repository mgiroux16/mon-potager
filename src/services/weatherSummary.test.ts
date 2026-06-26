import { describe, expect, it } from 'vitest'
import { summarizeWeather } from './weatherSummary'
import type { DailyWeather } from './weatherService'

// Petite canicule sèche finissant au 2026-06-25, conforme aux vraies données Champniers.
const history: DailyWeather[] = [
  { date: '2026-06-18', tempMaxC: 37.4, tempMinC: 20.4, rainMm: 0 },
  { date: '2026-06-19', tempMaxC: 36.2, tempMinC: 21.1, rainMm: 0 },
  { date: '2026-06-20', tempMaxC: 36.5, tempMinC: 19.8, rainMm: 0 },
  { date: '2026-06-21', tempMaxC: 40.3, tempMinC: 21.4, rainMm: 0 },
  { date: '2026-06-22', tempMaxC: 43.0, tempMinC: 24.9, rainMm: 0 },
  { date: '2026-06-23', tempMaxC: 43.3, tempMinC: 26.1, rainMm: 0.1 },
  { date: '2026-06-24', tempMaxC: 42.9, tempMinC: 24.4, rainMm: 0.1 },
  { date: '2026-06-25', tempMaxC: 40.6, tempMinC: 26.4, rainMm: 0 },
]

const opts = { heatThresholdC: 30, significantRainMm: 5 }

describe('summarizeWeather', () => {
  it('cumule la pluie sur 7 et 14 jours jusqu à la date de référence incluse', () => {
    const s = summarizeWeather(history, '2026-06-25', opts)
    expect(s.rain7Mm).toBeCloseTo(0.2, 5) // 19→25 : 0.1 + 0.1
    expect(s.rain14Mm).toBeCloseTo(0.2, 5)
  })

  it('compte les jours chauds (max >= seuil) sur 14 jours', () => {
    const s = summarizeWeather(history, '2026-06-25', opts)
    expect(s.hotDayCount).toBe(8)
  })

  it('mesure l épisode de chaleur en cours (série consécutive finissant à la date)', () => {
    const s = summarizeWeather(history, '2026-06-25', opts)
    expect(s.heatEpisodeDays).toBe(8)
  })

  it('compte les jours secs consécutifs (pluie < seuil significatif) finissant à la date', () => {
    const s = summarizeWeather(history, '2026-06-25', opts)
    expect(s.dryDayStreak).toBe(8)
  })

  it('ignore les jours postérieurs à la date de référence', () => {
    const s = summarizeWeather(history, '2026-06-20', opts)
    expect(s.hotDayCount).toBe(3) // 18, 19, 20
    expect(s.heatEpisodeDays).toBe(3)
  })

  it('renvoie des zéros sur un historique vide', () => {
    const s = summarizeWeather([], '2026-06-25', opts)
    expect(s).toEqual({ rain7Mm: 0, rain14Mm: 0, rain30Mm: 0, dryDayStreak: 0, hotDayCount: 0, heatEpisodeDays: 0 })
  })

  it('coupe l épisode de chaleur dès un jour sous le seuil', () => {
    const mixed: DailyWeather[] = [
      { date: '2026-06-23', tempMaxC: 33, tempMinC: 20, rainMm: 0 },
      { date: '2026-06-24', tempMaxC: 22, tempMinC: 15, rainMm: 0 },
      { date: '2026-06-25', tempMaxC: 31, tempMinC: 18, rainMm: 0 },
    ]
    const s = summarizeWeather(mixed, '2026-06-25', opts)
    expect(s.heatEpisodeDays).toBe(1) // seul le 25
  })

  it('coupe la série sèche dès une vraie pluie', () => {
    const wet: DailyWeather[] = [
      { date: '2026-06-23', tempMaxC: 25, tempMinC: 15, rainMm: 12 },
      { date: '2026-06-24', tempMaxC: 26, tempMinC: 16, rainMm: 0 },
      { date: '2026-06-25', tempMaxC: 27, tempMinC: 16, rainMm: 1 },
    ]
    const s = summarizeWeather(wet, '2026-06-25', opts)
    expect(s.dryDayStreak).toBe(2) // 24 et 25 ; le 23 (12 mm) coupe
  })
})
