import { db } from '../data/db'
import type { Variety } from '../data/model'

export type NewVariety = Omit<Variety, 'id'>

export async function addVariety(variety: NewVariety): Promise<number> {
  return db.varieties.add(variety)
}

export async function listVarieties(): Promise<Variety[]> {
  const all = await db.varieties.toArray()
  return all.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

// Réutilise une variété existante (comparaison insensible à la casse sur nom + légume),
// sinon la crée. Renvoie l'id dans les deux cas.
export async function findOrCreateVariety(name: string, vegetable: string): Promise<number> {
  const norm = (s: string) => s.trim().toLowerCase()
  const all = await db.varieties.toArray()
  const existing = all.find(
    (v) => norm(v.name) === norm(name) && norm(v.vegetable) === norm(vegetable),
  )
  if (existing?.id != null) return existing.id
  return db.varieties.add({ name: name.trim(), vegetable: vegetable.trim() })
}
