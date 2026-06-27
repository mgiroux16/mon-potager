import type { Parcel } from '../data/model'

export const DEFAULT_MAP_SIZE_M = 2

export function nextFreeMapSlot(parcels: Parcel[]): { x: number; y: number } {
  const placed = parcels.filter((p) => p.mapWidth != null && p.mapHeight != null)
  if (placed.length === 0) return { x: 0, y: 0 }
  const maxBottom = Math.max(...placed.map((p) => (p.mapY ?? 0) + (p.mapHeight ?? DEFAULT_MAP_SIZE_M)))
  return { x: 0, y: maxBottom }
}
