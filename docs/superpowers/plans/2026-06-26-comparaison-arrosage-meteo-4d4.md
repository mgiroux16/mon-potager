# Comparaison arrosage / pluie par parcelle (4D-4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher, par parcelle, une comparaison litres versés vs litres de pluie reçus sur 7j/14j/30j sur `WaterPage`.

**Architecture:** Deux fonctions pures ajoutées à un nouveau service `wateringComparisonService.ts` : `resolveRainMm` (fallback relevés manuels → historique API) et `compareWateringToRain` (combine `WaterUsageRow[]` + pluie + surface de parcelle). `WaterPage.tsx` récupère l'historique météo (même pattern que `JournalPage`), calcule les 3 `rainMm` de fenêtre, puis affiche le tableau.

**Tech Stack:** TypeScript, Vitest, React 19, Dexie (`useLiveQuery`), Tailwind 4.

---

## File Structure

- Create: `src/services/wateringComparisonService.ts` — `resolveRainMm`, `compareWateringToRain`, types `ParcelWateringComparison`.
- Create: `src/services/wateringComparisonService.test.ts` — tests des deux fonctions.
- Modify: `src/pages/WaterPage.tsx` — fetch historique météo, calcul des fenêtres de pluie, nouvelle section tableau.

## Reference: types and functions already in the codebase

```ts
// src/services/waterUsageService.ts
export interface WaterUsageRow {
  parcelId: number
  parcelName: string
  liters7: number
  liters14: number
  liters30: number
  litersYear: number
}

// src/data/model.ts
export interface Parcel {
  id?: number
  name: string
  areaM2?: number
  exposure?: Exposure
  soil?: string
  mulch?: string
  notes?: string
  photoUrl?: string
}

export interface GardenLogEntry {
  id?: number
  type: LogEntryType // includes 'releve_pluie'
  date: ISODate // 'YYYY-MM-DD'
  rainMm?: number
  // ...other fields omitted
}

// src/services/weatherService.ts
export interface DailyWeather {
  date: string // 'YYYY-MM-DD'
  tempMaxC: number
  tempMinC: number
  rainMm: number
}
export async function fetchDailyHistory(
  latitude: number,
  longitude: number,
  pastDays: number,
): Promise<DailyWeather[] | null>

// src/services/settingsService.ts
export async function getSettings(): Promise<AppSettings> // has .latitude, .longitude
```

---

### Task 1: `resolveRainMm` — fallback relevés manuels / historique API

**Files:**
- Create: `src/services/wateringComparisonService.ts`
- Test: `src/services/wateringComparisonService.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/services/wateringComparisonService.test.ts
import { describe, it, expect } from 'vitest'
import { resolveRainMm } from './wateringComparisonService'
import type { GardenLogEntry } from '../data/model'
import type { DailyWeather } from './weatherService'

function entry(over: Partial<GardenLogEntry>): GardenLogEntry {
  return { type: 'releve_pluie', date: '2026-06-01', createdAt: Date.now(), ...over }
}

function day(date: string, rainMm: number): DailyWeather {
  return { date, tempMaxC: 20, tempMinC: 10, rainMm }
}

describe('resolveRainMm', () => {
  it('utilise les releves manuels quand au moins un existe dans la fenetre', () => {
    const entries = [
      entry({ date: '2026-06-20', rainMm: 4 }),
      entry({ date: '2026-06-19', rainMm: 2 }),
    ]
    const history = [day('2026-06-20', 100), day('2026-06-19', 100)] // jamais utilise ici
    const result = resolveRainMm(entries, history, '2026-06-21', 7)
    expect(result).toBe(6)
  })

  it('retombe sur l historique API si aucun releve manuel dans la fenetre', () => {
    const entries = [entry({ date: '2026-01-01', rainMm: 50 })] // hors fenetre
    const history = [day('2026-06-20', 3), day('2026-06-19', 1)]
    const result = resolveRainMm(entries, history, '2026-06-21', 7)
    expect(result).toBe(4)
  })

  it('renvoie 0 si aucun releve manuel et historique indisponible (hors-ligne)', () => {
    const entries: GardenLogEntry[] = []
    const result = resolveRainMm(entries, null, '2026-06-21', 7)
    expect(result).toBe(0)
  })

  it('ignore les entrees releve_pluie hors fenetre et les entrees d un autre type', () => {
    const entries = [
      entry({ date: '2026-05-01', rainMm: 9 }), // hors fenetre 7j
      entry({ type: 'arrosage', date: '2026-06-20', rainMm: 9 }), // mauvais type, ignore
    ]
    const history = [day('2026-06-20', 5)]
    const result = resolveRainMm(entries, history, '2026-06-21', 7)
    expect(result).toBe(5)
  })

  it('filtre l historique a la fenetre demandee', () => {
    const entries: GardenLogEntry[] = []
    const history = [day('2026-06-20', 3), day('2026-05-01', 100)] // hors fenetre 7j
    const result = resolveRainMm(entries, history, '2026-06-21', 7)
    expect(result).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/wateringComparisonService.test.ts`
