import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  clearCollectionData,
  getCollectionData,
  setCollectionData,
} from '../test/firestoreHooksMock'
import { saveSettings, useSettings, DEFAULT_SETTINGS } from './settingsService'
import type { AppSettings } from '../data/model'

vi.mock('../data/firestoreHooks', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreHooksMock
})
vi.mock('../data/firestoreWrites', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreWritesMock
})

beforeEach(() => {
  clearCollectionData()
})

describe('settingsService', () => {
  it('renvoie les réglages par défaut si rien en base', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current?.locationName).toBe(DEFAULT_SETTINGS.locationName)
    expect(result.current?.id).toBe('settings')
  })

  it('persiste et relit les réglages (document unique id=settings)', () => {
    saveSettings({ ...DEFAULT_SETTINGS, frostThresholdC: -2 })
    const { result } = renderHook(() => useSettings())
    expect(result.current?.frostThresholdC).toBe(-2)
    expect(getCollectionData('settings')).toHaveLength(1)
  })

  it('ne crée jamais de second document', () => {
    saveSettings({ ...DEFAULT_SETTINGS, heatThresholdC: 32 })
    saveSettings({ ...DEFAULT_SETTINGS, heatThresholdC: 33 })
    expect(getCollectionData('settings')).toHaveLength(1)
    const { result } = renderHook(() => useSettings())
    expect(result.current?.heatThresholdC).toBe(33)
  })

  it('renvoie une copie des réglages par défaut, jamais la référence partagée', () => {
    const { result } = renderHook(() => useSettings())
    const a = result.current as AppSettings
    a.locationName = 'MUTÉ'
    const { result: result2 } = renderHook(() => useSettings())
    expect(result2.current?.locationName).toBe(DEFAULT_SETTINGS.locationName)
    expect(DEFAULT_SETTINGS.locationName).not.toBe('MUTÉ')
  })

  it('persiste et relit la clé Gemini', () => {
    saveSettings({ ...DEFAULT_SETTINGS, geminiApiKey: 'AIza-test-123' })
    const { result } = renderHook(() => useSettings())
    expect(result.current?.geminiApiKey).toBe('AIza-test-123')
  })

  it('a des valeurs par defaut de saison mars a novembre', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current?.seasonStartMonth).toBe(3)
    expect(result.current?.seasonEndMonth).toBe(11)
  })

  it('complete les champs manquants par defaut sur un document existant ancien', () => {
    setCollectionData('settings', [
      {
        id: 'settings',
        locationName: 'Champniers (16430)',
        latitude: 45.72,
        longitude: 0.19,
        frostThresholdC: 0,
        significantRainMm: 5,
        heatThresholdC: 30,
        defaultWateringFlowLh: 100,
        totalTankCapacityLiters: 2500,
        aiLevel: 'photo_assistant',
      },
    ])
    const { result } = renderHook(() => useSettings())
    expect(result.current?.seasonStartMonth).toBe(3)
    expect(result.current?.seasonEndMonth).toBe(11)
    expect(result.current?.totalTankCapacityLiters).toBe(2500)
  })
})
