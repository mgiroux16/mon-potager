# Rappels contextuels (4f-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher sur `/jardin` deux types de rappel : parcelles sans activité depuis 21 jours, et cultures dont la récolte est probablement possible d'après le catalogue.

**Architecture:** Un champ `daysToHarvest` optionnel ajouté à `CatalogItem` (et peuplé dans le seed). Un service pur `reminderService.ts` avec deux fonctions (`getInactiveParcels`, `getHarvestReminders`) qui prennent des tableaux déjà chargés et une date de référence, sans accès Dexie direct. `GardenPage.tsx` charge `log` et `catalog` via `useLiveQuery` (comme `parcels`/`crops`/`trees` déjà présents), calcule les deux listes de rappels, et affiche une section "Rappels" en haut de page si au moins un rappel est actif.

**Tech Stack:** React 19, TypeScript, Dexie (IndexedDB) + dexie-react-hooks (`useLiveQuery`), Vite, Tailwind 4, Vitest + React Testing Library, lucide-react.

---

## Task 1: `daysToHarvest` sur `CatalogItem` + valeurs du seed

**Files:**
- Modify: `src/data/model.ts`
- Modify: `src/data/seed.ts`
- Modify: `src/data/seed.test.ts`

- [ ] **Step 1: Write the failing test**

Ajouter ce test à `src/data/seed.test.ts`, dans le `describe('seedDatabase', ...)` :

```ts
  it('renseigne daysToHarvest pour tous les legumes du catalogue de base', async () => {
    await seedDatabase(db)
    const catalog = await db.catalog.toArray()
    for (const item of catalog) {
      expect(item.daysToHarvest).toBeTypeOf('number')
    }
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/seed.test.ts`
Expected: FAIL - `expect(item.daysToHarvest).toBeTypeOf('number')` reçoit `undefined`

- [ ] **Step 3: Ajouter le champ au modèle**

Dans `src/data/model.ts`, modifier l'interface `CatalogItem` :

```ts
export interface CatalogItem {
  id?: number
  vegetable: string
  family: VegetableFamily
  sowingMonths?: number[] // 1-12
  plantingMonths?: number[]
  harvestMonths?: number[]
  daysToHarvest?: number // jours depuis semis (si sowingMonths) ou plantation, jusqu'a recolte possible
  companions?: string[]
  antagonists?: string[]
  notes?: string
}
```

- [ ] **Step 4: Renseigner les valeurs dans le seed**

Dans `src/data/seed.ts`, remplacer le tableau `seedCatalog` actuel par (ajout de `daysToHarvest` sur
chaque ligne, aucune autre valeur modifiée) :

```ts
export const seedCatalog: CatalogItem[] = [
  { id: 1, vegetable: 'Tomate', family: 'solanacees', sowingMonths: [3, 4], plantingMonths: [5], harvestMonths: [7, 8, 9, 10], daysToHarvest: 70, companions: ['Basilic', 'Oeillet d\'Inde', 'Carotte'], antagonists: ['Pomme de terre', 'Fenouil'] },
  { id: 2, vegetable: 'Pomme de terre', family: 'solanacees', plantingMonths: [3, 4], harvestMonths: [7, 8], daysToHarvest: 100, companions: ['Haricot', 'Chou'], antagonists: ['Tomate', 'Courge'] },
  { id: 3, vegetable: 'Courgette', family: 'cucurbitacees', sowingMonths: [4, 5], plantingMonths: [5, 6], harvestMonths: [6, 7, 8, 9], daysToHarvest: 50, companions: ['Haricot', 'Mais'], antagonists: ['Pomme de terre'] },
  { id: 4, vegetable: 'Courge', family: 'cucurbitacees', sowingMonths: [4, 5], plantingMonths: [5, 6], harvestMonths: [9, 10], daysToHarvest: 100, companions: ['Mais', 'Haricot'], antagonists: ['Pomme de terre'] },
  { id: 5, vegetable: 'Patisson', family: 'cucurbitacees', sowingMonths: [4, 5], plantingMonths: [5, 6], harvestMonths: [8, 9, 10], daysToHarvest: 70, companions: ['Mais', 'Haricot'], antagonists: ['Pomme de terre'] },
  { id: 6, vegetable: 'Haricot à rames', family: 'fabacees', sowingMonths: [5, 6], harvestMonths: [7, 8, 9], daysToHarvest: 70, companions: ['Mais', 'Courgette'], antagonists: ['Ail', 'Oignon'] },
  { id: 7, vegetable: 'Oignon', family: 'alliacees', plantingMonths: [3, 4], harvestMonths: [7, 8], daysToHarvest: 120, companions: ['Carotte', 'Betterave'], antagonists: ['Haricot', 'Pois'] },
  { id: 8, vegetable: 'Ail', family: 'alliacees', plantingMonths: [10, 11], harvestMonths: [6, 7], daysToHarvest: 240, companions: ['Tomate', 'Carotte'], antagonists: ['Haricot', 'Pois'] },
  { id: 9, vegetable: 'Échalote', family: 'alliacees', plantingMonths: [2, 3], harvestMonths: [6, 7], daysToHarvest: 130, companions: ['Carotte'], antagonists: ['Haricot', 'Pois'] },
  { id: 10, vegetable: 'Patate douce', family: 'autres', plantingMonths: [5, 6], harvestMonths: [10], daysToHarvest: 120, companions: [], antagonists: [] },
]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/data/seed.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/data/model.ts src/data/seed.ts src/data/seed.test.ts
git commit -m "feat(rappels): ajoute daysToHarvest au catalogue"
```

