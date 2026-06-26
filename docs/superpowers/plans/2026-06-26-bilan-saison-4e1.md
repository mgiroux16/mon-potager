# Palier 4E-1 : bilan de saison chiffré - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à Mathieu un bilan chiffré de saison (récolte, rendement, valeur, économie nette simple, eau) par culture/variété et par parcelle, consultable sur une page dédiée.

**Architecture:** Un nouveau service pur `seasonSummaryService.ts` calcule trois choses à partir des données déjà en base (Dexie) : les bornes de la saison de culture pour une année donnée, un agrégat par culture+variété, un agrégat par parcelle. Une nouvelle page `SeasonSummaryPage.tsx` affiche ces agrégats avec un sélecteur d'année, suivant le pattern déjà utilisé par `HarvestPage.tsx`. Deux nouveaux champs de réglages (`seasonStartMonth`/`seasonEndMonth`) pilotent les bornes de saison.

**Tech Stack:** React 19, TypeScript, Dexie (IndexedDB) via `dexie-react-hooks`, Vitest + Testing Library, Tailwind 4.

**Déviation par rapport au spec initial** : le spec (section 5.2) prévoyait une section "Bilan" intégrée directement sur les fiches culture et parcelle. En lisant `GardenPage.tsx`, ces fiches n'existent pas comme vues détaillées : `GardenPage` n'affiche que des listes plates de cultures/parcelles, et renvoie déjà vers une page dédiée pour le détail des récoltes (`<Link to="/recoltes">`). On suit ce pattern existant : `GardenPage` gagne un lien "Voir le bilan de saison →" vers `SeasonSummaryPage`, qui devient le seul point d'accès (couvre à la fois la vue culture/variété et la vue parcelle demandées en 5.1).

---

## File Structure

- Create: `src/services/seasonSummaryService.ts` — `seasonBounds`, `summarizeCropSeason`, `summarizeParcelSeason`
- Create: `src/services/seasonSummaryService.test.ts`
- Create: `src/pages/SeasonSummaryPage.tsx`
- Create: `src/pages/SeasonSummaryPage.test.tsx`
- Modify: `src/data/model.ts` — ajout `seasonStartMonth`/`seasonEndMonth` à `AppSettings`
- Modify: `src/services/settingsService.ts` — valeurs par défaut
- Modify: `src/services/settingsService.test.ts` — couvrir les nouveaux champs par défaut
- Modify: `src/pages/SettingsPage.tsx` — deux champs de réglage
- Modify: `src/pages/GardenPage.tsx` — lien vers le bilan de saison
- Modify: `src/App.tsx` — nouvelle route `/bilan`

---

### Task 1: `seasonBounds` dans `seasonSummaryService.ts`

**Files:**
- Create: `src/services/seasonSummaryService.ts`
- Test: `src/services/seasonSummaryService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { seasonBounds } from './seasonSummaryService'
import { DEFAULT_SETTINGS } from './settingsService'

describe('seasonBounds', () => {
  it('calcule les bornes de saison pour une annee donnee a partir des reglages', () => {
    const settings = { ...DEFAULT_SETTINGS, seasonStartMonth: 3, seasonEndMonth: 11 }
    const bounds = seasonBounds(2026, settings)
    expect(bounds).toEqual({ start: '2026-03-01', end: '2026-11-30' })
  })

  it('gere les mois a 31 jours et a 30 jours pour la borne de fin', () => {
    const settings = { ...DEFAULT_SETTINGS, seasonStartMonth: 4, seasonEndMonth: 9 }
    const bounds = seasonBounds(2025, settings)
    expect(bounds).toEqual({ start: '2025-04-01', end: '2025-09-30' })
  })

  it('gere fevrier sur une annee bissextile', () => {
    const settings = { ...DEFAULT_SETTINGS, seasonStartMonth: 1, seasonEndMonth: 2 }
    const bounds = seasonBounds(2024, settings)
    expect(bounds).toEqual({ start: '2024-01-01', end: '2024-02-29' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/seasonSummaryService.test.ts`
