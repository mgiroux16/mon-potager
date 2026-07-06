import { cloudAdd, cloudDelete, cloudPut } from '../data/firestoreWrites'
import type { SeasonNote } from '../data/model'

export function getCropNote(notes: SeasonNote[], cropId: string, year: number): string {
  return notes.find((n) => n.cropId === cropId && n.year === year)?.text ?? ''
}

export function getParcelNote(notes: SeasonNote[], parcelId: string, year: number): string {
  return notes.find((n) => n.parcelId === parcelId && n.year === year)?.text ?? ''
}

export function getTreeNote(notes: SeasonNote[], treeId: string, year: number): string {
  return notes.find((n) => n.treeId === treeId && n.year === year)?.text ?? ''
}

function upsertNote(
  notes: SeasonNote[],
  match: (n: SeasonNote) => boolean,
  build: () => Omit<SeasonNote, 'id'>,
  text: string,
): void {
  const existing = notes.find(match)
  const trimmed = text.trim()

  if (existing) {
    if (trimmed === '') {
      cloudDelete('seasonNotes', existing.id as string)
    } else {
      cloudPut('seasonNotes', existing.id as string, { text: trimmed })
    }
    return
  }

  if (trimmed !== '') {
    cloudAdd('seasonNotes', build())
  }
}

export function setCropNote(notes: SeasonNote[], cropId: string, year: number, text: string): void {
  upsertNote(
    notes,
    (n) => n.cropId === cropId && n.year === year,
    () => ({ cropId, year, text: text.trim() }),
    text,
  )
}

export function setParcelNote(notes: SeasonNote[], parcelId: string, year: number, text: string): void {
  upsertNote(
    notes,
    (n) => n.parcelId === parcelId && n.year === year,
    () => ({ parcelId, year, text: text.trim() }),
    text,
  )
}

export function setTreeNote(notes: SeasonNote[], treeId: string, year: number, text: string): void {
  upsertNote(
    notes,
    (n) => n.treeId === treeId && n.year === year,
    () => ({ treeId, year, text: text.trim() }),
    text,
  )
}