---

## Task 2: `reminderService.ts` - inactivité parcelle et récolte possible

**Files:**
- Create: `src/services/reminderService.ts`
- Test: `src/services/reminderService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { getInactiveParcels, getHarvestReminders } from './reminderService'
import type { Parcel, GardenLogEntry, Crop, CatalogItem } from '../data/model'

function entry(over: Partial<GardenLogEntry>): GardenLogEntry {
  return { type: 'observation', date: '2026-06-01', createdAt: Date.now(), ...over }
}

describe('getInactiveParcels', () => {
  const parcels: Parcel[] = [
    { id: 1, name: 'Carré nord' },
    { id: 2, name: 'Carré sud' },
    { id: 3, name: 'Carré jamais touché' },
  ]

  it('exclut une parcelle avec une entree recente', () => {
    const log = [entry({ parcelId: 1, date: '2026-06-20' })]
    const result = getInactiveParcels(parcels, log, '2026-06-27')
    expect(result.find((r) => r.parcel.id === 1)).toBeUndefined()
  })

  it('inclut une parcelle dont la derniere entree depasse le seuil', () => {
    const log = [entry({ parcelId: 2, date: '2026-05-01' })]
    const result = getInactiveParcels(parcels, log, '2026-06-27')
    const match = result.find((r) => r.parcel.id === 2)
    expect(match?.daysSinceLastEntry).toBe(57)
  })

  it('inclut une parcelle sans aucune entree avec daysSinceLastEntry null', () => {
    const result = getInactiveParcels(parcels, [], '2026-06-27')
    const match = result.find((r) => r.parcel.id === 3)
    expect(match?.daysSinceLastEntry).toBeNull()
  })

  it('respecte un seuil personnalise', () => {
    const log = [entry({ parcelId: 1, date: '2026-06-20' })]
    const result = getInactiveParcels(parcels, log, '2026-06-27', 5)
    expect(result.find((r) => r.parcel.id === 1)).toBeDefined()
  })
})

describe('getHarvestReminders', () => {
  const catalog: CatalogItem[] = [
    { id: 1, vegetable: 'Radis', family: 'autres', sowingMonths: [3, 4], daysToHarvest: 28 },
    { id: 2, vegetable: 'Pomme de terre', family: 'solanacees', plantingMonths: [3], daysToHarvest: 100 },
    { id: 3, vegetable: 'Sans seuil', family: 'autres' },
  ]

  it('inclut une culture semee depuis plus longtemps que daysToHarvest', () => {
    const crops: Crop[] = [{ id: 10, name: 'Radis', status: 'en_place', catalogId: 1 }]
    const log = [entry({ type: 'semis', cropId: 10, date: '2026-05-01' })]
    const result = getHarvestReminders(crops, catalog, log, '2026-06-01')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ vegetable: 'Radis', referenceKind: 'semis', daysSinceReference: 31 })
  })

  it('exclut une culture semee trop recemment', () => {
    const crops: Crop[] = [{ id: 10, name: 'Radis', status: 'en_place', catalogId: 1 }]
    const log = [entry({ type: 'semis', cropId: 10, date: '2026-05-30' })]
    const result = getHarvestReminders(crops, catalog, log, '2026-06-01')
    expect(result).toHaveLength(0)
  })

  it('utilise la plantation comme reference quand le catalogue n a pas de sowingMonths', () => {
    const crops: Crop[] = [{ id: 11, name: 'Pommes de terre', status: 'en_place', catalogId: 2 }]
    const log = [entry({ type: 'plantation', cropId: 11, date: '2026-01-01' })]
    const result = getHarvestReminders(crops, catalog, log, '2026-06-01')
    expect(result).toHaveLength(1)
    expect(result[0].referenceKind).toBe('plantation')
  })

  it('exclut une culture sans catalogId ou sans daysToHarvest', () => {
    const crops: Crop[] = [
      { id: 12, name: 'Sans catalogue', status: 'en_place' },
      { id: 13, name: 'Sans seuil', status: 'en_place', catalogId: 3 },
    ]
    const log = [
      entry({ type: 'semis', cropId: 12, date: '2026-01-01' }),
      entry({ type: 'semis', cropId: 13, date: '2026-01-01' }),
    ]
    const result = getHarvestReminders(crops, catalog, log, '2026-06-01')
    expect(result).toHaveLength(0)
  })

  it('exclut une culture deja recoltee', () => {
    const crops: Crop[] = [{ id: 10, name: 'Radis', status: 'en_recolte', catalogId: 1 }]
    const log = [
      entry({ type: 'semis', cropId: 10, date: '2026-05-01' }),
      entry({ type: 'recolte', cropId: 10, date: '2026-06-01' }),
    ]
    const result = getHarvestReminders(crops, catalog, log, '2026-06-10')
    expect(result).toHaveLength(0)
  })

  it('ignore une culture sans entree semis ni plantation', () => {
    const crops: Crop[] = [{ id: 10, name: 'Radis', status: 'en_place', catalogId: 1 }]
    const result = getHarvestReminders(crops, catalog, [], '2026-06-01')
    expect(result).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/reminderService.test.ts`