Expected: FAIL with "Cannot find module './wateringComparisonService'" (file doesn't exist yet).

- [ ] **Step 3: Implement `resolveRainMm`**

```ts
// src/services/wateringComparisonService.ts
import type { GardenLogEntry, Parcel } from '../data/model'
import type { DailyWeather } from './weatherService'
import type { WaterUsageRow } from './waterUsageService'

function daysBetween(from: string, to: string): number {
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24))
}

export function resolveRainMm(
  entries: GardenLogEntry[],
  history: DailyWeather[] | null,
  refDate: string,
  windowDays: number,
): number {
  const manualReadings = entries.filter((e) => {
    if (e.type !== 'releve_pluie' || e.rainMm == null) return false
    const ageDays = daysBetween(e.date, refDate)
    return ageDays >= 0 && ageDays <= windowDays
  })

  if (manualReadings.length > 0) {
    return manualReadings.reduce((acc, e) => acc + (e.rainMm ?? 0), 0)
  }

  if (!history) return 0

  return history
    .filter((d) => {
      const ageDays = daysBetween(d.date, refDate)
      return ageDays >= 0 && ageDays <= windowDays
    })
    .reduce((acc, d) => acc + d.rainMm, 0)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/wateringComparisonService.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/wateringComparisonService.ts src/services/wateringComparisonService.test.ts
git commit -m "feat(eau): resolveRainMm - releves manuels ou historique API en fallback"
```

---

### Task 2: `compareWateringToRain` — combine litres versés et pluie par parcelle

**Files:**
- Modify: `src/services/wateringComparisonService.ts`
- Test: `src/services/wateringComparisonService.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/services/wateringComparisonService.test.ts`:

```ts
import { compareWateringToRain } from './wateringComparisonService'
import type { WaterUsageRow } from './waterUsageService'
import type { Parcel } from '../data/model'

function usageRow(over: Partial<WaterUsageRow>): WaterUsageRow {
  return {
    parcelId: 1,
    parcelName: 'Carrés du fond',
    liters7: 0,
    liters14: 0,
    liters30: 0,
    litersYear: 0,
    ...over,
  }
}

function parcel(over: Partial<Parcel>): Parcel {
  return { name: 'Carrés du fond', ...over }
}

describe('compareWateringToRain', () => {
  it('convertit la pluie en litres via la surface de la parcelle', () => {
    const usage = [usageRow({ parcelId: 1, liters7: 10, liters14: 20, liters30: 30 })]
    const parcels = [parcel({ id: 1, areaM2: 5 })]
    const result = compareWateringToRain(usage, parcels, 2, 4, 6)
    expect(result[0]).toMatchObject({
      parcelId: 1,
      liters7: 10,
      rainLiters7: 10, // 2mm * 5m2
      totalLiters7: 20,
      liters14: 20,
      rainLiters14: 20, // 4mm * 5m2
      totalLiters14: 40,
      liters30: 30,
      rainLiters30: 30, // 6mm * 5m2
      totalLiters30: 60,
    })
  })

  it('renvoie rainLiters null et total = litersGiven si areaM2 absent', () => {
    const usage = [usageRow({ parcelId: 1, liters7: 10 })]
    const parcels = [parcel({ id: 1, areaM2: undefined })]
    const result = compareWateringToRain(usage, parcels, 2, 4, 6)
    expect(result[0].rainLiters7).toBeNull()
    expect(result[0].totalLiters7).toBe(10)
  })

  it('combine plusieurs parcelles avec la meme pluie ponderee par surface', () => {
    const usage = [
      usageRow({ parcelId: 1, parcelName: 'Carrés du fond', liters7: 10 }),
      usageRow({ parcelId: 2, parcelName: 'Allée', liters7: 5 }),
    ]
    const parcels = [
      parcel({ id: 1, name: 'Carrés du fond', areaM2: 2 }),
      parcel({ id: 2, name: 'Allée', areaM2: 4 }),
    ]
    const result = compareWateringToRain(usage, parcels, 3, 0, 0)
    expect(result.find((r) => r.parcelId === 1)?.rainLiters7).toBe(6) // 3mm * 2m2
    expect(result.find((r) => r.parcelId === 2)?.rainLiters7).toBe(12) // 3mm * 4m2
  })

  it('ignore une ligne usage dont la parcelle n existe plus', () => {
    const usage = [usageRow({ parcelId: 99, liters7: 10 })]
    const parcels: Parcel[] = []
    const result = compareWateringToRain(usage, parcels, 2, 0, 0)
    expect(result[0].rainLiters7).toBeNull()
    expect(result[0].totalLiters7).toBe(10)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/wateringComparisonService.test.ts`
Expected: FAIL with "compareWateringToRain is not exported" / "is not a function"

- [ ] **Step 3: Implement `compareWateringToRain`**

Append to `src/services/wateringComparisonService.ts`:

```ts
export interface ParcelWateringComparison {
  parcelId: number
  parcelName: string
  liters7: number
  liters14: number
  liters30: number
  rainLiters7: number | null
  rainLiters14: number | null
  rainLiters30: number | null
  totalLiters7: number
  totalLiters14: number
  totalLiters30: number
}

export function compareWateringToRain(
  usage: WaterUsageRow[],
  parcels: Parcel[],
  rainMm7: number,
  rainMm14: number,
  rainMm30: number,
): ParcelWateringComparison[] {
  return usage.map((row) => {
    const parcel = parcels.find((p) => p.id === row.parcelId)
    const areaM2 = parcel?.areaM2

    const rainLiters7 = areaM2 != null ? rainMm7 * areaM2 : null
    const rainLiters14 = areaM2 != null ? rainMm14 * areaM2 : null
    const rainLiters30 = areaM2 != null ? rainMm30 * areaM2 : null

    return {
      parcelId: row.parcelId,
      parcelName: row.parcelName,
      liters7: row.liters7,
      liters14: row.liters14,
      liters30: row.liters30,
      rainLiters7,
      rainLiters14,
      rainLiters30,
      totalLiters7: row.liters7 + (rainLiters7 ?? 0),
      totalLiters14: row.liters14 + (rainLiters14 ?? 0),
      totalLiters30: row.liters30 + (rainLiters30 ?? 0),
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/wateringComparisonService.test.ts`
Expected: PASS (9 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/services/wateringComparisonService.ts src/services/wateringComparisonService.test.ts
git commit -m "feat(eau): compareWateringToRain - combine litres verses et pluie ponderee par surface"
```

---

### Task 3: Section comparaison sur `WaterPage`

**Files:**
- Modify: `src/pages/WaterPage.tsx`

- [ ] **Step 1: Add the weather history fetch and the comparison rows**

In `src/pages/WaterPage.tsx`, replace the top imports and component body:

```tsx
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import type { WaterTank } from '../data/model'
import { summarizeWaterUsage } from '../services/waterUsageService'
import { summarizeTankAutonomy } from '../services/tankAutonomyService'
import { resolveRainMm, compareWateringToRain } from '../services/wateringComparisonService'
import { fetchDailyHistory, type DailyWeather } from '../services/weatherService'
import { getSettings } from '../services/settingsService'
```

(keep `TankLevelInput` and `todayISO` unchanged)

Replace the `WaterPage` function body:

```tsx
export function WaterPage() {
  const entries = useLiveQuery(() => db.log.toArray(), [], [])
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const tanks = useLiveQuery(() => db.tanks.toArray(), [], [])
  const settings = useLiveQuery(() => getSettings(), [], undefined)
  const [history, setHistory] = useState<DailyWeather[] | null>(null)

  useEffect(() => {
    if (!settings) return
    let alive = true
    fetchDailyHistory(settings.latitude, settings.longitude, 30).then((h) => {
      if (alive) setHistory(h)
    })
    return () => {
      alive = false
    }
  }, [settings])

  const refDate = todayISO()
  const rows = summarizeWaterUsage(entries, parcels, refDate)
  const tankSummary = summarizeTankAutonomy(tanks, entries, refDate)

  const rainMm7 = resolveRainMm(entries, history, refDate, 7)
  const rainMm14 = resolveRainMm(entries, history, refDate, 14)
  const rainMm30 = resolveRainMm(entries, history, refDate, 30)
  const comparisonRows = compareWateringToRain(rows, parcels, rainMm7, rainMm14, rainMm30)

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-green-800">Réserve d'eau</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Pas encore d'arrosage enregistré</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.parcelId} className="rounded bg-green-50 p-3">
              <h2 className="text-lg font-semibold text-green-700">{row.parcelName}</h2>
              <p className="mt-1 text-sm text-green-900">
                7j : {row.liters7} L · 14j : {row.liters14} L · 30j : {row.liters30} L · Année :{' '}
                {row.litersYear} L
              </p>
            </li>
          ))}
        </ul>
      )}

      {comparisonRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-green-800">Arrosage vs pluie par parcelle</h2>
          <ul className="space-y-2">
            {comparisonRows.map((row) => (
              <li key={row.parcelId} className="rounded bg-blue-50 p-3">
                <h3 className="font-medium text-blue-900">{row.parcelName}</h3>
                <ul className="mt-1 space-y-1 text-sm text-blue-900">
                  <li>
                    7j : {row.liters7} L versés + {row.rainLiters7 != null ? `${Math.round(row.rainLiters7)} L pluie` : 'surface non renseignée'} = {Math.round(row.totalLiters7)} L
                  </li>
                  <li>
                    14j : {row.liters14} L versés + {row.rainLiters14 != null ? `${Math.round(row.rainLiters14)} L pluie` : 'surface non renseignée'} = {Math.round(row.totalLiters14)} L
                  </li>
                  <li>
                    30j : {row.liters30} L versés + {row.rainLiters30 != null ? `${Math.round(row.rainLiters30)} L pluie` : 'surface non renseignée'} = {Math.round(row.totalLiters30)} L
                  </li>
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded bg-green-50 p-3">
        <p className="text-sm font-medium text-green-900">
          Réserve d'eau : {tankSummary.totalEstimatedLiters} / {tankSummary.totalCapacityLiters} L
        </p>
        <p className="mt-1 text-sm text-green-900">
          Autonomie :{' '}
          {tankSummary.autonomyDays != null ? `${tankSummary.autonomyDays} jours` : 'illimitée'}
        </p>
      </section>

      {tanks.length > 0 && (
        <ul className="space-y-2">
          {tanks.map((t) => (
            <TankLevelInput key={t.id} tank={t} />
          ))}
        </ul>
      )}
    </div>
  )
}
```

This places the new "Arrosage vs pluie" section right after the existing litres-per-parcel
list (4D-1) and before the réserve/cuves section (4D-3), matching the spec's requested
placement.

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

Run: `npx vitest run`
Expected: PASS, all existing tests still green (no new test file for this task — it's a UI
wiring change covered indirectly by the service tests in Tasks 1–2).

- [ ] **Step 3: Manual check in dev server**

Run: `npm run dev`, open the app, go to "Réserve d'eau" page. Confirm:
- The "Arrosage vs pluie par parcelle" section appears between the litres list and the réserve/cuves section.
- Parcels without `areaM2` show "surface non renseignée" instead of a rain figure.
- No console errors when offline (disable network in devtools, reload): rain falls back to 0 if no manual `releve_pluie` entries exist.

- [ ] **Step 4: Commit**

```bash
git add src/pages/WaterPage.tsx
git commit -m "feat(eau): affiche la comparaison arrosage vs pluie par parcelle sur WaterPage"
```

---

## Self-Review Notes

- Spec coverage: `resolveRainMm` (fallback manuel → API → 0) ✓ Task 1; `compareWateringToRain`
  (conversion mm → L via `areaM2`, `null` si surface absente) ✓ Task 2; section UI sur
  `WaterPage` placée entre 4D-1 et 4D-3 ✓ Task 3; pas d'indicateur visuel, pas de calcul
  durée↔litres : aucun ajouté, conforme au hors-scope.
- No placeholders: all steps include full code.
- Type consistency checked: `ParcelWateringComparison`, `resolveRainMm`, `compareWateringToRain`
  signatures match across Tasks 1–3.
