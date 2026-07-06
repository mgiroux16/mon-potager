import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SeasonNote } from '../data/model'

const cloudPutMock = vi.fn()
const cloudAddMock = vi.fn(() => 'new-id')
const cloudDeleteMock = vi.fn()
vi.mock('../data/firestoreWrites', () => ({
  cloudPut: (...args: unknown[]) => cloudPutMock(...args),
  cloudAdd: (...args: unknown[]) => cloudAddMock(...args),
  cloudDelete: (...args: unknown[]) => cloudDeleteMock(...args),
}))

import { getCropNote, getParcelNote, setCropNote, setParcelNote, getTreeNote, setTreeNote } from './seasonNotesService'

beforeEach(() => {
  vi.clearAllMocks()
})

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

describe('setCropNote', () => {
  it('crée une nouvelle note si aucune n existe pour cette culture et cette année', () => {
    setCropNote([], '5', 2026, 'Trop dense, espacer davantage')
    expect(cloudAddMock).toHaveBeenCalledWith('seasonNotes', {
      cropId: '5',
      year: 2026,
      text: 'Trop dense, espacer davantage',
    })
  })

  it('met à jour la note existante au lieu d en créer une seconde', () => {
    const notes: SeasonNote[] = [{ id: 'n1', cropId: '5', year: 2026, text: 'premier texte' }]
    setCropNote(notes, '5', 2026, 'texte corrigé')
    expect(cloudPutMock).toHaveBeenCalledWith('seasonNotes', 'n1', { text: 'texte corrigé' })
    expect(cloudAddMock).not.toHaveBeenCalled()
  })

  it('supprime la note existante si le texte devient vide', () => {
    const notes: SeasonNote[] = [{ id: 'n1', cropId: '5', year: 2026, text: 'un texte' }]
    setCropNote(notes, '5', 2026, '')
    expect(cloudDeleteMock).toHaveBeenCalledWith('seasonNotes', 'n1')
  })

  it('ne crée rien si le texte est vide et qu aucune note n existait', () => {
    setCropNote([], '5', 2026, '')
    expect(cloudAddMock).not.toHaveBeenCalled()
    expect(cloudPutMock).not.toHaveBeenCalled()
  })
})

describe('setParcelNote', () => {
  it('crée une nouvelle note si aucune n existe pour cette parcelle et cette année', () => {
    setParcelNote([], '2', 2026, 'Sécheresse en juillet')
    expect(cloudAddMock).toHaveBeenCalledWith('seasonNotes', {
      parcelId: '2',
      year: 2026,
      text: 'Sécheresse en juillet',
    })
  })

  it('met à jour la note existante au lieu d en créer une seconde', () => {
    const notes: SeasonNote[] = [{ id: 'n1', parcelId: '2', year: 2026, text: 'premier texte' }]
    setParcelNote(notes, '2', 2026, 'texte corrigé')
    expect(cloudPutMock).toHaveBeenCalledWith('seasonNotes', 'n1', { text: 'texte corrigé' })
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
  it('cree une note pour l arbre et l annee donnes', () => {
    setTreeNote([], 'tree1', 2026, 'fruits abimes par la grele')
    expect(cloudAddMock).toHaveBeenCalledWith('seasonNotes', {
      treeId: 'tree1',
      year: 2026,
      text: 'fruits abimes par la grele',
    })
  })

  it('supprime la note si le texte redevient vide', () => {
    const notes: SeasonNote[] = [{ id: 'n1', treeId: 'tree1', year: 2026, text: 'note' }]
    setTreeNote(notes, 'tree1', 2026, '   ')
    expect(cloudDeleteMock).toHaveBeenCalledWith('seasonNotes', 'n1')
  })
})
