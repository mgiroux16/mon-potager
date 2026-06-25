// Cœur pur de la voix : construit le prompt Gemini et valide le JSON renvoyé.
// Aucun réseau ici ; callGemini est appelé par l'orchestrateur (VoiceCapture).

import { LOG_ENTRY_TYPES } from '../data/model'
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
  draft: NewLogEntry
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
