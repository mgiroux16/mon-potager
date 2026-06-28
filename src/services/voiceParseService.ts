// Cœur pur de la voix : construit le prompt Gemini et valide le JSON renvoyé.
// Aucun réseau ici ; callGemini est appelé par l'orchestrateur (VoiceCapture).

import { LOG_ENTRY_TYPES, type LogEntryType } from '../data/model'
import type { NewLogEntry } from './logService'

export interface CatalogEntry {
  id: string
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
    'Reponds UNIQUEMENT par un objet JSON, sans texte autour, de la forme :',
    '{"transcript": "<transcription mot pour mot de l audio>", "entries": [...]}.',
    '"entries" est un tableau d objets, meme s il n y a qu une seule action detectee.',
    'Chaque objet de "entries" ne porte que les champs reconnus :',
    'type, date (YYYY-MM-DD), time (HH:mm), title, description,',
    'parcelId, cropId, oyaId, treeId, volumeLiters, rainMm, quantityKg.',
    'Omets tout champ non mentionne dans la phrase.',
    'Une entree peut porter a la fois parcelId et cropId.',
    'Mets toujours dans "description" un resume de ce qui a ete dit pour cette action.',
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

function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  return text.slice(start, end + 1)
}

interface ExtractedEntries {
  entries: unknown[]
  transcript?: string
}

// Reponse attendue : {"transcript": "...", "entries": [...]}. On retombe sur un simple
// tableau si Gemini ne respecte pas l'enveloppe (resilience face a un format legerement
// different), au prix de perdre la transcription dans ce cas.
function extractEntries(text: string): ExtractedEntries | null {
  const objText = extractJsonObject(text)
  if (objText) {
    try {
      const obj = JSON.parse(objText)
      if (obj && typeof obj === 'object' && Array.isArray(obj.entries)) {
        return {
          entries: obj.entries,
          transcript: typeof obj.transcript === 'string' ? obj.transcript : undefined,
        }
      }
    } catch {
      // ignore, on retente avec l'extraction de tableau ci-dessous
    }
  }

  const arrText = extractJsonArray(text)
  if (arrText) {
    try {
      const arr = JSON.parse(arrText)
      if (Array.isArray(arr)) return { entries: arr }
    } catch {
      // ignore, retombe sur le repli note plus bas
    }
  }

  return null
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
    const value = raw[field]
    if (typeof value === 'string' && catalog[list].some((e) => e.id === value)) {
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
  const extracted = extractEntries(geminiText)
  if (!extracted || extracted.entries.length === 0) return fallback(transcript)

  const items = extracted.entries
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .slice(0, MAX_DRAFTS)

  if (items.length === 0) return fallback(transcript)

  return items.map((raw) => {
    const voiceDraft = parseOneDraft(raw, catalog)
    if (extracted.transcript) voiceDraft.draft.sourcePhrase = extracted.transcript
    return voiceDraft
  })
}
