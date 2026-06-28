import type { Diagnostic, SeasonNote } from '../data/model'

export interface SeasonHistoryInput {
  cropId?: string
  notes: SeasonNote[]
  diagnostics: Diagnostic[]
}

/**
 * Assemble les lignes d'historique multi-saisons envoyees a Gemini : notes de bilan de saison
 * (seasonNotesService) et conclusions des diagnostics deja clos, filtrees sur la meme culture.
 * Pas de filtrage par variete ici : les notes de saison ne portent que cropId/parcelId
 * (cf. data/model.ts SeasonNote), donc l agregation se fait au niveau culture.
 */
export function buildSeasonHistoryLines(input: SeasonHistoryInput): string[] {
  const { cropId, notes, diagnostics } = input
  if (!cropId) return []

  const noteLines = notes
    .filter((n) => n.cropId === cropId)
    .map((n) => `${n.year} : ${n.text}`)

  const diagnosticLines = diagnostics
    .filter((d) => d.cropId === cropId && d.status === 'clos' && d.conclusion)
    .map((d) => `Diagnostic precedent conclu : ${d.conclusion}`)

  return [...noteLines, ...diagnosticLines]
}
