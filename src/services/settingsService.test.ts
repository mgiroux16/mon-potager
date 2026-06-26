import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { getSettings, saveSettings, DEFAULT_SETTINGS } from './settingsService'
import type { AppSettings } from '../data/model'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('settingsService', () => {
  it('renvoie les réglages par défaut si la base est vide', async () => {
    const s = await getSettings()
    expect(s.locationName).toBe(DEFAULT_SETTINGS.locationName)
    expect(s.id).toBe(1)
  })

  it('persiste et relit les réglages (singleton id=1)', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, frostThresholdC: -2 })
    const s = await getSettings()
    expect(s.frostThresholdC).toBe(-2)
    expect(await db.settings.count()).toBe(1)
  })

  it('ne crée jamais de second enregistrement', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, heatThresholdC: 32 })
    await saveSettings({ ...DEFAULT_SETTINGS, heatThresholdC: 33 })
    expect(await db.settings.count()).toBe(1)
    const s = await getSettings()
    expect(s.heatThresholdC).toBe(33)
  })

  it('renvoie une copie des réglages par défaut, jamais la référence partagée', async () => {
    const a = await getSettings()
    a.locationName = 'MUTÉ'
    const b = await getSettings()
    expect(b.locationName).toBe(DEFAULT_SETTINGS.locationName)
    expect(DEFAULT_SETTINGS.locationName).not.toBe('MUTÉ')
  })

  it('persiste et relit la clé Gemini', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, geminiApiKey: 'AIza-test-123' })
    const s = await getSettings()
    expect(s.geminiApiKey).toBe('AIza-test-123')
  })

  it('a des valeurs par defaut de saison mars a novembre', async () => {
    const s = await getSettings()
    expect(s.seasonStartMonth).toBe(3)
    expect(s.seasonEndMonth).toBe(11)
  })

  it('persiste et relit les mois de saison', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, seasonStartMonth: 4, seasonEndMonth: 10 })
    const s = await getSettings()
    expect(s.seasonStartMonth).toBe(4)
    expect(s.seasonEndMonth).toBe(10)
  })

  it('complete les champs manquants par defaut sur un enregistrement existant ancien', async () => {
    const legacyRecord = {
      id: 1,
      locationName: 'Champniers (16430)',
      latitude: 45.72,
      longitude: 0.19,
      frostThresholdC: 0,
      significantRainMm: 5,
      heatThresholdC: 30,
      defaultWateringFlowLh: 100,
      totalTankCapacityLiters: 2500,
      aiLevel: 'photo_assistant',
    } as AppSettings
    await db.settings.put(legacyRecord)
    const s = await getSettings()
    expect(s.seasonStartMonth).toBe(3)
    expect(s.seasonEndMonth).toBe(11)
  })
})