Expected: FAIL with "Cannot find module './reminderService'"

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Parcel, GardenLogEntry, Crop, CatalogItem } from '../data/model'

export interface InactiveParcelReminder {
  parcel: Parcel
  daysSinceLastEntry: number | null
}

export interface HarvestReminder {
  crop: Crop
  vegetable: string
  daysSinceReference: number
  referenceKind: 'semis' | 'plantation'
}

function daysBetween(from: string, to: string): number {
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24))
}

export function getInactiveParcels(
  parcels: Parcel[],
  log: GardenLogEntry[],
  today: string,
  thresholdDays = 21,
): InactiveParcelReminder[] {
  const result: InactiveParcelReminder[] = []

  for (const parcel of parcels) {
    const entries = log.filter((e) => e.parcelId === parcel.id)
    if (entries.length === 0) {
      result.push({ parcel, daysSinceLastEntry: null })
      continue
    }

    const lastDate = entries.reduce((max, e) => (e.date > max ? e.date : max), entries[0].date)
    const days = daysBetween(lastDate, today)
    if (days >= thresholdDays) {
      result.push({ parcel, daysSinceLastEntry: days })
    }
  }

  return result
}

export function getHarvestReminders(
  crops: Crop[],
  catalog: CatalogItem[],
  log: GardenLogEntry[],
  today: string,
): HarvestReminder[] {
  const result: HarvestReminder[] = []

  for (const crop of crops) {
    if (crop.status !== 'en_place' && crop.status !== 'en_recolte') continue
    if (crop.catalogId == null) continue

    const catalogItem = catalog.find((c) => c.id === crop.catalogId)
    if (catalogItem?.daysToHarvest == null) continue

    const alreadyHarvested = log.some((e) => e.type === 'recolte' && e.cropId === crop.id)
    if (alreadyHarvested) continue

    const useSemis = (catalogItem.sowingMonths?.length ?? 0) > 0
    const referenceType = useSemis ? 'semis' : 'plantation'
    const referenceEntries = log
      .filter((e) => e.type === referenceType && e.cropId === crop.id)
      .sort((a, b) => (a.date < b.date ? -1 : 1))

    if (referenceEntries.length === 0) continue

    const referenceDate = referenceEntries[0].date
    const daysSinceReference = daysBetween(referenceDate, today)

    if (daysSinceReference >= catalogItem.daysToHarvest) {
      result.push({
        crop,
        vegetable: catalogItem.vegetable,
        daysSinceReference,
        referenceKind: referenceType,
      })
    }
  }

  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/reminderService.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/reminderService.ts src/services/reminderService.test.ts
git commit -m "feat(rappels): reminderService - inactivite parcelle et recolte possible"
```

---

## Task 3: Section "Rappels" sur `GardenPage`

**Files:**
- Modify: `src/pages/GardenPage.tsx`
- Modify: `src/pages/GardenPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Ajouter ces tests à `src/pages/GardenPage.test.tsx` (dans le `describe('GardenPage', ...)`
existant). Le seed (`src/data/seed.ts`) ne contient aucune entrée de journal : toutes les
parcelles seedées apparaîtront donc comme "jamais" dans la section Rappels.

```ts
  it('affiche une section Rappels pour les parcelles jamais touchees du jardin seede', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Rappels' })).toBeInTheDocument()
    })
    expect(screen.getAllByText('Planche tomates').length).toBeGreaterThan(0)
  })

  it('n affiche pas la section Rappels quand toutes les parcelles ont une activite recente et aucune culture n est mure', async () => {
    await db.parcels.clear()
    await db.crops.clear()
    const parcelId = await db.parcels.add({ name: 'Carré test' })
    await db.log.add({
      type: 'observation',
      date: new Date().toISOString().slice(0, 10),
      parcelId,
      createdAt: Date.now(),
    })
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('Carré test')).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { name: 'Rappels' })).not.toBeInTheDocument()
  })
```

Le test existant `'affiche les parcelles chargées'` doit aussi être ajusté car "Planche tomates"
apparaîtra maintenant deux fois (section Rappels + section Parcelles). Remplacer :

```ts
  it('affiche les parcelles chargées', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('Planche tomates')).toBeInTheDocument()
    })
  })
```

par :

```ts
  it('affiche les parcelles chargées', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getAllByText('Planche tomates').length).toBeGreaterThan(0)
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/GardenPage.test.tsx`
Expected: FAIL - `getByRole('heading', { name: 'Rappels' })` ne trouve rien

- [ ] **Step 3: Write minimal implementation**

Modifier `src/pages/GardenPage.tsx` : ajouter les imports en haut du fichier (après les imports
existants) :

```tsx
import { Bell } from 'lucide-react'
import { getInactiveParcels, getHarvestReminders } from '../services/reminderService'
```

Ajouter une fonction `todayISO` juste avant `export function GardenPage()` :

```tsx
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
```

Modifier le corps de `GardenPage` : remplacer

```tsx
export function GardenPage() {
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const trees = useLiveQuery(() => db.trees.toArray(), [], [])

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-green-800">Mon jardin</h1>

      <section>
```

par

```tsx
export function GardenPage() {
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const trees = useLiveQuery(() => db.trees.toArray(), [], [])
  const log = useLiveQuery(() => db.log.toArray(), [], [])
  const catalog = useLiveQuery(() => db.catalog.toArray(), [], [])

  const today = todayISO()
  const inactiveParcels = getInactiveParcels(parcels, log, today)
  const harvestReminders = getHarvestReminders(crops, catalog, log, today)
  const hasReminders = inactiveParcels.length > 0 || harvestReminders.length > 0

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-green-800">Mon jardin</h1>

      {hasReminders ? (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-green-700">
            <Bell size={18} /> Rappels
          </h2>
          <ul className="mt-2 space-y-1">
            {inactiveParcels.map((r) => (
              <li key={`parcel-${r.parcel.id}`} className="rounded bg-amber-50 px-3 py-2 text-sm">
                {r.parcel.name} : rien noté depuis{' '}
                {r.daysSinceLastEntry == null ? 'jamais' : `${r.daysSinceLastEntry} j`}
              </li>
            ))}
            {harvestReminders.map((r) => (
              <li key={`harvest-${r.crop.id}`} className="rounded bg-amber-50 px-3 py-2 text-sm">
                {r.vegetable} : {r.referenceKind === 'semis' ? 'semé(e)' : 'planté(e)'} il y a{' '}
                {r.daysSinceReference} j, récolte possible
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/GardenPage.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Run full test suite to verify nothing else broke**

Run: `npx vitest run`
Expected: PASS (tous les tests existants + les nouveaux)

- [ ] **Step 6: Commit**

```bash
git add src/pages/GardenPage.tsx src/pages/GardenPage.test.tsx
git commit -m "feat(rappels): section Rappels sur la page Jardin"
```

---

## Self-Review Notes (déjà appliqué ci-dessus)

- **Couverture spec** : seuil 21 jours fixe (Task 2/3), `daysToHarvest` ajouté au catalogue avec
  les 10 valeurs validées (Task 1), référence semis si `sowingMonths` sinon plantation (Task 2),
  emplacement sur `GardenPage` et pas le Dashboard (Task 3), section absente si aucun rappel actif
  (Task 3), un rappel par `Crop` indépendamment du `catalogId` partagé (Task 2, boucle sur `crops`),
  pas de rappel récolte si déjà récolté (Task 2).
- **Conflit de test identifié et traité** : le seed ne contient aucune entrée de journal, donc
  toutes les parcelles apparaissent comme "jamais" dans Rappels dès que `GardenPage` est rendu avec
  les données seedées. Le test existant `'affiche les parcelles chargées'` qui utilisait
  `getByText` unique sur `'Planche tomates'` est mis à jour en `getAllByText` (Task 3, Step 1) pour
  refléter cette duplication de texte, qui est un effet attendu de la fonctionnalité et non un bug.
- **Pas de placeholder** : chaque step contient le code complet.
- **Cohérence des types** : `InactiveParcelReminder`, `HarvestReminder`, `getInactiveParcels`,
  `getHarvestReminders` utilisés identiquement entre Task 2 et Task 3.
