import { cloudAdd } from '../data/firestoreWrites'
import type { Variety } from '../data/model'

export type NewVariety = Omit<Variety, 'id'>

export function addVariety(variety: NewVariety): string {
  return cloudAdd('varieties', { ...variety })
}

// Réutilise une variété existante (comparaison insensible à la casse sur nom + légume),
// sinon la crée. La liste vient de useCollection('varieties') côté appelant.
export function findOrCreateVariety(
  varieties: Variety[],
  name: string,
  vegetable: string,
): string {
  const norm = (s: string) => s.trim().toLowerCase()
  const existing = varieties.find(
    (v) => norm(v.name) === norm(name) && norm(v.vegetable) === norm(vegetable),
  )
  if (existing?.id != null) return existing.id
  return addVariety({ name: name.trim(), vegetable: vegetable.trim() })
}
