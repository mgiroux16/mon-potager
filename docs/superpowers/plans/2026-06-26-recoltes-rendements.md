# Palier 4C — Récoltes / rendements / € Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à Mathieu de voir, par légume et par année, combien il a récolté (kg) et combien ça aurait coûté au magasin (€) si un prix au kg a été renseigné, avec une comparaison visuelle entre années.

**Architecture:** La saisie existe déjà (type `recolte`, `quantityKg`). On ajoute : un champ `pricePerKg` optionnel sur `Crop`, une édition inline de ce prix dans `GardenPage`, un service pur `harvestService.ts` qui dérive des `HarvestRow[]` depuis le journal + les cultures (jamais stocké), et une nouvelle page `/recoltes` (liée depuis Jardin, pas dans la nav du bas) qui affiche le bilan avec un mini graphique en barres CSS/Tailwind par légume.

**Tech Stack:** React 19, TypeScript, Dexie (IndexedDB), dexie-react-hooks (`useLiveQuery`), react-router-dom 7 (HashRouter), Tailwind 4, Vitest + @testing-library/react.

Spec de référence : [docs/specs/2026-06-26-recoltes-rendements-design.md](../../specs/2026-06-26-recoltes-rendements-design.md)

---

## File Structure

- Modify: `src/data/model.ts` — ajoute `pricePerKg?: number` à `Crop`.
- Create: `src/services/harvestService.ts` — `summarizeHarvests(entries, crops): HarvestRow[]`, pur, testable.
- Create: `src/services/harvestService.test.ts` — tests du service.
- Modify: `src/pages/GardenPage.tsx` — édition inline du prix au kg sur chaque ligne de culture + lien "Voir le bilan des récoltes →".
- Modify: `src/pages/GardenPage.test.tsx` — étend pour couvrir l'édition du prix.
- Create: `src/pages/HarvestPage.tsx` — page `/recoltes`, cartes par légume avec graphique en barres CSS.
- Create: `src/pages/HarvestPage.test.tsx` — tests de la page.
- Modify: `src/App.tsx` — ajoute la route `recoltes`.

---

### Task 1: Ajouter `pricePerKg` au modèle `Crop`

**Files:**
- Modify: `src/data/model.ts:78-92`

- [ ] **Step 1: Modifier l'interface `Crop`**

Dans `src/data/model.ts`, remplacer :

```ts
export interface Crop {
  id?: number
  name: string
  variety?: string
  parcelId?: number
  catalogId?: number
  varietyId?: number
  plantCount?: number
  sowingDate?: ISODate
  plantingDate?: ISODate
  harvestDate?: ISODate
  status: CropStatus
  waterNeed?: WaterNeed
  notes?: string
}
```

par :

```ts
export interface Crop {
  id?: number
  name: string
  variety?: string
  parcelId?: number
  catalogId?: number
  varietyId?: number
  plantCount?: number
  sowingDate?: ISODate
  plantingDate?: ISODate
  harvestDate?: ISODate
  status: CropStatus
  waterNeed?: WaterNeed
  notes?: string
  pricePerKg?: number // € au kg, saisi manuellement par Mathieu (marché/magasin)
}
```

- [ ] **Step 2: Vérifier que le projet compile toujours**

Run: `npx tsc --noEmit`
Expected: aucune erreur (champ optionnel, pas de bump de schéma Dexie nécessaire).

- [ ] **Step 3: Commit**

```bash
git add src/data/model.ts
git commit -m "feat(recoltes): ajoute pricePerKg au modele Crop"
```

---

### Task 2: Service `harvestService.ts`

**Files:**
- Create: `src/services/harvestService.ts`
- Test: `src/services/harvestService.test.ts`

