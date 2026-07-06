import type { GardenLogEntry, LogEntryType } from '../data/model'
import { cloudPut } from '../data/firestoreWrites'

// Entrée à créer : tout sauf id et createdAt (générés ici).
export type NewLogEntry = Omit<GardenLogEntry, 'id' | 'createdAt'> & {
  createdAt?: number
}

export function addLogEntry(entry: NewLogEntry): string {
  const id = crypto.randomUUID()
  cloudPut('log', id, {
    ...entry,
    id,
    status: entry.status ?? 'valide',
    createdAt: entry.createdAt ?? Date.now(),
  })
  return id
}

// Mise a jour partielle (setDoc merge) : ne touche que les champs fournis dans `entry`,
// donc createdAt/weather/sourcePhrase restent intacts si l'appelant ne les fixe pas.
export function updateLogEntry(id: string, entry: NewLogEntry): void {
  cloudPut('log', id, entry)
}

// Tri du journal, du plus récent au plus ancien (date puis createdAt).
// Pur : s'applique au tableau renvoyé par useCollection('log').
export function sortLog(entries: GardenLogEntry[]): GardenLogEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return b.createdAt - a.createdAt
  })
}

// Vue dérivée : le journal filtré sur un type (arrosages, pluie, récoltes...).
export function filterLogByType(entries: GardenLogEntry[], type: LogEntryType): GardenLogEntry[] {
  return sortLog(entries).filter((e) => e.type === type)
}
