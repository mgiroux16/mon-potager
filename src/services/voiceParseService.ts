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

const MAX_DRAFTS = 5

function listForPrompt(label: string, entries: CatalogEntry[]): string {
  if (entries.length === 0) return `${label} : (aucun)`
  const items = entries.map((e) => `${e.id} = ${e.name}`).join(', ')
  return `${label} : ${items}`
}

export function buildVoiceAudioPrompt(catalog: GardenCatalog, todayISO: string): string {
  return [
    'Tu reçois un enregistrement audio en français où une personne décrit une ou plusieurs',
    'actions de jardinage. Transcris-le puis transforme-le en entrees de journal structurees.',
    `Date du jour : ${todayISO} (resous "ce matin", "hier", "aujourd hui" par rapport a elle).`,
    '',
    `Types valides (champ "type") : ${LOG_ENTRY_TYPES.join(', ')}.`,
    '',
    'Catalogue du jardin (utilise UNIQUEMENT ces identifiants, jamais d autres) :',
    listForPrompt('Parcelles (parcelId)', catalog.parcels),
    listForPrompt('Cultures (cropId)', catalog.crops),
    listForPrompt('Oyas (oyaId)', catalog.oyas),
    listForPrompt('Arbres (treeId)', catalog.trees),
    '',
    'La phrase peut decrire plusieurs actions distinctes (ex : une recolte puis un arrosage).',
    'Reponds UNIQUEMENT par un tableau JSON d objets, sans texte autour, meme s il n y a qu',
    'une seule action detectee. Chaque objet ne porte que les champs reconnus :',
    'type, date (YYYY-MM-DD), time (HH:mm), title, description,',
    'parcelId, cropId, oyaId, treeId, volumeLiters, rainMm, quantityKg.',
    'Omets tout champ non mentionne dans la phrase.',
    'Une entree peut porter a la fois parcelId et cropId.',
    'Mets toujours dans "description" la transcription de ce qui a ete dit pour cette action.',
    'N invente jamais un identifiant absent du catalogue.',
  ].join('\n')
}

// Listes blanches a garder en phase avec GardenLogEntry (data/model.ts) : un champ
// ajoute la-bas sans l'ajouter ici est simplement ignore dans les brouillons vocaux.
const STRING_FIELDS = ['date', 'time', 'title', 'description'] as const
const NUMBER_FIELDS = ['volumeLiters', 'rainMm', 'quantityKg'] as const
const ID_FIELDS = [
  { field: 'parcelId', list: 'parcels' },
  { field: 'cropId', list: 'crops' },
  { field: 'oyaId', list: 'oyas' },
  { field: 'treeId', list: 'trees' },
] as const

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return null
  return text.slice(start, end + 1)
}

function fallback(transcript: string): VoiceDraft[] {
  return [{ draft: { type: 'note', description: transcript }, parsed: false }]
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

function parseOneDraft(raw: Record<string, unknown>, catalog: GardenCatalog): VoiceDraft {
  const type: LogEntryType = LOG_ENTRY_TYPES.includes(raw.type as LogEntryType)
    ? (raw.type as LogEntryType)
    : 'note'

  const draft: Partial<NewLogEntry> = { type }

  // `field` vient toujours des tableaux litteraux ci-dessus, jamais des cles de `raw` :
  // aucune cle controlee par le modele (ex : __proto__) ne peut donc devenir une cible
  // d'affectation. C'est ce qui rend la copie de la sortie LLM sure.
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

export function parseVoiceDrafts(
  geminiText: string,
  catalog: GardenCatalog,
  transcript: string,
): VoiceDraft[] {
  const json = extractJsonArray(geminiText)
  if (!json) return fallback(transcript)

  let rawArray: unknown
  try {
    rawArray = JSON.parse(json)
  } catch {
    return fallback(transcript)
  }
  if (!Array.isArray(rawArray) || rawArray.length === 0) return fallback(transcript)

  const items = rawArray
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .slice(0, MAX_DRAFTS)

  if (items.length === 0) return fallback(transcript)

  return items.map((raw) => parseOneDraft(raw, catalog))
}