- [ ] **Step 1: Écrire les tests (ils doivent échouer, le fichier service n'existe pas encore)**

Créer `src/services/harvestService.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { summarizeHarvests } from './harvestService'
import type { GardenLogEntry, Crop } from '../data/model'

function entry(over: Partial<GardenLogEntry>): GardenLogEntry {
  return {
    type: 'recolte',
    date: '2026-06-01',
    createdAt: Date.now(),
    ...over,
  }
}

function crop(over: Partial<Crop>): Crop {
  return { name: 'Tomates', status: 'en_recolte', ...over }
}

describe('summarizeHarvests', () => {
  it('somme plusieurs cueillettes de la meme annee et culture', () => {
    const crops = [crop({ id: 1, name: 'Tomates' })]
    const entries = [
      entry({ cropId: 1, date: '2026-06-01', quantityKg: 2 }),
      entry({ cropId: 1, date: '2026-07-15', quantityKg: 3 }),
    ]
    const rows = summarizeHarvests(entries, crops)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ cropId: 1, cropName: 'Tomates', year: 2026, totalKg: 5 })
  })

  it('ne calcule pas totalEuros si la culture n a pas de pricePerKg', () => {
    const crops = [crop({ id: 1 })]
    const entries = [entry({ cropId: 1, quantityKg: 2 })]
    const rows = summarizeHarvests(entries, crops)
    expect(rows[0].totalEuros).toBeUndefined()
  })

  it('calcule totalEuros si pricePerKg est renseigne', () => {
    const crops = [crop({ id: 1, pricePerKg: 4 })]
    const entries = [entry({ cropId: 1, quantityKg: 2 })]
    const rows = summarizeHarvests(entries, crops)
    expect(rows[0].totalEuros).toBe(8)
  })

  it('utilise un nom de repli pour une entree orpheline', () => {
    const crops: Crop[] = []
    const entries = [entry({ cropId: 99, quantityKg: 1 })]
    const rows = summarizeHarvests(entries, crops)
    expect(rows[0].cropName).toBe('(culture supprimée)')
  })

  it('separe les annees differentes du meme legume', () => {
    const crops = [crop({ id: 1 })]
    const entries = [
      entry({ cropId: 1, date: '2025-08-01', quantityKg: 1 }),
      entry({ cropId: 1, date: '2026-08-01', quantityKg: 2 }),
    ]
    const rows = summarizeHarvests(entries, crops)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.year).sort()).toEqual([2025, 2026])
  })

  it('ignore les entrees sans quantityKg ou sans cropId', () => {
    const crops = [crop({ id: 1 })]
    const entries = [
      entry({ cropId: 1, quantityKg: undefined }),
      entry({ cropId: undefined, quantityKg: 2 }),
    ]
    const rows = summarizeHarvests(entries, crops)
    expect(rows).toHaveLength(0)
  })

  it('trie les resultats par nom de culture alphabetique', () => {
    const crops = [crop({ id: 1, name: 'Tomates' }), crop({ id: 2, name: 'Courgettes' })]
    const entries = [entry({ cropId: 1, quantityKg: 1 }), entry({ cropId: 2, quantityKg: 1 })]
    const rows = summarizeHarvests(entries, crops)
    expect(rows.map((r) => r.cropName)).toEqual(['Courgettes', 'Tomates'])
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/services/harvestService.test.ts`
Expected: FAIL avec "Cannot find module './harvestService'" ou équivalent.

- [ ] **Step 3: Implémenter le service**

Créer `src/services/harvestService.ts` :

```ts
import type { GardenLogEntry, Crop } from '../data/model'

export interface HarvestRow {
  cropId: number
  cropName: string
  year: number
  totalKg: number
  pricePerKg?: number
  totalEuros?: number
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4))
}

export function summarizeHarvests(entries: GardenLogEntry[], crops: Crop[]): HarvestRow[] {
  const byKey = new Map<string, HarvestRow>()

  for (const e of entries) {
    if (e.type !== 'recolte' || e.quantityKg == null || e.cropId == null) continue
    const year = yearOf(e.date)
    const key = `${e.cropId}-${year}`
    const crop = crops.find((c) => c.id === e.cropId)
    const cropName = crop?.name ?? '(culture supprimée)'

    const existing = byKey.get(key)
    if (existing) {
      existing.totalKg += e.quantityKg
    } else {
      byKey.set(key, {
        cropId: e.cropId,
        cropName,
        year,
        totalKg: e.quantityKg,
        pricePerKg: crop?.pricePerKg,
      })
    }
  }

  const rows = Array.from(byKey.values()).map((row) => ({
    ...row,
    totalEuros: row.pricePerKg != null ? row.totalKg * row.pricePerKg : undefined,
  }))

  return rows.sort((a, b) => a.cropName.localeCompare(b.cropName) || a.year - b.year)
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/services/harvestService.test.ts`
Expected: PASS, 7 tests verts.

- [ ] **Step 5: Commit**

```bash
git add src/services/harvestService.ts src/services/harvestService.test.ts
git commit -m "feat(recoltes): service pur de calcul des rendements/euros"
```

---

### Task 3: Édition inline du prix au kg dans `GardenPage`

**Files:**
- Modify: `src/pages/GardenPage.tsx`
- Modify: `src/pages/GardenPage.test.tsx`

- [ ] **Step 1: Écrire le test (doit échouer, le composant n'a pas encore l'édition)**

Ajouter à `src/pages/GardenPage.test.tsx`, dans le `describe('GardenPage', ...)` existant :

```ts
import { fireEvent } from '@testing-library/react'

it('permet d éditer le prix au kg d une culture', async () => {
  render(<GardenPage />)
  await waitFor(() => {
    expect(screen.getByText('Pommes de terre Agata')).toBeInTheDocument()
  })

  const editButtons = screen.getAllByLabelText('Renseigner le prix au kg')
  fireEvent.click(editButtons[0])

  const input = screen.getByLabelText('Prix au kg en euros')
  fireEvent.change(input, { target: { value: '2.5' } })
  fireEvent.blur(input)

  await waitFor(() => {
    expect(screen.getByText(/2,5\s?€\/kg/)).toBeInTheDocument()
  })
})
```

(L'import `fireEvent` doit être ajouté à la ligne d'import existante `import { render, screen, waitFor } from '@testing-library/react'` → `import { render, screen, waitFor, fireEvent } from '@testing-library/react'`.)

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/pages/GardenPage.test.tsx`
Expected: FAIL, `getAllByLabelText('Renseigner le prix au kg')` ne trouve rien.

- [ ] **Step 3: Implémenter l'édition inline + le lien vers `/recoltes`**

Remplacer le contenu de `src/pages/GardenPage.tsx` par :

```tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sprout, Trees, MapPin, Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import { db } from '../data/db'
import type { Crop } from '../data/model'

function formatPrice(price: number): string {
  return `${price.toLocaleString('fr-FR')} €/kg`
}

function CropPrice({ crop }: { crop: Crop }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(crop.pricePerKg != null ? String(crop.pricePerKg) : '')

  async function save() {
    setEditing(false)
    const parsed = value.trim() === '' ? undefined : Number(value.replace(',', '.'))
    if (crop.id != null && parsed != null && !Number.isNaN(parsed)) {
      await db.crops.update(crop.id, { pricePerKg: parsed })
    }
  }

  if (editing) {
    return (
      <input
        aria-label="Prix au kg en euros"
        type="number"
        step="0.01"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        className="ml-2 w-20 rounded border border-green-300 px-1 text-sm"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label="Renseigner le prix au kg"
      className="ml-2 inline-flex items-center gap-1 text-sm text-gray-500"
    >
      {crop.pricePerKg != null ? formatPrice(crop.pricePerKg) : <Pencil size={14} />}
    </button>
  )
}

export function GardenPage() {
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const trees = useLiveQuery(() => db.trees.toArray(), [], [])

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-green-800">Mon jardin</h1>

      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-green-700">
          <MapPin size={18} /> Parcelles
        </h2>
        <ul className="mt-2 space-y-1">
          {parcels.map((p) => (
            <li key={p.id} className="rounded bg-green-50 px-3 py-2">
              <span className="font-medium">{p.name}</span>
              {p.areaM2 ? <span className="text-sm text-gray-500"> · {p.areaM2} m²</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-green-700">
          <Sprout size={18} /> Cultures
        </h2>
        <ul className="mt-2 space-y-1">
          {crops.map((c) => (
            <li key={c.id} className="flex items-center rounded bg-green-50 px-3 py-2">
              <span>{c.name}</span>
              <CropPrice crop={c} />
            </li>
          ))}
        </ul>
        <Link to="/recoltes" className="mt-2 inline-block text-sm font-medium text-green-700">
          Voir le bilan des récoltes →
        </Link>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-green-700">
          <Trees size={18} /> Verger
        </h2>
        <ul className="mt-2 space-y-1">
          {trees.map((t) => (
            <li key={t.id} className="rounded bg-green-50 px-3 py-2">
              {t.name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/pages/GardenPage.test.tsx`
Expected: PASS, tous les tests verts (les anciens + le nouveau).

Note : `GardenPage` est rendu sans `MemoryRouter` dans les tests existants. Comme l'app utilise `HashRouter` et que les tests existants passent déjà sans wrapper Router, vérifier si `Link` lève une erreur ("useNavigate() may be used only in the context of a <Router> component"). Si c'est le cas, envelopper le rendu dans le test avec `<MemoryRouter>` :

```ts
import { MemoryRouter } from 'react-router-dom'
// ...
render(<GardenPage />, { wrapper: MemoryRouter })
```

et appliquer ce wrapper à tous les `render(<GardenPage />)` du fichier de test.

- [ ] **Step 5: Commit**

```bash
git add src/pages/GardenPage.tsx src/pages/GardenPage.test.tsx
git commit -m "feat(recoltes): edition inline du prix au kg et lien vers le bilan"
```

---

### Task 4: Page `/recoltes` (`HarvestPage`)

**Files:**
- Create: `src/pages/HarvestPage.tsx`
- Test: `src/pages/HarvestPage.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Écrire le test (doit échouer, le fichier n'existe pas)**

Créer `src/pages/HarvestPage.test.tsx` :

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { HarvestPage } from './HarvestPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('HarvestPage', () => {
  it('affiche un message si aucune récolte', async () => {
    render(<HarvestPage />)
    await waitFor(() => {
      expect(screen.getByText('Pas encore de récolte enregistrée')).toBeInTheDocument()
    })
  })

  it('affiche le bilan groupé par légume avec le total en kg et en euros', async () => {
    const cropId = await db.crops.add({ name: 'Tomates', status: 'en_recolte', pricePerKg: 3 })
    await db.log.add({
      type: 'recolte',
      date: '2026-06-01',
      cropId,
      quantityKg: 4,
      createdAt: Date.now(),
    })

    render(<HarvestPage />)
    await waitFor(() => {
      expect(screen.getByText('Tomates')).toBeInTheDocument()
      expect(screen.getByText(/4 kg/)).toBeInTheDocument()
      expect(screen.getByText(/12\s?€/)).toBeInTheDocument()
    })
  })
})
```

Confirmé : la table journal s'appelle `db.log` (voir `src/data/db.ts:17`), pas `db.gardenLog`.

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/pages/HarvestPage.test.tsx`
Expected: FAIL, "Cannot find module './HarvestPage'".

- [ ] **Step 3: Implémenter `HarvestPage`**

Créer `src/pages/HarvestPage.tsx` :

```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { summarizeHarvests, type HarvestRow } from '../services/harvestService'

function groupByCrop(rows: HarvestRow[]): Map<string, HarvestRow[]> {
  const map = new Map<string, HarvestRow[]>()
  for (const row of rows) {
    const list = map.get(row.cropName) ?? []
    list.push(row)
    map.set(row.cropName, list)
  }
  return map
}

function HarvestBarChart({ rows }: { rows: HarvestRow[] }) {
  const maxKg = Math.max(...rows.map((r) => r.totalKg))
  return (
    <div className="mt-2 flex items-end gap-2" style={{ height: 80 }}>
      {rows.map((row) => (
        <div key={row.year} className="flex flex-col items-center" style={{ width: 32 }}>
          <span className="text-xs text-gray-500">{row.totalKg} kg</span>
          <div
            className="w-full rounded-t bg-green-500"
            style={{ height: `${(row.totalKg / maxKg) * 56}px` }}
          />
          <span className="mt-1 text-xs text-gray-400">{row.year}</span>
        </div>
      ))}
    </div>
  )
}

export function HarvestPage() {
  const entries = useLiveQuery(() => db.log.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const rows = summarizeHarvests(entries, crops)
  const grouped = groupByCrop(rows)

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-green-800">Récoltes et rendements</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Pas encore de récolte enregistrée</p>
      ) : (
        Array.from(grouped.entries()).map(([cropName, cropRows]) => (
          <section key={cropName} className="rounded bg-green-50 p-3">
            <h2 className="text-lg font-semibold text-green-700">{cropName}</h2>
            <ul className="mt-2 space-y-1 text-sm text-green-900">
              {cropRows.map((row) => (
                <li key={row.year}>
                  {row.year} · {row.totalKg} kg
                  {row.totalEuros != null ? ` · ${row.totalEuros.toLocaleString('fr-FR')} €` : ''}
                </li>
              ))}
            </ul>
            <HarvestBarChart rows={cropRows} />
          </section>
        ))
      )}
    </div>
  )
}
```

(Table journal confirmée : `db.log`.)

- [ ] **Step 4: Ajouter la route dans `App.tsx`**

Dans `src/App.tsx`, ajouter l'import :

```ts
import { HarvestPage } from './pages/HarvestPage'
```

et ajouter la route, juste après la route `jardin` :

```tsx
<Route path="jardin" element={<GardenPage />} />
<Route path="recoltes" element={<HarvestPage />} />
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/pages/HarvestPage.test.tsx`
Expected: PASS, 2 tests verts.

- [ ] **Step 6: Lancer toute la suite de tests**

Run: `npx vitest run`
Expected: PASS, tous les tests verts (y compris ceux des tâches précédentes).

- [ ] **Step 7: Commit**

```bash
git add src/pages/HarvestPage.tsx src/pages/HarvestPage.test.tsx src/App.tsx
git commit -m "feat(recoltes): page bilan recoltes/rendements avec graphique en barres"
```

---

## Self-Review (effectué après écriture du plan)

**Couverture spec :**
- §2 (existant) : rien à faire, confirmé par Task 1-4 qui n'y touchent pas.
- §3 (modèle) : Task 1.
- §4 (édition prix) : Task 3.
- §5 (calcul) : Task 2.
- §6 (page /recoltes) : Task 4.
- §7 (hors périmètre) : aucune tâche n'y empiète (pas de prix par défaut, pas de récolte en pièces, pas d'export, pas de notification).
- §8 (tests) : `harvestService.test.ts` (Task 2), `HarvestPage.test.tsx` (Task 4), extension de `GardenPage.test.tsx` (Task 3).

**Placeholders :** aucun TBD/TODO ; chaque step a du code complet.

**Cohérence des types :** `HarvestRow` défini en Task 2 est réutilisé tel quel en Task 4 (`cropId`, `cropName`, `year`, `totalKg`, `pricePerKg`, `totalEuros`). `summarizeHarvests(entries, crops)` signature identique entre Task 2 et son usage en Task 4.

**Vérification effectuée :** la table Dexie du journal est `db.log` (confirmé dans `src/data/db.ts:17`) ; le plan utilise ce nom partout, aucune incertitude restante.
