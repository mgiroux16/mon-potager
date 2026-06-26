# Palier 4D-1 : Arrosage chiffré (durée + cumul litres) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un champ durée informatif aux entrées d'arrosage, créer un service pur de cumul de litres par parcelle (7/14/30j + année), et afficher ce bilan sur la page `/eau`.

**Architecture:** Suit exactement le pattern déjà en place pour les récoltes (`harvestService.ts` + `HarvestPage.tsx`). Un nouveau service pur `waterUsageService.ts` agrège les `GardenLogEntry` filtrées sur `type === 'arrosage'`. `QuickAddPage.tsx` gagne un champ de saisie optionnel non lié au calcul. Aucune dépendance React dans le service, testable en isolation.

**Tech Stack:** React, TypeScript, Vite, Vitest, @testing-library/react, Dexie (IndexedDB), Tailwind CSS.

Spec de référence : [docs/specs/2026-06-26-arrosage-chiffre-design.md](../../specs/2026-06-26-arrosage-chiffre-design.md)

---

## Fichiers concernés

- Modifier : `src/data/model.ts` — ajouter `durationMinutes?: number` à `GardenLogEntry`.
- Créer : `src/services/waterUsageService.ts` — service pur de cumul.
- Créer : `src/services/waterUsageService.test.ts` — tests du service.
- Modifier : `src/pages/QuickAddPage.tsx` — champ durée optionnel pour la config arrosage.
- Modifier : `src/pages/QuickAddPage.test.tsx` — tests de la saisie durée.
- Modifier : `src/pages/WaterPage.tsx` — remplace le `PlaceholderPage` par le bilan.
- Créer : `src/pages/WaterPage.test.tsx` — tests de la page.

---

### Task 1 : Modèle de données

**Files:**
- Modify: `src/data/model.ts`

- [ ] **Step 1: Ajouter le champ `durationMinutes` à `GardenLogEntry`**

Dans `src/data/model.ts`, juste après `quantityKg?: number` (vers la ligne 73) :

```ts
  quantityKg?: number
  durationMinutes?: number // durée d'arrosage en minutes, informatif, jamais utilisé pour un calcul
  expenseId?: number
```

- [ ] **Step 2: Vérifier que le typecheck passe**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/data/model.ts
git commit -m "feat(model): ajoute durationMinutes optionnel a GardenLogEntry"
```

---

### Task 2 : Service `waterUsageService` — fenêtres glissantes et cumul annuel

**Files:**
- Create: `src/services/waterUsageService.ts`
- Test: `src/services/waterUsageService.test.ts`

- [ ] **Step 1: Écrire les tests**

Créer `src/services/waterUsageService.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { summarizeWaterUsage } from './waterUsageService'
import type { GardenLogEntry, Parcel } from '../data/model'

function entry(over: Partial<GardenLogEntry>): GardenLogEntry {
  return {
    type: 'arrosage',
    date: '2026-06-01',
    createdAt: Date.now(),
    ...over,
  }
}

function parcel(over: Partial<Parcel>): Parcel {
  return { name: 'Carrés du fond', ...over }
}