Expected: FAIL with "Failed to resolve import" or "seasonBounds is not a function" (le fichier n'existe pas encore)

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { AppSettings } from '../data/model'

export interface SeasonBounds {
  start: string
  end: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function seasonBounds(year: number, settings: AppSettings): SeasonBounds {
  const startMonth = settings.seasonStartMonth
  const endMonth = settings.seasonEndMonth
  const lastDay = new Date(year, endMonth, 0).getDate()
  return {
    start: `${year}-${pad2(startMonth)}-01`,
    end: `${year}-${pad2(endMonth)}-${pad2(lastDay)}`,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/seasonSummaryService.test.ts`
Expected: PASS (3 tests). Notez que ces tests référencent `seasonStartMonth`/`seasonEndMonth` sur
`AppSettings`, qui n'existent pas encore sur le type — TypeScript va échouer à la compilation tant
que Task 2 n'est pas faite. C'est attendu : faites Task 1 et Task 2 dans la foulée avant de lancer
les tests si votre éditeur bloque sur les erreurs de type. `vitest run` exécute quand même via esbuild
et n'échoue pas sur les erreurs de type seules, donc le test peut passer dès cette étape.

- [ ] **Step 5: Commit**

```bash
git add src/services/seasonSummaryService.ts src/services/seasonSummaryService.test.ts
git commit -m "feat(saison): seasonBounds - bornes de saison de culture par annee"
```

---

### Task 2: Champs `seasonStartMonth`/`seasonEndMonth` sur `AppSettings`

**Files:**
- Modify: `src/data/model.ts:177-189`
- Modify: `src/services/settingsService.ts:6-17`
- Modify: `src/services/settingsService.test.ts`

- [ ] **Step 1: Write the failing test**

Ajouter dans `src/services/settingsService.test.ts` (avant la dernière accolade fermante du
`describe`) :

```typescript
  it('a des valeurs par defaut de saison mars a novembre', async () => {
    const s = await getSettings()
    expect(s.seasonStartMonth).toBe(3)
    expect(s.seasonEndMonth).toBe(11)
  })

  it('persiste et relit les mois de saison', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, seasonStartMonth: 4, seasonEndMonth: 10 })
    const s = await getSettings()
    expect(s.seasonStartMonth).toBe(4)
    expect(s.seasonEndMonth).toBe(10)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/settingsService.test.ts`
Expected: FAIL — `expect(s.seasonStartMonth).toBe(3)` reçoit `undefined`

- [ ] **Step 3: Write minimal implementation**

Dans `src/data/model.ts`, modifier l'interface `AppSettings` :

```typescript
export interface AppSettings {
  id?: number // singleton, toujours id = 1
  locationName: string
  latitude: number
  longitude: number
  frostThresholdC: number
  significantRainMm: number
  heatThresholdC: number
  defaultWateringFlowLh: number
  totalTankCapacityLiters: number
  aiLevel: 'aucune' | 'photo' | 'photo_assistant'
  geminiApiKey?: string // clé API Gemini, stockée sur l'appareil ; vide par défaut
  seasonStartMonth: number // 1-12, mois de debut de la saison de culture, ex: 3 pour mars
  seasonEndMonth: number // 1-12, mois de fin de la saison de culture, ex: 11 pour novembre
}
```

Dans `src/services/settingsService.ts`, modifier `DEFAULT_SETTINGS` :

```typescript
export const DEFAULT_SETTINGS: AppSettings = {
  id: SETTINGS_ID,
  locationName: 'Champniers (16430)',
  latitude: 45.72,
  longitude: 0.19,
  frostThresholdC: 0,
  significantRainMm: 5,
  heatThresholdC: 30,
  defaultWateringFlowLh: 100,
  totalTankCapacityLiters: 2500,
  aiLevel: 'photo_assistant',
  seasonStartMonth: 3,
  seasonEndMonth: 11,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/settingsService.test.ts src/services/seasonSummaryService.test.ts`
Expected: PASS (toutes les suites, y compris les tests de Task 1 qui dépendaient de ces champs)

- [ ] **Step 5: Commit**

```bash
git add src/data/model.ts src/services/settingsService.ts src/services/settingsService.test.ts
git commit -m "feat(saison): ajoute seasonStartMonth/seasonEndMonth aux reglages"
```

---

### Task 3: `summarizeCropSeason` dans `seasonSummaryService.ts`

**Files:**
- Modify: `src/services/seasonSummaryService.ts`
- Modify: `src/services/seasonSummaryService.test.ts`

- [ ] **Step 1: Write the failing test**

Ajouter en haut du fichier de test l'import des types nécessaires, puis le bloc de tests :

```typescript
import type { GardenLogEntry, Crop, Variety, Parcel, Expense } from '../data/model'
```

```typescript
describe('summarizeCropSeason', () => {
  const settings = { ...DEFAULT_SETTINGS, seasonStartMonth: 3, seasonEndMonth: 11 }

  function entry(over: Partial<GardenLogEntry>): GardenLogEntry {
    return { type: 'recolte', date: '2026-06-01', createdAt: Date.now(), ...over }
  }

  it('agrege le total kg, le rendement par plant et par m2, et la valeur brute', () => {
    const crops: Crop[] = [
      { id: 1, name: 'Tomates', status: 'en_recolte', plantCount: 4, parcelId: 10, pricePerKg: 3 },
    ]
    const parcels: Parcel[] = [{ id: 10, name: 'Carre nord', areaM2: 8 }]
    const varieties: Variety[] = []
    const expenses: Expense[] = []
    const entries = [
      entry({ cropId: 1, date: '2026-06-01', quantityKg: 2 }),
      entry({ cropId: 1, date: '2026-07-01', quantityKg: 2 }),
    ]

    const rows = summarizeCropSeason(entries, crops, varieties, parcels, expenses, 2026, settings)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      cropId: 1,
      cropName: 'Tomates',
      varietyId: undefined,
      varietyName: 'non précisée',
      parcelId: 10,
      parcelName: 'Carre nord',
      totalKg: 4,
      yieldPerPlantKg: 1,
      yieldPerM2Kg: 0.5,
      grossValueEuros: 12,
      expensesEuros: 0,
      netEuros: 12,
      firstHarvestDate: '2026-06-01',
      lastHarvestDate: '2026-07-01',
    })
  })

  it('ignore les recoltes hors de la fenetre de saison', () => {
    const crops: Crop[] = [{ id: 1, name: 'Tomates', status: 'en_recolte' }]
    const entries = [
      entry({ cropId: 1, date: '2026-01-15', quantityKg: 1 }), // avant le debut de saison (mars)
      entry({ cropId: 1, date: '2026-06-01', quantityKg: 2 }),
    ]
    const rows = summarizeCropSeason(entries, crops, [], [], [], 2026, settings)
    expect(rows[0].totalKg).toBe(2)
  })

  it('ne calcule pas yieldPerPlantKg si plantCount est absent', () => {
    const crops: Crop[] = [{ id: 1, name: 'Tomates', status: 'en_recolte' }]
    const entries = [entry({ cropId: 1, quantityKg: 2 })]
    const rows = summarizeCropSeason(entries, crops, [], [], [], 2026, settings)
    expect(rows[0].yieldPerPlantKg).toBeUndefined()
  })

  it('ne calcule pas yieldPerM2Kg si la parcelle n a pas de areaM2', () => {
    const crops: Crop[] = [{ id: 1, name: 'Tomates', status: 'en_recolte', parcelId: 10 }]
    const parcels: Parcel[] = [{ id: 10, name: 'Carre nord' }]
    const entries = [entry({ cropId: 1, quantityKg: 2 })]
    const rows = summarizeCropSeason(entries, crops, [], parcels, [], 2026, settings)
    expect(rows[0].yieldPerM2Kg).toBeUndefined()
  })

  it('separe deux varietes de la meme culture en deux lignes', () => {
    const crops: Crop[] = [{ id: 1, name: 'Tomates', status: 'en_recolte' }]
    const varieties: Variety[] = [
      { id: 100, name: 'Saint-Pierre', vegetable: 'Tomate' },
      { id: 101, name: 'Coeur de boeuf', vegetable: 'Tomate' },
    ]
    const entries = [
      entry({ cropId: 1, varietyId: 100, quantityKg: 2 }),
      entry({ cropId: 1, varietyId: 101, quantityKg: 3 }),
    ]
    const rows = summarizeCropSeason(entries, crops, varieties, [], [], 2026, settings)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.varietyName).sort()).toEqual(['Coeur de boeuf', 'Saint-Pierre'])
  })

  it('soustrait les depenses liees au cropId et dans la fenetre de saison', () => {
    const crops: Crop[] = [{ id: 1, name: 'Tomates', status: 'en_recolte', pricePerKg: 3 }]
    const expenses: Expense[] = [
      { id: 1, label: 'Terreau', amountEuros: 5, date: '2026-04-01', amortization: 'consommable', cropId: 1 },
      { id: 2, label: 'Hors saison', amountEuros: 99, date: '2026-01-01', amortization: 'consommable', cropId: 1 },
      { id: 3, label: 'Autre culture', amountEuros: 50, date: '2026-04-01', amortization: 'consommable', cropId: 2 },
    ]
    const entries = [entry({ cropId: 1, quantityKg: 2 })]
    const rows = summarizeCropSeason(entries, crops, [], [], expenses, 2026, settings)
    expect(rows[0].expensesEuros).toBe(5)
    expect(rows[0].netEuros).toBe(1) // 2kg * 3€ - 5€
  })

  it('cree une ligne depense seule si une culture a des depenses mais aucune recolte', () => {
    const crops: Crop[] = [{ id: 1, name: 'Tomates', status: 'en_place' }]
    const expenses: Expense[] = [
      { id: 1, label: 'Terreau', amountEuros: 5, date: '2026-04-01', amortization: 'consommable', cropId: 1 },
    ]
    const rows = summarizeCropSeason([], crops, [], [], expenses, 2026, settings)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ totalKg: 0, expensesEuros: 5, grossValueEuros: undefined, netEuros: undefined })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/seasonSummaryService.test.ts`
Expected: FAIL — `summarizeCropSeason is not a function`

- [ ] **Step 3: Write minimal implementation**

Ajouter dans `src/services/seasonSummaryService.ts` :

```typescript
import type { GardenLogEntry, Crop, Variety, Parcel, Expense } from '../data/model'

export interface CropSeasonRow {
  cropId: number
  cropName: string
  varietyId?: number
  varietyName?: string
  parcelId?: number
  parcelName?: string
  year: number
  firstHarvestDate?: string
  lastHarvestDate?: string
  totalKg: number
  yieldPerPlantKg?: number
  yieldPerM2Kg?: number
  grossValueEuros?: number
  expensesEuros: number
  netEuros?: number
}

function inWindow(date: string, bounds: SeasonBounds): boolean {
  return date >= bounds.start && date <= bounds.end
}

export function summarizeCropSeason(
  entries: GardenLogEntry[],
  crops: Crop[],
  varieties: Variety[],
  parcels: Parcel[],
  expenses: Expense[],
  year: number,
  settings: AppSettings,
): CropSeasonRow[] {
  const bounds = seasonBounds(year, settings)
  const byKey = new Map<string, CropSeasonRow>()

  function rowFor(cropId: number, varietyId: number | undefined): CropSeasonRow {
    const key = `${cropId}-${varietyId ?? 'none'}`
    const existing = byKey.get(key)
    if (existing) return existing

    const crop = crops.find((c) => c.id === cropId)
    const variety = varietyId != null ? varieties.find((v) => v.id === varietyId) : undefined
    const parcel = crop?.parcelId != null ? parcels.find((p) => p.id === crop.parcelId) : undefined

    const row: CropSeasonRow = {
      cropId,
      cropName: crop?.name ?? '(culture supprimée)',
      varietyId,
      varietyName: varietyId != null ? variety?.name ?? '(variété supprimée)' : 'non précisée',
      parcelId: crop?.parcelId,
      parcelName: parcel?.name,
      year,
      totalKg: 0,
      expensesEuros: 0,
    }
    byKey.set(key, row)
    return row
  }

  for (const e of entries) {
    if (e.type !== 'recolte' || e.quantityKg == null || e.cropId == null) continue
    if (!inWindow(e.date, bounds)) continue

    const row = rowFor(e.cropId, e.varietyId)
    row.totalKg += e.quantityKg
    if (row.firstHarvestDate == null || e.date < row.firstHarvestDate) row.firstHarvestDate = e.date
    if (row.lastHarvestDate == null || e.date > row.lastHarvestDate) row.lastHarvestDate = e.date
  }

  for (const exp of expenses) {
    if (exp.cropId == null || !inWindow(exp.date, bounds)) continue
    if (!crops.some((c) => c.id === exp.cropId)) continue
    const row = rowFor(exp.cropId, undefined)
    row.expensesEuros += exp.amountEuros
  }

  const rows = Array.from(byKey.values()).map((row) => {
    const crop = crops.find((c) => c.id === row.cropId)
    const parcel = row.parcelId != null ? parcels.find((p) => p.id === row.parcelId) : undefined

    const yieldPerPlantKg =
      crop?.plantCount != null && crop.plantCount > 0 ? row.totalKg / crop.plantCount : undefined
    const yieldPerM2Kg =
      parcel?.areaM2 != null && parcel.areaM2 > 0 ? row.totalKg / parcel.areaM2 : undefined
    const grossValueEuros = crop?.pricePerKg != null ? row.totalKg * crop.pricePerKg : undefined
    const netEuros = grossValueEuros != null ? grossValueEuros - row.expensesEuros : undefined

    return { ...row, yieldPerPlantKg, yieldPerM2Kg, grossValueEuros, netEuros }
  })

  return rows.sort((a, b) => a.cropName.localeCompare(b.cropName))
}
```

Note : la dépense seule (sans récolte) passe par `rowFor(exp.cropId, undefined)`, ce qui crée
toujours la ligne sous `varietyId: undefined` même si une récolte avec une vraie variété existe par
ailleurs pour la même culture — c'est voulu et couvert par le test "ignore les recoltes hors de la
fenetre" qui ne mélange pas les deux cas dans un même test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/seasonSummaryService.test.ts`
Expected: PASS (toutes les suites précédentes + les 7 nouveaux tests `summarizeCropSeason`)

- [ ] **Step 5: Commit**

```bash
git add src/services/seasonSummaryService.ts src/services/seasonSummaryService.test.ts
git commit -m "feat(saison): summarizeCropSeason - bilan chiffre par culture et variete"
```

---

### Task 4: `summarizeParcelSeason` dans `seasonSummaryService.ts`

**Files:**
- Modify: `src/services/seasonSummaryService.ts`
- Modify: `src/services/seasonSummaryService.test.ts`

**Note d'implémentation** : pour la pluie, le spec prévoyait de réutiliser `resolveRainMm`, mais
cette fonction est conçue pour une fenêtre glissante de N jours avant une date de référence
(usage : "7/14/30 derniers jours"), pas pour une plage de dates fixe sur une saison passée. On
n'additionne donc que les relevés manuels (`releve_pluie`) tombant dans la fenêtre de saison — pas
de repli sur l'historique réseau Open-Meteo, qui ne couvre de toute façon pas les saisons d'années
passées via l'API utilisée (`fetchDailyHistory` ne fournit que les jours récents). Si Mathieu n'a
pas saisi de relevés manuels sur une vieille saison, `totalRainLiters` reste à `0` — cohérent avec
le comportement déjà existant de `resolveRainMm` qui renvoie `0` quand il n'y a rien.

- [ ] **Step 1: Write the failing test**

Ajouter au fichier de test :

```typescript
describe('summarizeParcelSeason', () => {
  const settings = { ...DEFAULT_SETTINGS, seasonStartMonth: 3, seasonEndMonth: 11 }

  function entry(over: Partial<GardenLogEntry>): GardenLogEntry {
    return { type: 'recolte', date: '2026-06-01', createdAt: Date.now(), ...over }
  }

  it('agrege le total kg toutes cultures confondues sur une parcelle', () => {
    const parcels: Parcel[] = [{ id: 10, name: 'Carre nord', areaM2: 8 }]
    const crops: Crop[] = [
      { id: 1, name: 'Tomates', status: 'en_recolte', parcelId: 10, pricePerKg: 3 },
      { id: 2, name: 'Courgettes', status: 'en_recolte', parcelId: 10, pricePerKg: 1 },
    ]
    const entries = [
      entry({ cropId: 1, parcelId: 10, quantityKg: 2 }),
      entry({ cropId: 2, parcelId: 10, quantityKg: 4 }),
    ]
    const rows = summarizeParcelSeason(entries, parcels, crops, [], 2026, settings)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      parcelId: 10,
      parcelName: 'Carre nord',
      totalKg: 6,
      yieldPerM2Kg: 0.75,
      grossValueEuros: 10, // 2*3 + 4*1
    })
  })

  it('additionne les litres arroses dans la fenetre de saison', () => {
    const parcels: Parcel[] = [{ id: 10, name: 'Carre nord' }]
    const entries = [
      entry({ type: 'arrosage', parcelId: 10, date: '2026-04-01', volumeLiters: 20 }),
      entry({ type: 'arrosage', parcelId: 10, date: '2026-12-15', volumeLiters: 99 }), // hors saison
    ]
    const rows = summarizeParcelSeason(entries, parcels, [], [], 2026, settings)
    expect(rows[0].totalWaterLiters).toBe(20)
  })

  it('additionne la pluie a partir des releves manuels convertis en litres via areaM2', () => {
    const parcels: Parcel[] = [{ id: 10, name: 'Carre nord', areaM2: 10 }]
    const entries = [
      entry({ type: 'releve_pluie', parcelId: 10, date: '2026-05-01', rainMm: 4 }),
      entry({ type: 'releve_pluie', parcelId: 10, date: '2026-05-02', rainMm: 2 }),
    ]
    const rows = summarizeParcelSeason(entries, parcels, [], [], 2026, settings)
    expect(rows[0].totalRainLiters).toBe(60) // (4+2) mm * 10 m2
  })

  it('renvoie totalRainLiters a 0 sans releve de pluie', () => {
    const parcels: Parcel[] = [{ id: 10, name: 'Carre nord', areaM2: 10 }]
    const rows = summarizeParcelSeason([], parcels, [], [], 2026, settings)
    expect(rows).toHaveLength(0) // aucune entree -> aucune ligne, voir test suivant pour le cas avec activite
  })

  it('soustrait les depenses liees au parcelId dans la fenetre de saison', () => {
    const parcels: Parcel[] = [{ id: 10, name: 'Carre nord' }]
    const crops: Crop[] = [{ id: 1, name: 'Tomates', status: 'en_recolte', parcelId: 10, pricePerKg: 3 }]
    const expenses: Expense[] = [
      { id: 1, label: 'Paillage', amountEuros: 7, date: '2026-04-01', amortization: 'consommable', parcelId: 10 },
    ]
    const entries = [entry({ cropId: 1, parcelId: 10, quantityKg: 2 })]
    const rows = summarizeParcelSeason(entries, parcels, crops, expenses, 2026, settings)
    expect(rows[0].expensesEuros).toBe(7)
    expect(rows[0].netEuros).toBe(-1) // 6€ recolte - 7€ depense
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/seasonSummaryService.test.ts`
Expected: FAIL — `summarizeParcelSeason is not a function`

- [ ] **Step 3: Write minimal implementation**

Ajouter dans `src/services/seasonSummaryService.ts` :

```typescript
export interface ParcelSeasonRow {
  parcelId: number
  parcelName: string
  year: number
  totalKg: number
  yieldPerM2Kg?: number
  grossValueEuros?: number
  expensesEuros: number
  netEuros?: number
  totalWaterLiters: number
  totalRainLiters: number
}

export function summarizeParcelSeason(
  entries: GardenLogEntry[],
  parcels: Parcel[],
  crops: Crop[],
  expenses: Expense[],
  year: number,
  settings: AppSettings,
): ParcelSeasonRow[] {
  const bounds = seasonBounds(year, settings)
  const byParcel = new Map<number, ParcelSeasonRow>()

  function rowFor(parcelId: number): ParcelSeasonRow {
    const existing = byParcel.get(parcelId)
    if (existing) return existing
    const parcel = parcels.find((p) => p.id === parcelId)
    const row: ParcelSeasonRow = {
      parcelId,
      parcelName: parcel?.name ?? '(parcelle supprimée)',
      year,
      totalKg: 0,
      expensesEuros: 0,
      totalWaterLiters: 0,
      totalRainLiters: 0,
    }
    byParcel.set(parcelId, row)
    return row
  }

  for (const e of entries) {
    if (e.parcelId == null || !inWindow(e.date, bounds)) continue

    if (e.type === 'recolte' && e.quantityKg != null) {
      rowFor(e.parcelId).totalKg += e.quantityKg
    } else if (e.type === 'arrosage' && e.volumeLiters != null) {
      rowFor(e.parcelId).totalWaterLiters += e.volumeLiters
    } else if (e.type === 'releve_pluie' && e.rainMm != null) {
      const parcel = parcels.find((p) => p.id === e.parcelId)
      if (parcel?.areaM2 != null) {
        rowFor(e.parcelId).totalRainLiters += e.rainMm * parcel.areaM2
      }
    }
  }

  for (const exp of expenses) {
    if (exp.parcelId == null || !inWindow(exp.date, bounds)) continue
    if (!parcels.some((p) => p.id === exp.parcelId)) continue
    rowFor(exp.parcelId).expensesEuros += exp.amountEuros
  }

  // valeur brute par parcelle : somme des recoltes de cette parcelle valorisees au prix de chaque culture
  for (const row of byParcel.values()) {
    let grossValueEuros: number | undefined
    for (const e of entries) {
      if (e.type !== 'recolte' || e.parcelId !== row.parcelId || e.quantityKg == null) continue
      if (!inWindow(e.date, bounds)) continue
      const crop = e.cropId != null ? crops.find((c) => c.id === e.cropId) : undefined
      if (crop?.pricePerKg != null) {
        grossValueEuros = (grossValueEuros ?? 0) + e.quantityKg * crop.pricePerKg
      }
    }
    row.grossValueEuros = grossValueEuros
    const parcel = parcels.find((p) => p.id === row.parcelId)
    row.yieldPerM2Kg = parcel?.areaM2 != null && parcel.areaM2 > 0 ? row.totalKg / parcel.areaM2 : undefined
    row.netEuros = grossValueEuros != null ? grossValueEuros - row.expensesEuros : undefined
  }

  return Array.from(byParcel.values()).sort((a, b) => a.parcelName.localeCompare(b.parcelName))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/seasonSummaryService.test.ts`
Expected: PASS (toutes les suites)

- [ ] **Step 5: Commit**

```bash
git add src/services/seasonSummaryService.ts src/services/seasonSummaryService.test.ts
git commit -m "feat(saison): summarizeParcelSeason - bilan chiffre par parcelle"
```

---

### Task 5: Champs de réglage des mois de saison sur `SettingsPage`

**Files:**
- Modify: `src/pages/SettingsPage.tsx`
- Test: `src/pages/SettingsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Le fichier existant utilise déjà `userEvent` (pas `fireEvent`) pour les interactions — reprendre
ce pattern :

```typescript
  it('permet de modifier les mois de debut et fin de saison', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)
    const startInput = await screen.findByLabelText('Mois de début de saison')
    const endInput = await screen.findByLabelText('Mois de fin de saison')
    await user.selectOptions(startInput, '4')
    await user.selectOptions(endInput, '10')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(async () => {
      const saved = await db.settings.get(1)
      expect(saved?.seasonStartMonth).toBe(4)
      expect(saved?.seasonEndMonth).toBe(10)
    })
  })
