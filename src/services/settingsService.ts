import { db } from '../data/db'
import type { AppSettings } from '../data/model'

const SETTINGS_ID = 1

export const DEFAULT_SETTINGS: AppSettings = {
  id: SETTINGS_ID,
  locationName: 'Champniers (16430)',
  latitude: 45.72,
  longitude: 0.19,
  frostThresholdC: 0,
  significantRainMm: 5,
  heatThresholdC: 30,
  defaultWateringFlowLh: 100,
  totalTankCapacityLiters: 5000,
  aiLevel: 'photo_assistant',
  seasonStartMonth: 3,
  seasonEndMonth: 11,
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await db.settings.get(SETTINGS_ID)
  return stored ? { ...DEFAULT_SETTINGS, ...stored } : { ...DEFAULT_SETTINGS }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put({ ...settings, id: SETTINGS_ID })
}
