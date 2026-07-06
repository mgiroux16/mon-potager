import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { GardenLogEntry } from '../data/model'

let store: Record<string, unknown>[] = []
const cloudAddMock = vi.fn((_table: string, data: Record<string, unknown>) => {
  const id = crypto.randomUUID()
  store.push({ id, ...data })
  return id
})
const cloudPutMock = vi.fn((_table: string, id: string, data: Record<string, unknown>) => {
  store = store.map((row) => (row.id === id ? { ...row, ...data } : row))
})
const cloudGetAllMock = vi.fn(async (_table: string) => store)
vi.mock('../data/firestoreWrites', () => ({
  cloudAdd: (...args: [string, Record<string, unknown>]) => cloudAddMock(...args),
  cloudPut: (...args: [string, string, Record<string, unknown>]) => cloudPutMock(...args),
  cloudGetAll: (...args: [string]) => cloudGetAllMock(...args),
}))

import {
  buildDiagnosticPrompt,
  parseDiagnosticResponse,
  createDiagnostic,
  getDiagnosticForEntry,
  updateDiagnosticOutcome,
  parseDataUrl,
} from './diagnosticService'

describe('parseDataUrl', () => {
  it('extrait le mimeType et les donnees base64 d un data URL', () => {
    const result = parseDataUrl('data:image/jpeg;base64,QUJD')
    expect(result).toEqual({ data: 'QUJD', mimeType: 'image/jpeg' })
  })

  it('renvoie null si la chaine n est pas un data URL valide', () => {
    expect(parseDataUrl('https://example.com/photo.jpg')).toBeNull()
  })
})

describe('buildDiagnosticPrompt', () => {
  it('inclut le probleme, la fenetre de 14 jours et l historique multi-saisons', () => {
    const problemEntry: GardenLogEntry = {
      id: 'e1',
      type: 'probleme',
      date: '2026-06-20',
      description: 'feuilles jaunes sur les tomates',
      cropId: 'crop1',
      createdAt: 1,
    }
    const recentEntries: GardenLogEntry[] = [
      { id: 'e2', type: 'arrosage', date: '2026-06-18', volumeLiters: 10, cropId: 'crop1', createdAt: 1 },
    ]
    const prompt = buildDiagnosticPrompt({
      problemEntry,
      recentEntries,
      weatherSummary: 'Pluie quasi nulle sur 14 jours, pic a 32 degres le 2026-06-15.',
      seasonHistory: ['2025 : mildiou note fin juillet sur la meme culture.'],
    })

    expect(prompt).toContain('feuilles jaunes sur les tomates')
    expect(prompt).toContain('Pluie quasi nulle sur 14 jours')
    expect(prompt).toContain('mildiou note fin juillet')
    expect(prompt).toContain('arrosage')
    expect(prompt).toContain('faible, moyen ou eleve')
    expect(prompt).toContain('suggestedTreatment')
  })
})

describe('parseDiagnosticResponse', () => {
  it('parse un tableau JSON valide en hypotheses', () => {
    const raw = JSON.stringify([
      { text: 'Stress hydrique', indices: 'Peu de pluie, forte chaleur', confidence: 'eleve' },
      { text: 'Carence azotee', indices: 'Jaunissement progressif des feuilles basses', confidence: 'faible' },
    ])
    const result = parseDiagnosticResponse(raw)
    expect(result).toEqual([
      { text: 'Stress hydrique', indices: 'Peu de pluie, forte chaleur', confidence: 'eleve' },
      { text: 'Carence azotee', indices: 'Jaunissement progressif des feuilles basses', confidence: 'faible' },
    ])
  })

  it('ignore les entrees avec une confiance invalide et garde les autres', () => {
    const raw = JSON.stringify([
      { text: 'Bonne hypothese', indices: 'Indice valable', confidence: 'moyen' },
      { text: 'Mauvaise', indices: 'x', confidence: 'extreme' },
    ])
    const result = parseDiagnosticResponse(raw)
    expect(result).toEqual([{ text: 'Bonne hypothese', indices: 'Indice valable', confidence: 'moyen' }])
  })

  it('leve une erreur lisible si la reponse n est pas un JSON exploitable', () => {
    expect(() => parseDiagnosticResponse('texte libre sans JSON')).toThrow(
      'Réponse Gemini illisible pour le diagnostic',
    )
  })

  it('leve une erreur si aucune hypothese valide n a survecu au parsing', () => {
    const raw = JSON.stringify([{ text: 'x', indices: 'y', confidence: 'extreme' }])
    expect(() => parseDiagnosticResponse(raw)).toThrow('Réponse Gemini illisible pour le diagnostic')
  })

  it('accepte une hypothese avec suggestedTreatment et une sans', () => {
    const raw = JSON.stringify([
      { text: 'mildiou', indices: 'taches brunes', confidence: 'moyen', suggestedTreatment: 'bouillie bordelaise' },
      { text: 'exces d eau', indices: 'sol detrempe', confidence: 'faible' },
    ])
    const hypotheses = parseDiagnosticResponse(raw)
    expect(hypotheses).toHaveLength(2)
    expect(hypotheses[0].suggestedTreatment).toBe('bouillie bordelaise')
    expect(hypotheses[1].suggestedTreatment).toBeUndefined()
  })
})

describe('createDiagnostic / getDiagnosticForEntry', () => {
  beforeEach(() => {
    store = []
    vi.clearAllMocks()
  })

  it('cree un diagnostic ouvert lie a l entree probleme', async () => {
    const hypotheses = [{ text: 'Stress hydrique', indices: 'Peu de pluie', confidence: 'eleve' as const }]
    const id = await createDiagnostic({ problemEntryId: 'p1', cropId: 'c1', hypotheses })

    const found = await getDiagnosticForEntry('p1')
    expect(found?.id).toBe(id)
    expect(found?.status).toBe('ouvert')
    expect(found?.hypotheses).toEqual(hypotheses)
  })

  it('renvoie le diagnostic existant plutot que d en creer un second pour la meme entree', async () => {
    const hypotheses = [{ text: 'A', indices: 'B', confidence: 'moyen' as const }]
    const firstId = await createDiagnostic({ problemEntryId: 'p2', hypotheses })
    expect(store).toHaveLength(1)

    const again = await getDiagnosticForEntry('p2')
    expect(again?.id).toBe(firstId)
  })
})

describe('updateDiagnosticOutcome', () => {
  beforeEach(() => {
    store = []
    vi.clearAllMocks()
  })

  it('reste ouvert si seul le resultat est rempli', async () => {
    const id = await createDiagnostic({ problemEntryId: 'p3', hypotheses: [] })
    updateDiagnosticOutcome(id, { chosenAction: 'Arrosage augmente', result: 'Feuilles reverdies' })
    const row = store.find((r) => r.id === id)
    expect(row?.status).toBe('ouvert')
  })

  it('passe a clos quand resultat et conclusion sont tous les deux remplis', async () => {
    const id = await createDiagnostic({ problemEntryId: 'p4', hypotheses: [] })
    updateDiagnosticOutcome(id, {
      chosenAction: 'Arrosage augmente',
      result: 'Feuilles reverdies',
      conclusion: 'Surveiller l arrosage plus tot l an prochain',
    })
    const row = store.find((r) => r.id === id)
    expect(row?.status).toBe('clos')
  })
})
