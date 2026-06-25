import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { addVariety, listVarieties, findOrCreateVariety } from './varietyService'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('varietyService', () => {
  it('ajoute une variété et renvoie son id', async () => {
    const id = await addVariety({ name: 'Saint-Pierre', vegetable: 'Tomate' })
    expect(typeof id).toBe('number')
    const all = await listVarieties()
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe('Saint-Pierre')
  })

  it('liste les variétés par ordre alphabétique', async () => {
    await addVariety({ name: 'Roma', vegetable: 'Tomate' })
    await addVariety({ name: 'Cornue des Andes', vegetable: 'Tomate' })
    const all = await listVarieties()
    expect(all.map((v) => v.name)).toEqual(['Cornue des Andes', 'Roma'])
  })

  it('findOrCreateVariety réutilise une variété existante (même nom + légume)', async () => {
    const first = await findOrCreateVariety('Agata', 'Pomme de terre')
    const second = await findOrCreateVariety('agata', 'Pomme de terre')
    expect(second).toBe(first)
    expect(await listVarieties()).toHaveLength(1)
  })

  it('findOrCreateVariety crée si le nom diffère', async () => {
    await findOrCreateVariety('Agata', 'Pomme de terre')
    await findOrCreateVariety('Charlotte', 'Pomme de terre')
    expect(await listVarieties()).toHaveLength(2)
  })
})
