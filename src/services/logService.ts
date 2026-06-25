import { db } from '../data/db'
import type { GardenLogEntry, LogEntryType } from '../data/model'

// Entrée à créer : tout sauf id et createdAt (générés ici).
export type NewLogEntry = Omit<GardenLogEntry, 'id' | 'createdAt'> & {
  createdAt?: number
}

export async function addLogEntry(entry: NewLogEntry): Promise<number> {
  return db.log.add({
    ...entry,
    status: entry.status ?? 'valide',
    createdAt: entry.createdAt ?? Date.now(),
  })
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
