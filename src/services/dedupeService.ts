import { db } from '../data/db'
import { softDelete } from '../data/syncHooks'
import type { Crop, Diagnostic, GardenLogEntry, Parcel } from '../data/model'

export interface DedupeSummary {
  parcelsMerged: number
  cropsMerged: number
}

/** Retire les suffixes "(copie)" (repetes eventuellement) pour comparer les noms d'origine. */
function normalizeName(name: string): string {
  return name.replace(/(\s*\(copie\))+$/i, '').trim().toLowerCase()
}

/**
 * Regroupe les elements de meme nom (une fois les suffixes "(copie)" retires) et choisit,
 * par groupe, celui a conserver : d'abord un nom sans "(copie)" s'il existe, sinon le plus
 * ancien (updatedAt le plus bas). Retourne l'association id supprime -> id conserve.
 */
function planMerge<T extends { id?: string; name: string; updatedAt?: number }>(
  items: T[],
): Map<string, string> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    if (item.id == null) continue
    const key = normalizeName(item.name)
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }

  const idMap = new Map<string, string>()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => {
      const aCopy = /\(copie\)/i.test(a.name)
      const bCopy = /\(copie\)/i.test(b.name)
      if (aCopy !== bCopy) return aCopy ? 1 : -1
      return (a.updatedAt ?? 0) - (b.updatedAt ?? 0)
    })
    const [kept, ...rest] = sorted
    for (const dup of rest) {
      idMap.set(dup.id as string, kept.id as string)
    }
  }
  return idMap
}

function remap(id: string | undefined, idMap: Map<string, string>): string | undefined {
  if (id == null) return id
  return idMap.get(id) ?? id
}

/**
 * Fusionne les parcelles et cultures en doublon (meme nom, avec ou sans suffixe "(copie)") :
 * reattribue d'abord toutes les references (journal, cultures, diagnostics) vers l'exemplaire
 * conserve, puis supprime les autres via softDelete (tombstone, synchronise sur tous les
 * appareils comme une suppression manuelle).
 */
export async function dedupeGardenData(): Promise<DedupeSummary> {
  const [parcels, crops, log, diagnostics] = await Promise.all([
    db.parcels.toArray(),
    db.crops.toArray(),
    db.log.toArray(),
    db.diagnostics.toArray(),
  ])

  // DEBUG TEMPORAIRE (diagnostic doublons non detectes) : a retirer une fois la
  // cause confirmee. console.table plutot que console.log(objet) : tout est deja
  // deplie a l'affichage, pas besoin de cliquer sur chaque ligne. Colonne "raw" tronquee
  // par Chrome si trop longue : rawJSON reste la reference fiable (espaces/caracteres
  // invisibles visibles), la longueur de rawJSON revele tout ecart meme invisible a l'oeil.
  for (const [label, items] of [
    ['parcelles', parcels],
    ['cultures', crops],
  ] as const) {
    const rows = items.map((item) => {
      const raw = (item as { name?: string }).name ?? ''
      return {
        id: (item as { id?: string }).id,
        raw,
        rawJSON: JSON.stringify(raw),
        rawLength: raw.length,
        nfc: raw.normalize('NFC'),
        nfcEqualsRaw: raw.normalize('NFC') === raw,
        key: normalizeName(raw),
      }
    })
    console.log(`[dedupe][debug] ${label}`)
    console.table(rows)
  }

  const parcelIdMap = planMerge(parcels as (Parcel & { id: string })[])
  const cropIdMap = planMerge(crops as (Crop & { id: string })[])

  if (parcelIdMap.size > 0 || cropIdMap.size > 0) {
    await reassignLogReferences(log, parcelIdMap, cropIdMap)
    await reassignCropParcelReferences(crops, parcelIdMap)
    await reassignDiagnosticReferences(diagnostics, parcelIdMap, cropIdMap)
  }

  for (const removedId of parcelIdMap.keys()) {
    await softDelete('parcels', removedId)
  }
  for (const removedId of cropIdMap.keys()) {
    await softDelete('crops', removedId)
  }

  return { parcelsMerged: parcelIdMap.size, cropsMerged: cropIdMap.size }
}

async function reassignLogReferences(
  log: GardenLogEntry[],
  parcelIdMap: Map<string, string>,
  cropIdMap: Map<string, string>,
): Promise<void> {
  for (const entry of log) {
    if (entry.id == null) continue
    const updates: Partial<GardenLogEntry> = {}

    if (entry.parcelId != null && parcelIdMap.has(entry.parcelId)) {
      updates.parcelId = remap(entry.parcelId, parcelIdMap)
    }
    if (entry.parcelIds && entry.parcelIds.some((id) => parcelIdMap.has(id))) {
      updates.parcelIds = entry.parcelIds.map((id) => remap(id, parcelIdMap) as string)
    }
    if (entry.cropId != null && cropIdMap.has(entry.cropId)) {
      updates.cropId = remap(entry.cropId, cropIdMap)
    }

    if (Object.keys(updates).length > 0) {
      await db.log.update(entry.id, updates)
    }
  }
}

async function reassignCropParcelReferences(
  crops: Crop[],
  parcelIdMap: Map<string, string>,
): Promise<void> {
  if (parcelIdMap.size === 0) return
  for (const crop of crops) {
    if (crop.id == null || crop.parcelId == null) continue
    if (parcelIdMap.has(crop.parcelId)) {
      await db.crops.update(crop.id, { parcelId: remap(crop.parcelId, parcelIdMap) })
    }
  }
}

async function reassignDiagnosticReferences(
  diagnostics: Diagnostic[],
  parcelIdMap: Map<string, string>,
  cropIdMap: Map<string, string>,
): Promise<void> {
  for (const diag of diagnostics) {
    if (diag.id == null) continue
    const updates: Partial<Diagnostic> = {}
    if (diag.parcelId != null && parcelIdMap.has(diag.parcelId)) {
      updates.parcelId = remap(diag.parcelId, parcelIdMap)
    }
    if (diag.cropId != null && cropIdMap.has(diag.cropId)) {
      updates.cropId = remap(diag.cropId, cropIdMap)
    }
    if (Object.keys(updates).length > 0) {
      await db.diagnostics.update(diag.id, updates)
    }
  }
}
