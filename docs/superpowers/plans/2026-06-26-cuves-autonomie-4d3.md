# Palier 4D-3 : Niveau des cuves et autonomie en jours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher sur `/eau` la réserve totale des 5 cuves et l'autonomie projetée en jours, avec édition inline manuelle du niveau de chaque cuve.

**Architecture:** Un nouveau service pur `tankAutonomyService.ts` (même esprit que `waterUsageService.ts`) calcule la réserve totale et l'autonomie à partir des `WaterTank` et des `GardenLogEntry`. `WaterPage.tsx` est complétée (pas remplacée) avec deux nouvelles sections au-dessus du détail par parcelle déjà existant : la réserve totale + autonomie, puis l'édition inline des cuves (pattern repris de `CropPrice` dans `GardenPage.tsx`).

**Tech Stack:** React, TypeScript, Vite, Vitest, @testing-library/react, Dexie (IndexedDB), Tailwind CSS.

Spec de référence : [docs/specs/2026-06-26-cuves-autonomie-design.md](../../specs/2026-06-26-cuves-autonomie-design.md)

---

## Fichiers concernés

- Créer : `src/services/tankAutonomyService.ts` — service pur de calcul de la réserve et de l'autonomie.
- Créer : `src/services/tankAutonomyService.test.ts` — tests du service.
- Modifier : `src/pages/WaterPage.tsx` — ajoute les sections réserve totale + cuves éditables, garde le détail par parcelle existant.
- Modifier : `src/pages/WaterPage.test.tsx` — étend les tests pour couvrir les nouvelles sections.

---

### Task 1 : Service `tankAutonomyService`

**Files:**
- Create: `src/services/tankAutonomyService.ts`
- Test: `src/services/tankAutonomyService.test.ts`

- [ ] **Step 1: Écrire les tests**

Créer `src/services/tankAutonomyService.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { summarizeTankAutonomy } from './tankAutonomyService'
import type { GardenLogEntry, WaterTank } from '../data/model'

function entry(over: Partial<GardenLogEntry>): GardenLogEntry {
  return {
    type: 'arrosage',
    date: '2026-06-01',
    createdAt: Date.now(),
    ...over,
  }
}

function tank(over: Partial<WaterTank>): WaterTank {
  return { name: 'Cuve test', capacityLiters: 500, ...over }
}

describe('summarizeTankAutonomy', () => {
  it('somme la capacite et le niveau estime de toutes les cuves', () => {
    const tanks = [
      tank({ id: 1, capacityLiters: 500, estimatedLiters: 300 }),
      tank({ id: 2, capacityLiters: 500, estimatedLiters: 200 }),
    ]
    const result = summarizeTankAutonomy(tanks, [], '2026-06-21')
    expect(result.totalCapacityLiters).toBe(1000)
    expect(result.totalEstimatedLiters).toBe(500)
  })

  it('compte une cuve sans estimatedLiters comme 0', () => {
    const tanks = [tank({ id: 1, capacityLiters: 500 })]
    const result = summarizeTankAutonomy(tanks, [], '2026-06-21')
    expect(result.totalEstimatedLiters).toBe(0)
  })

  it('calcule la consommation moyenne sur 7 jours toutes parcelles confondues', () => {
    const tanks = [tank({ id: 1, estimatedLiters: 1000 })]
    const entries = [
      entry({ parcelId: 1, date: '2026-06-20', volumeLiters: 14 }), // dans la fenetre 7j
      entry({ parcelId: 2, date: '2026-06-18', volumeLiters: 7 }), // dans la fenetre 7j
      entry({ parcelId: 1, date: '2026-06-01', volumeLiters: 100 }), // hors fenetre
    ]
    const result = summarizeTankAutonomy(tanks, entries, '2026-06-21')
    expect(result.dailyAverageLiters).toBe(3) // (14 + 7) / 7
  })

  it('ignore les entrees sans volumeLiters ou hors type arrosage', () => {
    const tanks = [tank({ id: 1, estimatedLiters: 1000 })]
    const entries = [
      entry({ parcelId: 1, date: '2026-06-20', durationMinutes: 10 }),
      entry({ type: 'remplissage_oya', parcelId: 1, date: '2026-06-20', volumeLiters: 5 }),
    ]
    const result = summarizeTankAutonomy(tanks, entries, '2026-06-21')
    expect(result.dailyAverageLiters).toBe(0)
  })

  it('calcule autonomyDays comme totalEstimatedLiters / dailyAverageLiters, arrondi', () => {
    const tanks = [tank({ id: 1, estimatedLiters: 100 })]
    const entries = [entry({ parcelId: 1, date: '2026-06-20', volumeLiters: 21 })] // 3 L/j
    const result = summarizeTankAutonomy(tanks, entries, '2026-06-21')
    expect(result.dailyAverageLiters).toBe(3)
    expect(result.autonomyDays).toBe(33) // 100 / 3 = 33.33 -> 33
  })

  it('renvoie autonomyDays null quand la consommation moyenne est nulle', () => {
    const tanks = [tank({ id: 1, estimatedLiters: 1000 })]
    const result = summarizeTankAutonomy(tanks, [], '2026-06-21')
    expect(result.autonomyDays).toBeNull()
  })

  it('renvoie des totaux a 0 et autonomyDays null sans aucune cuve', () => {
    const result = summarizeTankAutonomy([], [], '2026-06-21')
    expect(result).toEqual({
      totalCapacityLiters: 0,
      totalEstimatedLiters: 0,
      dailyAverageLiters: 0,
      autonomyDays: null,
    })
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/services/tankAutonomyService.test.ts`
Expected: FAIL avec "Failed to resolve import './tankAutonomyService'"

