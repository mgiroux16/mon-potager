import { useDoc } from '../data/firestoreHooks'
import { cloudPut } from '../data/firestoreWrites'
import type { AppSettings } from '../data/model'

const SETTINGS_ID = 'settings'

export const DEFAULT_SETTINGS: AppSettings = {
  id: SETTINGS_ID,
  locationName: "278 rue de l'Arbalétrier, Champniers (16430)",
  latitude: 45.7006,
  longitude: 0.1957,
  frostThresholdC: 0,
  significantRainMm: 5,
  heatThresholdC: 30,
  defaultWateringFlowLh: 100,
  totalTankCapacityLiters: 5000,
  aiLevel: 'photo_assistant',
  seasonStartMonth: 3,
  seasonEndMonth: 11,
}

// Réglages en lecture temps réel depuis Firestore (document unique).
// undefined pendant le chargement (même contrat que l'ancien useLiveQuery),
// puis les défauts complètent tout champ manquant d'un enregistrement ancien.
export function useSettings(): AppSettings | undefined {
  const { data, loading } = useDoc<AppSettings>('settings', SETTINGS_ID)
  if (loading) return undefined
  return data ? { ...DEFAULT_SETTINGS, ...data } : { ...DEFAULT_SETTINGS }
}

export function saveSettings(settings: AppSettings): void {
  cloudPut('settings', SETTINGS_ID, { ...settings, id: SETTINGS_ID })
}