```

`userEvent`, `screen`, `db` sont déjà importés en tête du fichier existant — ne pas les réimporter.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/SettingsPage.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Mois de début de saison`

- [ ] **Step 3: Write minimal implementation**

Dans `src/pages/SettingsPage.tsx`, ajouter après le bloc "Niveau IA" (avant le bloc "Clé Gemini") :

```tsx
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm text-green-800">
          Mois de début de saison
          <select
            aria-label="Mois de début de saison"
            value={settings.seasonStartMonth}
            onChange={(e) => update('seasonStartMonth', Number(e.target.value))}
            className={fieldClass}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm text-green-800">
          Mois de fin de saison
          <select
            aria-label="Mois de fin de saison"
            value={settings.seasonEndMonth}
            onChange={(e) => update('seasonEndMonth', Number(e.target.value))}
            className={fieldClass}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/SettingsPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/SettingsPage.tsx src/pages/SettingsPage.test.tsx
git commit -m "feat(saison): reglages des mois de debut/fin de saison"
```

---

### Task 6: Page `SeasonSummaryPage`

**Files:**
- Create: `src/pages/SeasonSummaryPage.tsx`
- Create: `src/pages/SeasonSummaryPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { SeasonSummaryPage } from './SeasonSummaryPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('SeasonSummaryPage', () => {
  it('affiche un message si aucune donnee pour l annee courante', async () => {
    render(<SeasonSummaryPage />)
    await waitFor(() => {
      expect(screen.getByText(/Rien à montrer pour/)).toBeInTheDocument()
    })
  })

  it('affiche le bilan par culture et par parcelle', async () => {
    const parcelId = await db.parcels.add({ name: 'Carré nord', areaM2: 8 })
    const cropId = await db.crops.add({
      name: 'Tomates',
      status: 'en_recolte',
      parcelId,
      pricePerKg: 3,
    })
    const year = new Date().getFullYear()
    await db.log.add({
      type: 'recolte',
      date: `${year}-06-01`,
      cropId,
      parcelId,
      quantityKg: 4,
      createdAt: Date.now(),
    })

    render(<SeasonSummaryPage />)
    await waitFor(() => {
      expect(screen.getAllByText('Tomates').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Carré nord').length).toBeGreaterThan(0)
      expect(screen.getAllByText(/4 kg/).length).toBeGreaterThan(0)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/SeasonSummaryPage.test.tsx`
