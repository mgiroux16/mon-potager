import { db, newId } from '../data/db'
import type { Diagnostic, DiagnosticHypothesis, GardenLogEntry, HypothesisConfidence } from '../data/model'

const VALID_CONFIDENCES: HypothesisConfidence[] = ['faible', 'moyen', 'eleve']

export interface DiagnosticPromptInput {
  problemEntry: GardenLogEntry
  recentEntries: GardenLogEntry[]
  weatherSummary: string
  seasonHistory: string[]
}

function describeEntry(entry: GardenLogEntry): string {
  const parts = [entry.date, entry.type]
  if (entry.description) parts.push(entry.description)
  if (typeof entry.volumeLiters === 'number') parts.push(`${entry.volumeLiters} L`)
  if (typeof entry.quantityKg === 'number') parts.push(`${entry.quantityKg} kg`)
  return parts.join(' - ')
}

/**
 * Construit le prompt envoye a Gemini pour proposer des hypotheses face a un probleme.
 * Fonction pure : tout le contexte (entrees recentes, resume meteo, historique multi-saisons)
 * est deja assemble par l'appelant (page/orchestrateur), rien n'est lu ici depuis Dexie.
 */
export function buildDiagnosticPrompt(input: DiagnosticPromptInput): string {
  const { problemEntry, recentEntries, weatherSummary, seasonHistory } = input

  const recentLines =
    recentEntries.length > 0
      ? recentEntries.map((e) => `- ${describeEntry(e)}`).join('\n')
      : '(aucune action ou observation notee dans les 14 derniers jours)'

  const historyLines =
    seasonHistory.length > 0
      ? seasonHistory.map((line) => `- ${line}`).join('\n')
      : '(aucun historique de saison precedente disponible pour cette culture/variete)'

  return [
    'Tu es un assistant de jardinage. Un probleme a ete note dans le journal :',
    `"${problemEntry.description ?? '(pas de description)'}" le ${problemEntry.date}.`,
    '',
    'Contexte meteo des 14 derniers jours :',
    weatherSummary,
    '',
    'Actions et observations des 14 derniers jours sur la meme culture/parcelle :',
    recentLines,
    '',
    'Historique des saisons precedentes sur la meme culture ou variete :',
    historyLines,
    '',
    'Propose entre 2 et 4 hypotheses plausibles (jamais une certitude). Pour chaque hypothese,',
    'donne le texte, les indices precis du contexte ci-dessus qui la soutiennent, et un niveau',
    'de confiance qui doit etre exactement l un de ces trois mots : faible, moyen ou eleve.',
    'Reponds UNIQUEMENT par un tableau JSON d objets { "text", "indices", "confidence" },',
    'sans aucun texte autour.',
  ].join('\n')
}

/**
 * Extrait { data, mimeType } d'un data URL (ex: produit par compressImage pour photoUrls).
 * Renvoie null si la chaine ne suit pas le format `data:<mime>;base64,<data>`.
 */
export function parseDataUrl(url: string): { data: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(url)
  if (!match) return null
  return { mimeType: match[1], data: match[2] }
}

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return null
  return text.slice(start, end + 1)
}

/**
 * Parse la reponse texte de Gemini en une liste d'hypotheses valides. Toute hypothese dont la
 * confiance ne correspond pas exactement a faible/moyen/eleve est ecartee plutot que corrigee :
 * mieux vaut perdre une hypothese douteuse que d'afficher une confiance inventee.
 */
export function parseDiagnosticResponse(raw: string): DiagnosticHypothesis[] {
  const jsonText = extractJsonArray(raw)
  if (!jsonText) throw new Error('Réponse Gemini illisible pour le diagnostic')

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('Réponse Gemini illisible pour le diagnostic')
  }

  if (!Array.isArray(parsed)) throw new Error('Réponse Gemini illisible pour le diagnostic')

  const hypotheses: DiagnosticHypothesis[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue
    const { text, indices, confidence } = item as Record<string, unknown>
    if (typeof text !== 'string' || text.trim() === '') continue
    if (typeof indices !== 'string' || indices.trim() === '') continue
    if (typeof confidence !== 'string' || !VALID_CONFIDENCES.includes(confidence as HypothesisConfidence)) {
      continue
    }
    hypotheses.push({ text, indices, confidence: confidence as HypothesisConfidence })
  }

  if (hypotheses.length === 0) throw new Error('Réponse Gemini illisible pour le diagnostic')
  return hypotheses
}

export interface CreateDiagnosticInput {
  problemEntryId: string
  cropId?: string
  parcelId?: string
  treeId?: string
  hypotheses: DiagnosticHypothesis[]
}

/**
 * Cree un Diagnostic ouvert pour une entree probleme, sauf s il en existe deja un : un seul
 * diagnostic par entree probleme (voir spec section 4).
 */
export async function createDiagnostic(input: CreateDiagnosticInput): Promise<string> {
  const existing = await getDiagnosticForEntry(input.problemEntryId)
  if (existing) return existing.id as string

  const id = newId()
  const diagnostic: Diagnostic = {
    id,
    problemEntryId: input.problemEntryId,
    cropId: input.cropId,
    parcelId: input.parcelId,
    treeId: input.treeId,
    createdAt: Date.now(),
    hypotheses: input.hypotheses,
    status: 'ouvert',
  }
  await db.diagnostics.add(diagnostic)
  return id
}

export async function getDiagnosticForEntry(problemEntryId: string): Promise<Diagnostic | undefined> {
  return db.diagnostics.toCollection().filter((d) => d.problemEntryId === problemEntryId).first()
}

export interface DiagnosticOutcome {
  chosenAction?: string
  result?: string
  conclusion?: string
}

/**
 * Met a jour action/resultat/conclusion sur un diagnostic. Passe automatiquement le statut a
 * 'clos' des que resultat ET conclusion sont non vides (cf. spec section 4) ; reste 'ouvert'
 * sinon, y compris si l un des deux redevient vide apres une correction.
 */
export async function updateDiagnosticOutcome(id: string, outcome: DiagnosticOutcome): Promise<void> {
  const closed = (outcome.result ?? '').trim() !== '' && (outcome.conclusion ?? '').trim() !== ''
  await db.diagnostics.update(id, {
    chosenAction: outcome.chosenAction,
    result: outcome.result,
    conclusion: outcome.conclusion,
    status: closed ? 'clos' : 'ouvert',
  })
}
