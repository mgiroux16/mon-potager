import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { getSettings, saveSettings, DEFAULT_SETTINGS } from './settingsService'

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
})