- [ ] **Step 3: Implémenter le service**

Créer `src/services/tankAutonomyService.ts` :

```ts
import type { GardenLogEntry, WaterTank } from '../data/model'

export interface TankAutonomySummary {
  totalCapacityLiters: number
  totalEstimatedLiters: number
  dailyAverageLiters: number
  autonomyDays: number | null
}

function daysBetween(from: string, to: string): number {
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24))
}

export function summarizeTankAutonomy(
  tanks: WaterTank[],
  entries: GardenLogEntry[],
  refDate: string,
): TankAutonomySummary {
  const totalCapacityLiters = tanks.reduce((sum, t) => sum + t.capacityLiters, 0)
  const totalEstimatedLiters = tanks.reduce((sum, t) => sum + (t.estimatedLiters ?? 0), 0)

  let liters7 = 0
  for (const e of entries) {
    if (e.type !== 'arrosage' || e.volumeLiters == null || e.parcelId == null) continue
    const ageDays = daysBetween(e.date, refDate)
    if (ageDays < 0 || ageDays > 7) continue
    liters7 += e.volumeLiters
  }
  const dailyAverageLiters = liters7 / 7

  const autonomyDays =
    dailyAverageLiters === 0 ? null : Math.round(totalEstimatedLiters / dailyAverageLiters)

  return { totalCapacityLiters, totalEstimatedLiters, dailyAverageLiters, autonomyDays }
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/services/tankAutonomyService.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/tankAutonomyService.ts src/services/tankAutonomyService.test.ts
git commit -m "feat(eau): service pur de calcul de la reserve et de l'autonomie des cuves"
```

---

### Task 2 : Page `/eau` — réserve totale et édition inline des cuves

**Files:**
- Modify: `src/pages/WaterPage.tsx`
- Modify: `src/pages/WaterPage.test.tsx`

- [ ] **Step 1: Ajouter les tests**

