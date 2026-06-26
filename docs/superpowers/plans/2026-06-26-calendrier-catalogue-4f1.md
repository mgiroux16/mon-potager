# Calendrier mensuel du catalogue (4f-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une page `/calendrier` qui affiche, pour un mois choisi, ce qu'il faut semer/planter/récolter d'après le catalogue (`CatalogItem`), avec navigation mois par mois.

**Architecture:** Un service pur `calendarService.ts` filtre un tableau de `CatalogItem` par mois et renvoie trois listes (à semer, à planter, à récolter), triées alphabétiquement. Une page `CalendarPage.tsx` charge le catalogue via Dexie, garde le mois sélectionné en state local, et affiche les trois sections avec des boutons précédent/suivant. Lien d'accès ajouté sur `GardenPage`, route ajoutée dans `App.tsx`.

**Tech Stack:** React 19, TypeScript, Dexie (IndexedDB), Vite, Tailwind 4, Vitest + React Testing Library, lucide-react pour les icônes.

---

## Task 1: `calendarService.ts` - filtrage par mois

**Files:**
- Create: `src/services/calendarService.ts`
- Test: `src/services/calendarService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { getMonthPlan } from './calendarService'
import type { CatalogItem } from '../data/model'

function item(over: Partial<CatalogItem>): CatalogItem {
  return { vegetable: 'Test', family: 'autres', ...over }
}

describe('getMonthPlan', () => {
  it('filtre les legumes a semer, planter, recolter pour un mois donne', () => {
    const catalog: CatalogItem[] = [
      item({ vegetable: 'Tomate', sowingMonths: [3, 4], plantingMonths: [5], harvestMonths: [7, 8] }),
      item({ vegetable: 'Pomme de terre', plantingMonths: [3, 4], harvestMonths: [7, 8] }),
      item({ vegetable: 'Ail', plantingMonths: [10, 11], harvestMonths: [6, 7] }),
    ]

    const plan = getMonthPlan(catalog, 7)

    expect(plan.toSow.map((c) => c.vegetable)).toEqual([])
    expect(plan.toPlant.map((c) => c.vegetable)).toEqual([])
    expect(plan.toHarvest.map((c) => c.vegetable)).toEqual(['Ail', 'Pomme de terre', 'Tomate'])
  })

  it('trie chaque section par ordre alphabetique francais', () => {
    const catalog: CatalogItem[] = [
      item({ vegetable: 'Échalote', plantingMonths: [3] }),
      item({ vegetable: 'Ail', plantingMonths: [3] }),
      item({ vegetable: 'Betterave', plantingMonths: [3] }),
    ]

    const plan = getMonthPlan(catalog, 3)

    expect(plan.toPlant.map((c) => c.vegetable)).toEqual(['Ail', 'Betterave', 'Échalote'])
  })

  it('place un legume dans plusieurs sections si plusieurs mois correspondent au meme mois', () => {
    const catalog: CatalogItem[] = [
      item({ vegetable: 'Radis', sowingMonths: [3, 4, 8], harvestMonths: [4, 5, 9] }),
    ]

    const plan = getMonthPlan(catalog, 4)

    expect(plan.toSow.map((c) => c.vegetable)).toEqual(['Radis'])
    expect(plan.toHarvest.map((c) => c.vegetable)).toEqual(['Radis'])
  })

  it('renvoie des listes vides si aucun legume ne correspond au mois', () => {
    const catalog: CatalogItem[] = [item({ vegetable: 'Tomate', sowingMonths: [3, 4] })]

    const plan = getMonthPlan(catalog, 12)

    expect(plan).toEqual({ toSow: [], toPlant: [], toHarvest: [] })
  })

  it('ignore les legumes sans le tableau de mois correspondant', () => {
    const catalog: CatalogItem[] = [item({ vegetable: 'Patate douce' })]

    const plan = getMonthPlan(catalog, 5)

    expect(plan).toEqual({ toSow: [], toPlant: [], toHarvest: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/calendarService.test.ts`
Expected: FAIL with "Cannot find module './calendarService'" (or similar resolution error)

- [ ] **Step 3: Write minimal implementation**

```ts
import type { CatalogItem } from '../data/model'

export interface MonthPlan {
  toSow: CatalogItem[]
  toPlant: CatalogItem[]
  toHarvest: CatalogItem[]
}

function byVegetable(a: CatalogItem, b: CatalogItem): number {
  return a.vegetable.localeCompare(b.vegetable, 'fr')
}

function filterByMonth(
  catalog: CatalogItem[],
  month: number,
  field: 'sowingMonths' | 'plantingMonths' | 'harvestMonths',
): CatalogItem[] {
  return catalog.filter((item) => item[field]?.includes(month)).sort(byVegetable)
}

export function getMonthPlan(catalog: CatalogItem[], month: number): MonthPlan {
  return {
    toSow: filterByMonth(catalog, month, 'sowingMonths'),
    toPlant: filterByMonth(catalog, month, 'plantingMonths'),
    toHarvest: filterByMonth(catalog, month, 'harvestMonths'),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/calendarService.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/calendarService.ts src/services/calendarService.test.ts
git commit -m "feat(calendrier): calendarService - filtrage du catalogue par mois"
```

---

## Task 2: `CalendarPage.tsx` - page et navigation mois par mois

