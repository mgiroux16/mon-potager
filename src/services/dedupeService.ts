import { cloudBatchWrite, cloudGetAll, type CloudBatchOp } from '../data/firestoreWrites'
import type { Crop, Diagnostic, GardenLogEntry, Parcel } from '../data/model'

export interface DedupeSummary {
  parcelsMerged: number
  cropsMerged: number
}

export interface DedupePlan {
  parcelIdMap: Map<string, string>
  cropIdMap: Map<string, string>
  // Remaps de references (set merge) puis suppressions des doublons (delete).
  ops: CloudBatchOp[]
}

/** Retire les suffixes "(copie)" (repetes eventuellement) pour comparer les noms d'origine. */
function normalizeName(name: string): string {
  return name.replace(/(\s*\(copie\))+$/i, '').trim().toLowerCase()
}

/**
 * Regroupe les elements par cle et choisit, par groupe, celui a conserver :
 * d'abord un nom sans "(copie)" s'il existe, sinon le plus ancien (updatedAt le
 * plus bas). Retourne l'association id supprime -> id conserve.
 */
function planMerge<T extends { id?: string; name: string; updatedAt?: number }>(
  items: T[],
  keyOf: (item: T) => string,
): Map<string, string> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    if (item.id == null) continue
    const key = keyOf(item)
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

function notTombstone<T extends { deletedAt?: number }>(row: T): boolean {
  return typeof row.deletedAt !== 'number'
}

/**
 * Construit le plan de fusion (pur, aucune ecriture) :
 * - parcelles en doublon par nom (suffixes "(copie)" ignores) ;
 * - cultures en doublon par nom + parcelle (une fois les parcelles remappees) :
 *   deux "Tomates" sur deux parcelles distinctes ne sont PAS des doublons ;
 * - reattribue les references (journal, cultures, diagnostics) vers l'exemplaire
 *   conserve, puis supprime les doublons (vraie suppression, pas de tombstone).
 */
export function buildDedupePlan(
  parcels: Parcel[],
  crops: Crop[],
  log: GardenLogEntry[],
  diagnostics: Diagnostic[],
): DedupePlan {
  const liveParcels = parcels.filter(notTombstone)
  const liveCrops = crops.filter(notTombstone)

  const parcelIdMap = planMerge(liveParcels as (Parcel & { id: string })[], (p) =>
    normalizeName(p.name),
  )
  const cropIdMap = planMerge(liveCrops as (Crop & { id: string })[], (c) =>
    `${normalizeName(c.name)}|${remap(c.parcelId, parcelIdMap) ?? ''}`,
  )

  const ops: CloudBatchOp[] = []

  for (const entry of log) {
    if (entry.id == null) continue
    const updates: Record<string, unknown> = {}
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
      ops.push({ type: 'set', table: 'log', id: entry.id, data: updates })
    }
  }

  for (const crop of liveCrops) {
    if (crop.id == null || cropIdMap.has(crop.id)) continue
    if (crop.parcelId != null && parcelIdMap.has(crop.parcelId)) {
      ops.push({
        type: 'set',
        table: 'crops',
        id: crop.id,
        data: { parcelId: remap(crop.parcelId, parcelIdMap) },
      })
    }
  }

  for (const diag of diagnostics) {
    if (diag.id == null) continue
    const updates: Record<string, unknown> = {}
    if (diag.parcelId != null && parcelIdMap.has(diag.parcelId)) {
      updates.parcelId = remap(diag.parcelId, parcelIdMap)
    }
    if (diag.cropId != null && cropIdMap.has(diag.cropId)) {
      updates.cropId = remap(diag.cropId, cropIdMap)
    }
    if (Object.keys(updates).length > 0) {
      ops.push({ type: 'set', table: 'diagnostics', id: diag.id, data: updates })
    }
  }

  for (const removedId of parcelIdMap.keys()) {
    ops.push({ type: 'delete', table: 'parcels', id: removedId })
  }
  for (const removedId of cropIdMap.keys()) {
    ops.push({ type: 'delete', table: 'crops', id: removedId })
  }

  return { parcelIdMap, cropIdMap, ops }
}

/** Lit les 4 tables une fois (getDocs) et construit le plan. Aucune ecriture. */
export async function planDedupe(): Promise<DedupePlan> {
  const [parcels, crops, log, diagnostics] = await Promise.all([
    cloudGetAll('parcels'),
    cloudGetAll('crops'),
    cloudGetAll('log'),
    cloudGetAll('diagnostics'),
  ])
  return buildDedupePlan(
    parcels as unknown as Parcel[],
    crops as unknown as Crop[],
    log as unknown as GardenLogEntry[],
    diagnostics as unknown as Diagnostic[],
  )
}

/** Applique le plan en lots de 500 (attend l'ack serveur : action manuelle en ligne). */
export async function executeDedupe(plan: DedupePlan): Promise<DedupeSummary> {
  await cloudBatchWrite(plan.ops)
  return { parcelsMerged: plan.parcelIdMap.size, cropsMerged: plan.cropIdMap.size }
}