describe('summarizeWaterUsage', () => {
  it('cumule les litres dans les 3 fenetres glissantes selon refDate', () => {
    const parcels = [parcel({ id: 1, name: 'Carrés du fond' })]
    const entries = [
      entry({ parcelId: 1, date: '2026-06-20', volumeLiters: 5 }), // 1j avant ref -> dans 7/14/30
      entry({ parcelId: 1, date: '2026-06-10', volumeLiters: 3 }), // 11j avant ref -> dans 14/30
      entry({ parcelId: 1, date: '2026-05-25', volumeLiters: 2 }), // 27j avant ref -> dans 30 seulement
      entry({ parcelId: 1, date: '2026-04-01', volumeLiters: 10 }), // hors fenetres glissantes
    ]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      parcelId: 1,
      parcelName: 'Carrés du fond',
      liters7: 5,
      liters14: 8,
      liters30: 10,
    })
  })

  it('cumule litersYear sur toute l annee de refDate, independamment des fenetres glissantes', () => {
    const parcels = [parcel({ id: 1 })]
    const entries = [
      entry({ parcelId: 1, date: '2026-01-05', volumeLiters: 7 }),
      entry({ parcelId: 1, date: '2026-06-20', volumeLiters: 5 }),
      entry({ parcelId: 1, date: '2025-12-31', volumeLiters: 100 }),
    ]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows[0].litersYear).toBe(12)
  })

  it('cumule sur plusieurs parcelles independamment', () => {
    const parcels = [parcel({ id: 1, name: 'Carrés du fond' }), parcel({ id: 2, name: 'Allée' })]
    const entries = [
      entry({ parcelId: 1, date: '2026-06-20', volumeLiters: 5 }),
      entry({ parcelId: 2, date: '2026-06-20', volumeLiters: 8 }),
    ]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows.find((r) => r.parcelId === 1)?.liters7).toBe(5)
    expect(rows.find((r) => r.parcelId === 2)?.liters7).toBe(8)
  })

  it('exclut une parcelle sans aucune entree arrosage chiffree', () => {
    const parcels = [parcel({ id: 1, name: 'Carrés du fond' }), parcel({ id: 2, name: 'Sans eau' })]
    const entries = [entry({ parcelId: 1, date: '2026-06-20', volumeLiters: 5 })]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows).toHaveLength(1)
    expect(rows[0].parcelId).toBe(1)
  })

  it('ignore les entrees sans volumeLiters (duree seule)', () => {
    const parcels = [parcel({ id: 1 })]
    const entries = [entry({ parcelId: 1, date: '2026-06-20', durationMinutes: 15 })]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows).toHaveLength(0)
  })

  it('ignore les entrees sans parcelId', () => {
    const parcels = [parcel({ id: 1 })]
    const entries = [entry({ date: '2026-06-20', volumeLiters: 5 })]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows).toHaveLength(0)
  })

  it('ignore les entrees qui ne sont pas de type arrosage', () => {
    const parcels = [parcel({ id: 1 })]
    const entries = [entry({ type: 'remplissage_oya', parcelId: 1, date: '2026-06-20', volumeLiters: 5 })]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows).toHaveLength(0)
  })

  it('trie les resultats par nom de parcelle alphabetique', () => {
    const parcels = [parcel({ id: 1, name: 'Tomates' }), parcel({ id: 2, name: 'Allée' })]
    const entries = [
      entry({ parcelId: 1, date: '2026-06-20', volumeLiters: 1 }),
      entry({ parcelId: 2, date: '2026-06-20', volumeLiters: 1 }),
    ]
    const rows = summarizeWaterUsage(entries, parcels, '2026-06-21')
    expect(rows.map((r) => r.parcelName)).toEqual(['Allée', 'Tomates'])
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/services/waterUsageService.test.ts`
Expected: FAIL avec "Cannot find module './waterUsageService'"

- [ ] **Step 3: Implémenter le service**

Créer `src/services/waterUsageService.ts` :

```ts
import type { GardenLogEntry, Parcel } from '../data/model'

export interface WaterUsageRow {
  parcelId: number
  parcelName: string
  liters7: number
  liters14: number
  liters30: number
  litersYear: number
}

function daysBetween(from: string, to: string): number {
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24))
}

function yearOf(date: string): string {
  return date.slice(0, 4)
}