Ajouter ces tests dans `src/pages/WaterPage.test.tsx`, dans le `describe('WaterPage')` existant (le fichier importe déjà `db`, `render`, `screen`, `waitFor` ; ajouter `fireEvent` à l'import `@testing-library/react`) :

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '../data/db'
import { WaterPage } from './WaterPage'
```

Puis ajouter, à la fin du bloc `describe` :

```tsx
  it('affiche la reserve totale et l autonomie en jours', async () => {
    await db.tanks.bulkAdd([
      { name: 'Cuve 1', capacityLiters: 500, estimatedLiters: 300 },
      { name: 'Cuve 2', capacityLiters: 500, estimatedLiters: 200 },
    ])
    const parcelId = await db.parcels.add({ name: 'Carrés du fond' })
    const today = new Date().toISOString().slice(0, 10)
    await db.log.add({ type: 'arrosage', date: today, parcelId, volumeLiters: 7, createdAt: Date.now() })

    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText('Réserve d’eau : 500 / 1000 L')).toBeInTheDocument()
      expect(screen.getByText('Autonomie : 100 jours')).toBeInTheDocument()
    })
  })

  it('affiche autonomie illimitee sans consommation recente', async () => {
    await db.tanks.bulkAdd([{ name: 'Cuve 1', capacityLiters: 500, estimatedLiters: 300 }])

    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText('Autonomie : illimitée')).toBeInTheDocument()
    })
  })

  it('permet d editer le niveau d une cuve et persiste la valeur', async () => {
    const tankId = await db.tanks.add({ name: 'Cuve 1', capacityLiters: 500, estimatedLiters: 300 })

    render(<WaterPage />)
    const input = await screen.findByLabelText('Niveau de Cuve 1 en litres')
    fireEvent.change(input, { target: { value: '450' } })
    fireEvent.blur(input)

    await waitFor(async () => {
      const updated = await db.tanks.get(tankId)
      expect(updated?.estimatedLiters).toBe(450)
    })
  })

  it('n affiche pas de section cuves si la table tanks est vide', async () => {
    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText('Réserve d’eau : 0 / 0 L')).toBeInTheDocument()
    })
    expect(screen.queryByLabelText(/Niveau de .* en litres/)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/pages/WaterPage.test.tsx`
Expected: FAIL — les 4 nouveaux tests échouent (texte "Réserve d'eau : ..." et champ "Niveau de ... en litres" introuvables ; `WaterPage` actuel n'affiche que le titre et le détail par parcelle).

- [ ] **Step 3: Réécrire `WaterPage.tsx`**

Remplacer le contenu de `src/pages/WaterPage.tsx` par :

```tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import type { WaterTank } from '../data/model'
import { summarizeWaterUsage } from '../services/waterUsageService'
import { summarizeTankAutonomy } from '../services/tankAutonomyService'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function TankLevelInput({ tank }: { tank: WaterTank }) {
  const [value, setValue] = useState(
    tank.estimatedLiters != null ? String(tank.estimatedLiters) : '',
  )

  async function save() {
    const parsed = value.trim() === '' ? undefined : Number(value.replace(',', '.'))
    if (tank.id != null && parsed != null && !Number.isNaN(parsed)) {
      await db.tanks.update(tank.id, { estimatedLiters: parsed })
    }
  }

  return (
    <li className="flex items-center justify-between rounded bg-green-50 px-3 py-2">
      <span className="font-medium text-green-900">{tank.name}</span>
      <label className="flex items-center gap-1 text-sm text-green-800">
        <input
          aria-label={`Niveau de ${tank.name} en litres`}
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="w-20 rounded border border-green-300 px-1 py-0.5 text-sm"
        />
        L / {tank.capacityLiters} L
      </label>
    </li>
  )
}

export function WaterPage() {
  const entries = useLiveQuery(() => db.log.toArray(), [], [])
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const tanks = useLiveQuery(() => db.tanks.toArray(), [], [])
  const rows = summarizeWaterUsage(entries, parcels, todayISO())
  const tankSummary = summarizeTankAutonomy(tanks, entries, todayISO())

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-green-800">Réserve d'eau</h1>

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
    </div>
  )
}
```

Note : l'apostrophe dans "Réserve d'eau : ..." doit être l'apostrophe droite (`'`), pas la
courbe (`'`), pour matcher exactement les tests — vérifier l'étape 4 ci-dessous si un test
échoue sur ce texte précis.

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/pages/WaterPage.test.tsx`
Expected: PASS (7 tests : les 3 existants du 4D-1 + les 4 nouveaux). Si un test échoue sur le
texte "Réserve d'eau : ...", comparer le caractère d'apostrophe utilisé dans le test et dans
le JSX et aligner les deux sur le même caractère (apostrophe droite `'`).

- [ ] **Step 5: Commit**

```bash
git add src/pages/WaterPage.tsx src/pages/WaterPage.test.tsx
git commit -m "feat(eau): affiche la reserve totale, l'autonomie et l'edition inline des cuves"
```

---

### Task 3 : Vérification finale

- [ ] **Step 1: Lancer la suite complète**

Run: `npx vitest run`
Expected: tous les tests passent (aucune régression sur les fichiers existants, en particulier `waterUsageService.test.ts` et les tests du 4D-1 dans `WaterPage.test.tsx`).

- [ ] **Step 2: Typecheck complet**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Lint**

Run: `npx oxlint src`
Expected: pas de nouvelle erreur (le warning préexistant sur `QuickAddPage.tsx` réacte-refresh n'est pas concerné par ce palier).

---

## Self-review (couverture spec)

- §2 Décisions (saisie manuelle, page /eau, fenêtre 7j, total + détail, autonomie illimitée) → Task 1 et Task 2.
- §3 Modèle de données → aucun changement nécessaire, confirmé par Task 1 (réutilise `WaterTank` existant).
- §4 Calcul → Task 1 (`tankAutonomyService.ts`).
- §5 Page `/eau` → Task 2.
- §6 Hors périmètre → aucune tâche ne déborde (pas de lecture photo IA, pas de carte du jardin, pas de recharge pluie, pas de type d'entrée `releve_cuve`, pas de notification).
- §7 Tests → couverts par Task 1 (service) et Task 2 (page).
