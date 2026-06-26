import { db } from '../data/db'
import type { SeasonNote } from '../data/model'

export function getCropNote(notes: SeasonNote[], cropId: number, year: number): string {
  return notes.find((n) => n.cropId === cropId && n.year === year)?.text ?? ''
}

export function getParcelNote(notes: SeasonNote[], parcelId: number, year: number): string {
  return notes.find((n) => n.parcelId === parcelId && n.year === year)?.text ?? ''
}

async function upsertNote(
  match: (n: SeasonNote) => boolean,
  build: () => SeasonNote,
  text: string,
): Promise<void> {
  const all = await db.seasonNotes.toArray()
  const existing = all.find(match)
  const trimmed = text.trim()

  if (existing) {
    if (trimmed === '') {
      await db.seasonNotes.delete(existing.id as number)
    } else {
      await db.seasonNotes.update(existing.id as number, { text: trimmed })
    }
    return
  }

  if (trimmed !== '') {
    await db.seasonNotes.add(build())
  }
}

export async function setCropNote(cropId: number, year: number, text: string): Promise<void> {
  await upsertNote(
    (n) => n.cropId === cropId && n.year === year,
    () => ({ cropId, year, text: text.trim() }),
    text,
  )
}

export async function setParcelNote(parcelId: number, year: number, text: string): Promise<void> {
  await upsertNote(
    (n) => n.parcelId === parcelId && n.year === year,
    () => ({ parcelId, year, text: text.trim() }),
    text,
  )
}
