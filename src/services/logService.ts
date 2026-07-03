import { db } from '../data/db'
import type { GardenLogEntry, LogEntryType } from '../data/model'

// Entrée à créer : tout sauf id et createdAt (générés ici).
export type NewLogEntry = Omit<GardenLogEntry, 'id' | 'createdAt'> & {
  createdAt?: number
}

export async function addLogEntry(entry: NewLogEntry): Promise<string> {
  const id = crypto.randomUUID()
  await db.log.add({
    ...entry,
    id,
    status: entry.status ?? 'valide',
    createdAt: entry.createdAt ?? Date.now(),
  })
  return id
}

// Mise a jour partielle (Dexie update()) : ne touche que les champs fournis dans `entry`,
// donc createdAt/weather/sourcePhrase restent intacts si l'appelant ne les fixe pas.
export async function updateLogEntry(id: string, entry: NewLogEntry): Promise<void> {
  await db.log.update(id, entry)
}

// Journal complet, du plus récent au plus ancien (date puis createdAt).
export async function listLog(): Promise<GardenLogEntry[]> {
  const all = await db.log.toArray()
  return all.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return b.createdAt - a.createdAt
  })
}

// Vue dérivée : le journal filtré sur un type (arrosages, pluie, récoltes...).
export async function listLogByType(type: LogEntryType): Promise<GardenLogEntry[]> {
  const all = await listLog()
  return all.filter((e) => e.type === type)
}