export function summarizeWaterUsage(
  entries: GardenLogEntry[],
  parcels: Parcel[],
  refDate: string,
): WaterUsageRow[] {
  const byParcel = new Map<number, WaterUsageRow>()
  const refYear = yearOf(refDate)

  for (const e of entries) {
    if (e.type !== 'arrosage' || e.volumeLiters == null || e.parcelId == null) continue

    const ageDays = daysBetween(e.date, refDate)
    if (ageDays < 0) continue

    const parcel = parcels.find((p) => p.id === e.parcelId)
    const parcelName = parcel?.name ?? '(parcelle supprimée)'

    let row = byParcel.get(e.parcelId)
    if (!row) {
      row = {
        parcelId: e.parcelId,
        parcelName,
        liters7: 0,
        liters14: 0,
        liters30: 0,
        litersYear: 0,
      }
      byParcel.set(e.parcelId, row)
    }

    if (ageDays <= 7) row.liters7 += e.volumeLiters
    if (ageDays <= 14) row.liters14 += e.volumeLiters
    if (ageDays <= 30) row.liters30 += e.volumeLiters
    if (yearOf(e.date) === refYear) row.litersYear += e.volumeLiters
  }

  return Array.from(byParcel.values()).sort((a, b) => a.parcelName.localeCompare(b.parcelName))
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/services/waterUsageService.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/waterUsageService.ts src/services/waterUsageService.test.ts
git commit -m "feat(eau): service pur de cumul des litres par parcelle"
```

---

### Task 3 : Page `/eau` — affichage du bilan

**Files:**
- Modify: `src/pages/WaterPage.tsx`
- Create: `src/pages/WaterPage.test.tsx`

- [ ] **Step 1: Écrire les tests**

Créer `src/pages/WaterPage.test.tsx` :

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { WaterPage } from './WaterPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('WaterPage', () => {
  it('affiche un message si aucun arrosage chiffré', async () => {
    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText('Pas encore d’arrosage enregistré')).toBeInTheDocument()
    })
  })

  it('affiche le cumul par parcelle pour les fenetres glissantes et l annee', async () => {
    const parcelId = await db.parcels.add({ name: 'Carrés du fond' })
    await db.log.add({
      type: 'arrosage',
      date: new Date().toISOString().slice(0, 10),
      parcelId,
      volumeLiters: 5,
      createdAt: Date.now(),
    })

    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText('Carrés du fond')).toBeInTheDocument()
      expect(screen.getByText(/7j : 5 L/)).toBeInTheDocument()
      expect(screen.getByText(/14j : 5 L/)).toBeInTheDocument()
      expect(screen.getByText(/30j : 5 L/)).toBeInTheDocument()
      expect(screen.getByText(/Année : 5 L/)).toBeInTheDocument()
    })
  })

  it('affiche plusieurs parcelles', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const p1 = await db.parcels.add({ name: 'Carrés du fond' })
    const p2 = await db.parcels.add({ name: 'Allée' })
    await db.log.add({ type: 'arrosage', date: today, parcelId: p1, volumeLiters: 5, createdAt: Date.now() })
    await db.log.add({ type: 'arrosage', date: today, parcelId: p2, volumeLiters: 8, createdAt: Date.now() })

    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText('Carrés du fond')).toBeInTheDocument()
      expect(screen.getByText('Allée')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/pages/WaterPage.test.tsx`
Expected: FAIL — `WaterPage` actuel rend le `PlaceholderPage` ("Niveau des 5 cuves...") au lieu du message vide attendu.

- [ ] **Step 3: Réécrire `WaterPage.tsx`**

Remplacer le contenu de `src/pages/WaterPage.tsx` par :

```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { summarizeWaterUsage } from '../services/waterUsageService'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function WaterPage() {
  const entries = useLiveQuery(() => db.log.toArray(), [], [])
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const rows = summarizeWaterUsage(entries, parcels, todayISO())

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
    </div>
  )
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/pages/WaterPage.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/WaterPage.tsx src/pages/WaterPage.test.tsx
git commit -m "feat(eau): affiche le bilan litres par parcelle sur la page /eau"
```

---

### Task 4 : Saisie de la durée dans `QuickAddPage`

**Files:**
- Modify: `src/pages/QuickAddPage.tsx`
- Modify: `src/pages/QuickAddPage.test.tsx`

- [ ] **Step 1: Lire les tests existants pour connaître le pattern de rendu d'un `EntryForm`**

Run: `grep -n "EntryForm\|configForType('arrosage')\|Volume (litres)" src/pages/QuickAddPage.test.tsx`

Repérer comment un test existant rend la config arrosage et soumet le formulaire (recherche de `fireEvent.click` sur le bouton submit, et de l'aria-label `Volume (litres)`).

- [ ] **Step 2: Ajouter un test pour le champ durée**

Ajouter ce test dans `src/pages/QuickAddPage.test.tsx` (dans le bloc `describe` couvrant déjà la saisie d'arrosage — reprendre les imports et le setup déjà présents dans ce fichier, en particulier `render`, `screen`, `fireEvent`, `waitFor`, `db`, `EntryForm`, `configForType`) :

```tsx
it('enregistre durationMinutes independamment du volume sur une entree arrosage', async () => {
  const onSaved = vi.fn()
  render(
    <EntryForm config={configForType('arrosage')} onSaved={onSaved} onCancel={() => {}} />,
  )

  fireEvent.change(screen.getByLabelText('Volume (litres)'), { target: { value: '10' } })
  fireEvent.change(screen.getByLabelText('Durée (minutes)'), { target: { value: '15' } })
  fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }))

  await waitFor(async () => {
    const saved = await db.log.toArray()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ volumeLiters: 10, durationMinutes: 15 })
  })
})

it('permet de saisir la duree seule, sans volume', async () => {
  const onSaved = vi.fn()
  render(
    <EntryForm config={configForType('arrosage')} onSaved={onSaved} onCancel={() => {}} />,
  )

  fireEvent.change(screen.getByLabelText('Durée (minutes)'), { target: { value: '20' } })
  fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }))

  await waitFor(async () => {
    const saved = await db.log.toArray()
    expect(saved).toHaveLength(1)
    expect(saved[0].durationMinutes).toBe(20)
    expect(saved[0].volumeLiters).toBeUndefined()
  })
})
```

Note : si le fichier de test utilise un libellé de bouton différent de "enregistrer" (vérifier avec le grep de l'étape 1), adapter le sélecteur `getByRole('button', { name: ... })` en conséquence avant de continuer.

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/pages/QuickAddPage.test.tsx`
Expected: FAIL — `getByLabelText('Durée (minutes)')` introuvable.

- [ ] **Step 4: Ajouter l'état et le champ durée dans `QuickAddPage.tsx`**

Dans `src/pages/QuickAddPage.tsx`, ajouter l'état juste après la ligne du `volume` (vers la ligne 100) :

```ts
  const [volume, setVolume] = useState(initial?.volumeLiters != null ? String(initial.volumeLiters) : '')
  const [duration, setDuration] = useState(
    initial?.durationMinutes != null ? String(initial.durationMinutes) : '',
  )
```

Dans `handleSubmit`, juste après la ligne `if (config.measure === 'volume' && volume) entry.volumeLiters = Number(volume)` (vers la ligne 144), ajouter :

```ts
    if (config.measure === 'volume' && volume) entry.volumeLiters = Number(volume)
    if (config.measure === 'volume' && duration) entry.durationMinutes = Number(duration)
```

Dans le JSX, juste après le bloc `{config.measure === 'volume' && (...)}` du champ Volume (litres) (vers la ligne 330), ajouter le nouveau champ :

```tsx
      {config.measure === 'volume' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Durée (minutes)
          <input
            aria-label="Durée (minutes)"
            type="number"
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className={fieldClass}
          />
        </label>
      )}
```

Note : ce champ apparaît pour toute config `measure === 'volume'`, donc aussi pour `remplissage_oya`. C'est cohérent avec la spec : le champ `durationMinutes` est générique sur `GardenLogEntry`, et la spec ne demande pas de le restreindre à `arrosage` au niveau UI — seul `waterUsageService` est filtré sur `type === 'arrosage'`.

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/pages/QuickAddPage.test.tsx`
Expected: PASS (tous les tests du fichier, y compris les 2 nouveaux)

- [ ] **Step 6: Commit**

```bash
git add src/pages/QuickAddPage.tsx src/pages/QuickAddPage.test.tsx
git commit -m "feat(arrosage): ajoute la saisie optionnelle de la duree en minutes"
```

---

### Task 5 : Vérification finale

- [ ] **Step 1: Lancer la suite complète**

Run: `npx vitest run`
Expected: tous les tests passent (aucune régression sur les fichiers existants).

- [ ] **Step 2: Typecheck complet**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Lint**

Run: `npx eslint src`
Expected: aucune erreur (vérifier que le projet utilise bien cette commande ; sinon utiliser le script `lint` déclaré dans `package.json`).

---

## Self-review (couverture spec)

- §3 Modèle de données → Task 1.
- §4 Saisie de la durée (UI) → Task 4.
- §5 Calcul (dérivé, jamais stocké) → Task 2.
- §6 Page `/eau` → Task 3.
- §7 Hors périmètre → aucune tâche ne déborde (pas de calcul croisé litres/durée, pas de cumul par culture, pas de cuves, pas de carte photo, pas de changement Gemini).
- §8 Tests → couverts par Task 2 (service), Task 3 (page), Task 4 (QuickAddPage).
