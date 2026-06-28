import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import {
  buildDiagnosticPrompt,
  parseDiagnosticResponse,
  createDiagnostic,
  getDiagnosticForEntry,
  updateDiagnosticOutcome,
} from './diagnosticService'
import type { GardenLogEntry } from '../data/model'

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
})

describe('createDiagnostic / getDiagnosticForEntry', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
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
    const all = await db.diagnostics.toArray()
    expect(all).toHaveLength(1)

    const again = await getDiagnosticForEntry('p2')
    expect(again?.id).toBe(firstId)
  })
})

describe('updateDiagnosticOutcome', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('reste ouvert si seul le resultat est rempli', async () => {
    const id = await createDiagnostic({ problemEntryId: 'p3', hypotheses: [] })
    await updateDiagnosticOutcome(id, { chosenAction: 'Arrosage augmente', result: 'Feuilles reverdies' })
    const row = await db.diagnostics.get(id)
    expect(row?.status).toBe('ouvert')
  })

  it('passe a clos quand resultat et conclusion sont tous les deux remplis', async () => {
    const id = await createDiagnostic({ problemEntryId: 'p4', hypotheses: [] })
    await updateDiagnosticOutcome(id, {
      chosenAction: 'Arrosage augmente',
      result: 'Feuilles reverdies',
      conclusion: 'Surveiller l arrosage plus tot l an prochain',
    })
    const row = await db.diagnostics.get(id)
    expect(row?.status).toBe('clos')
  })
})