**Files:**
- Create: `src/pages/CalendarPage.tsx`
- Test: `src/pages/CalendarPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '../data/db'
import { CalendarPage } from './CalendarPage'

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('CalendarPage', () => {
  it('affiche le mois courant au montage', async () => {
    render(<CalendarPage />)
    const moisCourant = MOIS_FR[new Date().getMonth()]
    await waitFor(() => {
      expect(screen.getByText(moisCourant)).toBeInTheDocument()
    })
  })

  it('affiche un message quand une section est vide', async () => {
    render(<CalendarPage />)
    await waitFor(() => {
      expect(screen.getAllByText(/Rien à .* ce mois-ci/).length).toBeGreaterThan(0)
    })
  })

  it('affiche les legumes du catalogue dans la bonne section', async () => {
    await db.catalog.add({
      vegetable: 'Tomate',
      family: 'solanacees',
      sowingMonths: [3, 4],
      plantingMonths: [5],
      harvestMonths: [7, 8, 9, 10],
    })

    render(<CalendarPage />)
    fireEvent.click(screen.getByLabelText('Mois suivant'))
    fireEvent.click(screen.getByLabelText('Mois suivant'))

    await waitFor(() => {
      expect(screen.getByText('Tomate')).toBeInTheDocument()
    })
  })

  it('navigue au mois precedent et suivant, avec un cycle sur l annee', async () => {
    render(<CalendarPage />)
    const moisCourantIndex = new Date().getMonth()

    fireEvent.click(screen.getByLabelText('Mois suivant'))
    await waitFor(() => {
      const moisSuivant = MOIS_FR[(moisCourantIndex + 1) % 12]
      expect(screen.getByText(moisSuivant)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Mois precedent'))
    fireEvent.click(screen.getByLabelText('Mois precedent'))
    await waitFor(() => {
      const moisPrecedent = MOIS_FR[(moisCourantIndex - 1 + 12) % 12]
      expect(screen.getByText(moisPrecedent)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/CalendarPage.test.tsx`
Expected: FAIL with "Cannot find module './CalendarPage'" (or similar resolution error)

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { db } from '../data/db'
import type { CatalogItem } from '../data/model'
import { getMonthPlan, type MonthPlan } from '../services/calendarService'

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

function cycleMonth(month: number, delta: number): number {
  return ((month - 1 + delta + 12) % 12) + 1
}

interface SectionProps {
  title: string
  items: CatalogItem[]
  emptyVerb: string
}

function Section({ title, items, emptyVerb }: SectionProps) {
  return (
    <section className="mt-4">
      <h2 className="text-lg font-semibold text-green-700">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-green-700/60">Rien à {emptyVerb} ce mois-ci.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={item.id} className="rounded bg-green-50 px-3 py-2">
              {item.vegetable}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function CalendarPage() {
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])

  useEffect(() => {
    db.catalog.toArray().then(setCatalog)
  }, [])

  const plan: MonthPlan = getMonthPlan(catalog, month)

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Mois precedent"
          onClick={() => setMonth((m) => cycleMonth(m, -1))}
          className="rounded-lg p-2 text-green-700 hover:bg-green-100"
        >
          <ChevronLeft />
        </button>
        <h1 className="text-xl font-bold text-green-900">{MOIS_FR[month - 1]}</h1>
        <button
          type="button"
          aria-label="Mois suivant"
          onClick={() => setMonth((m) => cycleMonth(m, 1))}
          className="rounded-lg p-2 text-green-700 hover:bg-green-100"
        >
          <ChevronRight />
        </button>
      </div>

      <Section title="À semer" items={plan.toSow} emptyVerb="semer" />
      <Section title="À planter" items={plan.toPlant} emptyVerb="planter" />
      <Section title="À récolter" items={plan.toHarvest} emptyVerb="récolter" />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/CalendarPage.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/CalendarPage.tsx src/pages/CalendarPage.test.tsx
git commit -m "feat(calendrier): CalendarPage - calendrier mensuel avec navigation"
```

---

## Task 3: Route et lien de navigation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/GardenPage.tsx:90-92`

- [ ] **Step 1: Ajouter la route dans `App.tsx`**

Modifier les imports en ajoutant après la ligne `import { SeasonSummaryPage } from './pages/SeasonSummaryPage'` :

```tsx
import { CalendarPage } from './pages/CalendarPage'
```

Ajouter la route après `<Route path="bilan" element={<SeasonSummaryPage />} />` :

```tsx
          <Route path="calendrier" element={<CalendarPage />} />
```

- [ ] **Step 2: Ajouter le lien sur `GardenPage.tsx`**

Après le bloc existant (`src/pages/GardenPage.tsx:90-92`) :

```tsx
        <Link to="/bilan" className="mt-2 inline-block text-sm font-medium text-green-700">
          Voir le bilan de saison →
        </Link>
        <Link to="/calendrier" className="mt-2 block text-sm font-medium text-green-700">
          Voir le calendrier du mois →
        </Link>
```

- [ ] **Step 3: Vérifier manuellement la navigation**

Run: `npm run dev`
Ouvrir l'app, aller sur `/jardin`, cliquer sur "Voir le calendrier du mois →", vérifier que la page `/calendrier` s'affiche avec le mois courant et que les boutons ◀ ▶ changent de mois.

- [ ] **Step 4: Run full test suite to verify nothing broke**

Run: `npx vitest run`
Expected: PASS (tous les tests existants + les nouveaux)

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/pages/GardenPage.tsx
git commit -m "feat(calendrier): route /calendrier et lien depuis le jardin"
```

---

## Self-Review Notes (déjà appliqué ci-dessus)

- **Couverture spec** : navigation mois par mois (Task 2), regroupement par action (Task 2, `Section`), filtrage catalogue complet sans distinction de `Crop` (Task 1, `getMonthPlan` ne touche pas à `crops`), nouvelle page `/calendrier` (Task 3). Hors périmètre (rappels, rotation, associations) volontairement absent, conforme à la spec.
- **Pas de placeholder** : chaque step contient le code complet.
- **Cohérence des types** : `MonthPlan`, `getMonthPlan(catalog, month)` utilisés identiquement entre Task 1 et Task 2.
