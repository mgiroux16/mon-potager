import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  clearCollectionData,
  getCollectionData,
} from '../test/firestoreHooksMock'
import { addVariety, findOrCreateVariety } from './varietyService'
import type { Variety } from '../data/model'

vi.mock('../data/firestoreWrites', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreWritesMock
})

beforeEach(() => {
  clearCollectionData()
})

function storedVarieties(): Variety[] {
  return getCollectionData('varieties') as unknown as Variety[]
}

describe('varietyService', () => {
  it('ajoute une variété et renvoie son id', () => {
    const id = addVariety({ name: 'Saint-Pierre', vegetable: 'Tomate' })
    expect(typeof id).toBe('string')
    const all = storedVarieties()
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe('Saint-Pierre')
    expect(all[0].id).toBe(id)
  })

  it('findOrCreateVariety réutilise une variété existante (même nom + légume)', () => {
    const first = findOrCreateVariety([], 'Agata', 'Pomme de terre')
    const second = findOrCreateVariety(storedVarieties(), 'agata', 'Pomme de terre')
    expect(second).toBe(first)
    expect(storedVarieties()).toHaveLength(1)
  })

  it('findOrCreateVariety crée si le nom diffère', () => {
    findOrCreateVariety([], 'Agata', 'Pomme de terre')
    findOrCreateVariety(storedVarieties(), 'Charlotte', 'Pomme de terre')
    expect(storedVarieties()).toHaveLength(2)
  })
})
