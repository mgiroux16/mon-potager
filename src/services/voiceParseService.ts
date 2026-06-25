// Cœur pur de la voix : construit le prompt Gemini et valide le JSON renvoyé.
// Aucun réseau ici ; callGemini est appelé par l'orchestrateur (VoiceCapture).

import { LOG_ENTRY_TYPES, type LogEntryType } from '../data/model'
import type { NewLogEntry } from './logService'

export interface CatalogEntry {
  id: number
  name: string
}

export interface GardenCatalog {
  parcels: CatalogEntry[]
  crops: CatalogEntry[]
  oyas: CatalogEntry[]
  trees: CatalogEntry[]
}

export interface VoiceDraft {
  draft: Partial<NewLogEntry>
  parsed: boolean
}

function listForPrompt(label: string, entries: CatalogEntry[]): string {
  if (entries.length === 0) return `${label} : (aucun)`
  const items = entries.map((e) => `${e.id} = ${e.name}`).join(', ')
  return `${label} : ${items}`
}

export function buildVoicePrompt(
  transcript: string,
  catalog: GardenCatalog,
  todayISO: string,
): string {
  return [
    'Tu transformes une phrase de jardinage dictee en une entree de journal structuree.',
    `Date du jour : ${todayISO} (resous "ce matin", "hier", "aujourd hui" par rapport a elle).`,
    '',
    `Phrase dictee : "${transcript}"`,
    '',
    `Types valides (champ "type") : ${LOG_ENTRY_TYPES.join(', ')}.`,
    '',
    'Catalogue du jardin (utilise UNIQUEMENT ces identifiants, jamais d autres) :',
    listForPrompt('Parcelles (parcelId)', catalog.parcels),
    listForPrompt('Cultures (cropId)', catalog.crops),
    listForPrompt('Oyas (oyaId)', catalog.oyas),
    listForPrompt('Arbres (treeId)', catalog.trees),
    '',
    'Reponds UNIQUEMENT par un objet JSON, sans texte autour, avec seulement les champs reconnus :',
    'type, date (YYYY-MM-DD), time (HH:mm), title, description,',
    'parcelId, cropId, oyaId, treeId, volumeLiters, rainMm, quantityKg.',
    'Omets tout champ non mentionne dans la phrase.',
    'Une entree peut porter a la fois parcelId et cropId.',
    'N invente jamais un identifiant absent du catalogue.',
  ].join('\n')
}

const STRING_FIELDS = ['date', 'time', 'title', 'description'] as const
const NUMBER_FIELDS = ['volumeLiters', 'rainMm', 'quantityKg'] as const
const ID_FIELDS = [
  { field: 'parcelId', list: 'parcels' },
  { field: 'cropId', list: 'crops' },
  { field: 'oyaId', list: 'oyas' },
  { field: 'treeId', list: 'trees' },
] as const

function extractJson(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  return text.slice(start, end + 1)
}

function fallback(transcript: string): VoiceDraft {
  return { draft: { type: 'note', description: transcript }, parsed: false }
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

export function parseVoiceDraft(
  geminiText: string,
  catalog: GardenCatalog,
  transcript: string,
): VoiceDraft {
  const json = extractJson(geminiText)
  if (!json) return fallback(transcript)

  let raw: Record<string, unknown>
  try {
    const parsed = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return fallback(transcript)
    raw = parsed as Record<string, unknown>
  } catch {
    return fallback(transcript)
  }

  const type: LogEntryType = LOG_ENTRY_TYPES.includes(raw.type as LogEntryType)
    ? (raw.type as LogEntryType)
    : 'note'

  const draft: Partial<NewLogEntry> = { type }

  for (const field of STRING_FIELDS) {
    const value = raw[field]
    if (typeof value === 'string' && value.trim() !== '') {
      ;(draft as Record<string, unknown>)[field] = value
    }
  }

  for (const field of NUMBER_FIELDS) {
    const value = asNumber(raw[field])
    if (value !== undefined) {
      ;(draft as Record<string, unknown>)[field] = value
    }
  }

  for (const { field, list } of ID_FIELDS) {
    const value = asNumber(raw[field])
    if (value !== undefined && catalog[list].some((e) => e.id === value)) {
      ;(draft as Record<string, unknown>)[field] = value
    }
  }

  return { draft, parsed: true }
}
