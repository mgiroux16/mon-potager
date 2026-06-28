import { db, newId } from '../data/db'
import { softDelete } from '../data/syncHooks'
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

async function upsertNote(
  match: (n: SeasonNote) => boolean,
  build: () => Omit<SeasonNote, 'id'>,
  text: string,
): Promise<void> {
  const all = await db.seasonNotes.toArray()
  const existing = all.find(match)
  const trimmed = text.trim()

  if (existing) {
    if (trimmed === '') {
      await softDelete('seasonNotes', existing.id as string)
    } else {
      await db.seasonNotes.update(existing.id as string, { text: trimmed })
    }
    return
  }

  if (trimmed !== '') {
    await db.seasonNotes.add({ ...build(), id: newId() })
  }
}

export async function setCropNote(cropId: string, year: number, text: string): Promise<void> {
  await upsertNote(
    (n) => n.cropId === cropId && n.year === year,
    () => ({ cropId, year, text: text.trim() }),
    text,
  )
}

export async function setParcelNote(parcelId: string, year: number, text: string): Promise<void> {
  await upsertNote(
    (n) => n.parcelId === parcelId && n.year === year,
    () => ({ parcelId, year, text: text.trim() }),
    text,
  )
}

export async function setTreeNote(treeId: string, year: number, text: string): Promise<void> {
  await upsertNote(
    (n) => n.treeId === treeId && n.year === year,
    () => ({ treeId, year, text: text.trim() }),
    text,
  )
}
