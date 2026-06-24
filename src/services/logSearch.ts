import type { GardenLogEntry } from '../data/model'
import { LOG_TYPE_LABELS } from './logView'

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Filtre des entrées sur une requête texte. Cherche dans le titre, la description,
// le nom de la cible résolue et le libellé du type. Plusieurs mots = ET (tous présents).
// Requête vide = aucun filtre. Insensible à la casse et aux accents.
export function searchLogEntries(
  entries: GardenLogEntry[],
  query: string,
  resolveTargetName: (entry: GardenLogEntry) => string | undefined,
): GardenLogEntry[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return entries
  return entries.filter((entry) => {
    const haystack = normalize(
      [
        entry.title,
        entry.description,
        resolveTargetName(entry),
        LOG_TYPE_LABELS[entry.type],
      ]
        .filter(Boolean)
        .join(' '),
    )
    return terms.every((term) => haystack.includes(term))
  })
}
