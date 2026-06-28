import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { getCropNote, getParcelNote, setCropNote, setParcelNote, getTreeNote, setTreeNote } from './seasonNotesService'
import type { SeasonNote } from '../data/model'

describe('getCropNote', () => {
  it('retourne le texte de la note correspondant à la culture et l année', () => {
    const notes: SeasonNote[] = [
      { id: '1', year: 2026, cropId: '5', text: 'Trop de mildiou, traiter plus tôt' },
      { id: '2', year: 2025, cropId: '5', text: 'note année précédente' },
      { id: '3', year: 2026, cropId: '6', text: 'autre culture' },
    ]
    expect(getCropNote(notes, '5', 2026)).toBe('Trop de mildiou, traiter plus tôt')
  })

  it('retourne une chaîne vide si aucune note ne correspond', () => {
    const notes: SeasonNote[] = [{ id: '1', year: 2026, cropId: '5', text: 'note' }]
    expect(getCropNote(notes, '99', 2026)).toBe('')
  })
})

describe('getParcelNote', () => {
  it('retourne le texte de la note correspondant à la parcelle et l année', () => {
    const notes: SeasonNote[] = [
      { id: '1', year: 2026, parcelId: '2', text: 'Sécheresse en juillet' },
      { id: '2', year: 2025, parcelId: '2', text: 'note année précédente' },
    ]
    expect(getParcelNote(notes, '2', 2026)).toBe('Sécheresse en juillet')
  })

  it('retourne une chaîne vide si aucune note ne correspond', () => {
    const notes: SeasonNote[] = [{ id: '1', year: 2026, parcelId: '2', text: 'note' }]
    expect(getParcelNote(notes, '77', 2026)).toBe('')
  })
})

beforeEach(async () => {
  await db.seasonNotes.clear()
})

describe('setCropNote', () => {
  it('crée une nouvelle note si aucune n existe pour cette culture et cette année', async () => {
    await setCropNote('5', 2026, 'Trop dense, espacer davantage')
    const rows = await db.seasonNotes.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ cropId: '5', year: 2026, text: 'Trop dense, espacer davantage' })
  })

  it('met à jour la note existante au lieu d en créer une seconde', async () => {
    await setCropNote('5', 2026, 'premier texte')
    await setCropNote('5', 2026, 'texte corrigé')
    const rows = await db.seasonNotes.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toBe('texte corrigé')
  })

  it('supprime la note existante si le texte devient vide', async () => {
    await setCropNote('5', 2026, 'un texte')
    await setCropNote('5', 2026, '')
    const rows = await db.seasonNotes.toArray()
    expect(rows).toHaveLength(0)
  })

  it('ne crée rien si le texte est vide et qu aucune note n existait', async () => {
    await setCropNote('5', 2026, '')
    const rows = await db.seasonNotes.toArray()
    expect(rows).toHaveLength(0)
  })
})

describe('setParcelNote', () => {
  it('crée une nouvelle note si aucune n existe pour cette parcelle et cette année', async () => {
    await setParcelNote('2', 2026, 'Sécheresse en juillet')
    const rows = await db.seasonNotes.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ parcelId: '2', year: 2026, text: 'Sécheresse en juillet' })
  })

  it('met à jour la note existante au lieu d en créer une seconde', async () => {
    await setParcelNote('2', 2026, 'premier texte')
    await setParcelNote('2', 2026, 'texte corrigé')
    const rows = await db.seasonNotes.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toBe('texte corrigé')
  })
})

describe('getTreeNote', () => {
  it('renvoie le texte de la note correspondant a l arbre et a l annee', () => {
    const notes: SeasonNote[] = [{ id: 'n1', year: 2026, treeId: 'tree1', text: 'bonne recolte' }]
    expect(getTreeNote(notes, 'tree1', 2026)).toBe('bonne recolte')
  })

  it('renvoie une chaine vide si aucune note ne correspond', () => {
    expect(getTreeNote([], 'tree1', 2026)).toBe('')
  })
})

describe('setTreeNote', () => {
  it('cree une note pour l arbre et l annee donnes', async () => {
    await setTreeNote('tree1', 2026, 'fruits abimes par la grele')
    const notes = await db.seasonNotes.toArray()
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ treeId: 'tree1', year: 2026, text: 'fruits abimes par la grele' })
  })

  it('supprime la note si le texte redevient vide', async () => {
    await setTreeNote('tree1', 2026, 'note')
    await setTreeNote('tree1', 2026, '   ')
    const notes = await db.seasonNotes.toArray()
    expect(notes).toHaveLength(0)
  })
})