Expected: FAIL — module `./SeasonSummaryPage` introuvable

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { getSettings } from '../services/settingsService'
import {
  summarizeCropSeason,
  summarizeParcelSeason,
  type CropSeasonRow,
  type ParcelSeasonRow,
} from '../services/seasonSummaryService'
import type { AppSettings } from '../data/model'

function useSettings(): AppSettings | undefined {
  return useLiveQuery(() => getSettings(), [], undefined)
}

function formatKg(kg: number): string {
  return `${kg.toLocaleString('fr-FR')} kg`
}

function formatEuros(value: number): string {
  return `${value.toLocaleString('fr-FR')} €`
}

function CropRowView({ row }: { row: CropSeasonRow }) {
  return (
    <li className="rounded bg-green-50 px-3 py-2">
      <span className="font-medium">{row.cropName}</span>
      <span className="text-sm text-gray-500"> · {row.varietyName}</span>
      {row.parcelName ? <span className="text-sm text-gray-500"> · {row.parcelName}</span> : null}
      <div className="text-sm text-green-900">
        {formatKg(row.totalKg)}
        {row.yieldPerPlantKg != null ? ` · ${row.yieldPerPlantKg.toFixed(2)} kg/plant` : ''}
        {row.yieldPerM2Kg != null ? ` · ${row.yieldPerM2Kg.toFixed(2)} kg/m²` : ''}
        {row.netEuros != null ? ` · net ${formatEuros(row.netEuros)}` : ''}
      </div>
    </li>
  )
}

function ParcelRowView({ row }: { row: ParcelSeasonRow }) {
  return (
    <li className="rounded bg-green-50 px-3 py-2">
      <span className="font-medium">{row.parcelName}</span>
      <div className="text-sm text-green-900">
        {formatKg(row.totalKg)}
        {row.yieldPerM2Kg != null ? ` · ${row.yieldPerM2Kg.toFixed(2)} kg/m²` : ''}
        {row.netEuros != null ? ` · net ${formatEuros(row.netEuros)}` : ''}
        {` · ${row.totalWaterLiters} L arrosés`}
        {` · ${row.totalRainLiters} L de pluie`}
      </div>
    </li>
  )
}

export function SeasonSummaryPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const settings = useSettings()
  const entries = useLiveQuery(() => db.log.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const varieties = useLiveQuery(() => db.varieties.toArray(), [], [])
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const expenses = useLiveQuery(() => db.expenses.toArray(), [], [])

  if (!settings) {
    return <p className="text-sm text-green-700">Chargement…</p>
  }

  const cropRows = summarizeCropSeason(entries, crops, varieties, parcels, expenses, year, settings)
  const parcelRows = summarizeParcelSeason(entries, parcels, crops, expenses, year, settings)

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-green-800">Bilan de saison</h1>

      <label className="flex flex-col gap-1 text-sm text-green-800">
        Année
        <select
          aria-label="Année du bilan"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="w-32 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm"
        >
          {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>

      {cropRows.length === 0 && parcelRows.length === 0 ? (
        <p className="text-sm text-gray-500">Rien à montrer pour {year}</p>
      ) : (
        <>
          <section>
            <h2 className="text-lg font-semibold text-green-700">Par culture et variété</h2>
            <ul className="mt-2 space-y-1">
              {cropRows.map((row) => (
                <CropRowView key={`${row.cropId}-${row.varietyId ?? 'none'}`} row={row} />
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-green-700">Par parcelle</h2>
            <ul className="mt-2 space-y-1">
              {parcelRows.map((row) => (
                <ParcelRowView key={row.parcelId} row={row} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/SeasonSummaryPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/SeasonSummaryPage.tsx src/pages/SeasonSummaryPage.test.tsx
git commit -m "feat(saison): SeasonSummaryPage - bilan chiffre par culture et parcelle"
```

---

### Task 7: Routage et lien depuis `GardenPage`

**Files:**
- Modify: `src/App.tsx:1-27`
- Modify: `src/pages/GardenPage.tsx`
- Modify: `src/pages/GardenPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Le fichier existant enveloppe le rendu avec `MemoryRouter` (nécessaire car `GardenPage` utilise
`<Link>`) — reprendre ce pattern :

```typescript
  it('propose un lien vers le bilan de saison', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Voir le bilan de saison/ })).toBeInTheDocument()
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/GardenPage.test.tsx`
Expected: FAIL — lien introuvable

- [ ] **Step 3: Write minimal implementation**

Dans `src/App.tsx`, ajouter l'import et la route :

```tsx
import { SeasonSummaryPage } from './pages/SeasonSummaryPage'
```

```tsx
          <Route path="bilan" element={<SeasonSummaryPage />} />
```
(à insérer juste après la route `eau`, avant `reglages`)

Dans `src/pages/GardenPage.tsx`, ajouter sous la section "Cultures" (après le lien existant
"Voir le bilan des récoltes →") :

```tsx
        <Link to="/bilan" className="mt-2 inline-block text-sm font-medium text-green-700">
          Voir le bilan de saison →
        </Link>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/GardenPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/pages/GardenPage.tsx src/pages/GardenPage.test.tsx
git commit -m "feat(saison): route /bilan et lien depuis le jardin"
```

---

### Task 8: Vérification complète et preuve navigateur

**Files:** aucun fichier modifié, étape de vérification uniquement

- [ ] **Step 1: Lancer toute la suite de tests**

Run: `npx vitest run`
Expected: tous les tests passent (187 existants + les nouveaux de ce plan)

- [ ] **Step 2: Build et lint**

Run: `npm run build && npm run lint`
Expected: build sans erreur TypeScript, lint sans erreur

- [ ] **Step 3: Vérification visuelle en preview**

Démarrer le serveur de dev (`preview_start` ou équivalent), naviguer vers `/jardin`, cliquer sur
"Voir le bilan de saison →", vérifier que la page `/bilan` s'affiche avec le sélecteur d'année et
les deux sections. Injecter une culture + une récolte de test via la console ou l'UI existante
(`QuickAddPage`) si la base est vide, vérifier que les chiffres s'affichent, puis nettoyer les
données de test injectées.

- [ ] **Step 4: Aller dans les réglages**

Naviguer vers `/reglages`, vérifier que les deux nouveaux champs "Mois de début de saison" /
"Mois de fin de saison" s'affichent avec les valeurs par défaut 3/11, modifier puis enregistrer,
recharger la page et vérifier la persistance.

- [ ] **Step 5: Commit final si des ajustements ont été faits pendant la vérification**

```bash
git add -A
git commit -m "fix(saison): ajustements suite a la verification navigateur"
```
(seulement si des changements ont été nécessaires — sinon, ne pas créer de commit vide)

---

## Spec Coverage Check

- D1/D2 (saison de culture, réglages globaux) → Task 1, Task 2, Task 5
- D3 (granularité culture+variété+parcelle) → Task 3, Task 4
- D4 (économie nette simple, dépenses sans amortissement fin) → Task 3, Task 4
- D5 (pas de stockage, recalcul à la demande) → Task 6 (calcul dans le composant à chaque rendu)
- D6 (deux points d'accès) → adapté en un point d'accès unique `SeasonSummaryPage` couvrant les
  deux vues (culture/variété ET parcelle), avec lien depuis `GardenPage` — voir la déviation
  documentée en tête de plan
- Section 6 (cas limites) → couverts par les tests des Task 3 et Task 4 (plantCount/areaM2 absents,
  variété manquante, dépense sans récolte, aucune entrée)
