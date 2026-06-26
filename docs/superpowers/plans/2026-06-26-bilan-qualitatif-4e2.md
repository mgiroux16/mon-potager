# Bilan qualitatif de saison (4E-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter sur `/bilan` une note libre "à refaire / à changer" par culture et une note libre "météo marquante" par parcelle, persistées par année dans une nouvelle table Dexie `seasonNotes`.

**Architecture:** Nouvelle table Dexie `seasonNotes` (migration version 3) stockant des notes texte liées soit à `(year, cropId)` soit à `(year, parcelId)`. Un service pur `seasonNotesService.ts` expose des lecteurs sur tableau déjà chargé (`getCropNote`/`getParcelNote`) et des upserts asynchrones (`setCropNote`/`setParcelNote`). Deux nouveaux composants React (`CropNoteField`, `ParcelNoteField`) dans `SeasonSummaryPage.tsx`, calqués sur le pattern `CropPrice` de `GardenPage.tsx` (état local, save au blur).

**Tech Stack:** React 19, Dexie/IndexedDB, dexie-react-hooks (`useLiveQuery`), Vitest + Testing Library, fake-indexeddb pour les tests.

---

## Fichiers concernés

- Modifier : `src/data/model.ts` — ajouter l'interface `SeasonNote`.
- Modifier : `src/data/db.ts` — ajouter la table `seasonNotes` et la migration `version(3)`.
- Créer : `src/services/seasonNotesService.ts` — logique pure + upserts.
- Créer : `src/services/seasonNotesService.test.ts` — tests du service.
- Modifier : `src/pages/SeasonSummaryPage.tsx` — composants `CropNoteField`/`ParcelNoteField` + branchement.
- Modifier : `src/pages/SeasonSummaryPage.test.tsx` — tests des nouveaux champs.

---

### Task 1 : modèle de données `SeasonNote`

**Files:**
- Modify: `src/data/model.ts`

- [ ] **Step 1: Ajouter l'interface `SeasonNote` à la fin du fichier**

Ouvrir `src/data/model.ts`, repérer la fin du fichier (après l'interface `AppSettings`), et ajouter :

```ts
export interface SeasonNote {
  id?: number
  year: number
  cropId?: number
  parcelId?: number
  text: string
}
```

- [ ] **Step 2: Vérifier que le projet compile toujours**

Run: `npm run build`
Expected: build réussi, aucune erreur TypeScript (le type n'est pas encore utilisé ailleurs, c'est normal).

- [ ] **Step 3: Commit**

```bash
git add src/data/model.ts
git commit -m "feat(saison): ajoute le type SeasonNote"
```

---

### Task 2 : table Dexie `seasonNotes`

**Files:**
- Modify: `src/data/db.ts`

- [ ] **Step 1: Importer le type `SeasonNote` et déclarer la table**

Dans `src/data/db.ts`, modifier l'import en haut du fichier :

```ts
import type {
  GardenLogEntry,
  Parcel,
  Crop,
  Oya,
  FruitTree,
  WaterTank,
  CatalogItem,
  Expense,
  SoilNote,
  AppSettings,
  Variety,
  SeasonNote,
} from './model'
```

Puis ajouter la déclaration de table dans la classe, après `varieties` :

```ts
  varieties!: Table<Variety, number>
  seasonNotes!: Table<SeasonNote, number>
```

- [ ] **Step 2: Ajouter la migration `version(3)`**

Toujours dans `src/data/db.ts`, après le bloc `this.version(2).stores({...})`, ajouter :

```ts
    this.version(3).stores({
      seasonNotes: '++id, year, cropId, parcelId',
    })
```

- [ ] **Step 3: Vérifier que le projet compile et que les tests existants passent toujours**

Run: `npm run build && npm test -- --run`
Expected: build OK, tous les tests déjà existants passent (aucun test ne touche encore `seasonNotes`).

- [ ] **Step 4: Commit**

```bash
git add src/data/db.ts
git commit -m "feat(saison): ajoute la table Dexie seasonNotes (migration v3)"
```

---

### Task 3 : service `seasonNotesService.ts` — lecture pure

**Files:**
- Create: `src/services/seasonNotesService.ts`
- Test: `src/services/seasonNotesService.test.ts`

- [ ] **Step 1: Écrire les tests des fonctions de lecture pure**

Créer `src/services/seasonNotesService.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { getCropNote, getParcelNote } from './seasonNotesService'
import type { SeasonNote } from '../data/model'

describe('getCropNote', () => {
  it('retourne le texte de la note correspondant à la culture et l année', () => {
    const notes: SeasonNote[] = [
      { id: 1, year: 2026, cropId: 5, text: 'Trop de mildiou, traiter plus tôt' },
      { id: 2, year: 2025, cropId: 5, text: 'note année précédente' },
      { id: 3, year: 2026, cropId: 6, text: 'autre culture' },
    ]
    expect(getCropNote(notes, 5, 2026)).toBe('Trop de mildiou, traiter plus tôt')
  })

  it('retourne une chaîne vide si aucune note ne correspond', () => {
    const notes: SeasonNote[] = [{ id: 1, year: 2026, cropId: 5, text: 'note' }]
    expect(getCropNote(notes, 99, 2026)).toBe('')
  })
})

describe('getParcelNote', () => {
  it('retourne le texte de la note correspondant à la parcelle et l année', () => {
    const notes: SeasonNote[] = [
      { id: 1, year: 2026, parcelId: 2, text: 'Sécheresse en juillet' },
      { id: 2, year: 2025, parcelId: 2, text: 'note année précédente' },
    ]
    expect(getParcelNote(notes, 2, 2026)).toBe('Sécheresse en juillet')
  })

  it('retourne une chaîne vide si aucune note ne correspond', () => {
    const notes: SeasonNote[] = [{ id: 1, year: 2026, parcelId: 2, text: 'note' }]
    expect(getParcelNote(notes, 77, 2026)).toBe('')
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/services/seasonNotesService.test.ts`
Expected: FAIL avec une erreur du type "Failed to resolve import './seasonNotesService'" (le fichier n'existe pas encore).

- [ ] **Step 3: Implémenter les fonctions de lecture**

Créer `src/services/seasonNotesService.ts` :

```ts
import { db } from '../data/db'
import type { SeasonNote } from '../data/model'

export function getCropNote(notes: SeasonNote[], cropId: number, year: number): string {
  return notes.find((n) => n.cropId === cropId && n.year === year)?.text ?? ''
}

export function getParcelNote(notes: SeasonNote[], parcelId: number, year: number): string {
  return notes.find((n) => n.parcelId === parcelId && n.year === year)?.text ?? ''
}
```

(Les fonctions d'upsert `setCropNote`/`setParcelNote` seront ajoutées à la Task 4 dans ce même fichier, l'import de `db` ci-dessus sera utilisé à ce moment-là.)

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/services/seasonNotesService.test.ts`
Expected: PASS, 4 tests verts.

- [ ] **Step 5: Commit**

```bash
git add src/services/seasonNotesService.ts src/services/seasonNotesService.test.ts
git commit -m "feat(saison): seasonNotesService - lecture pure des notes de bilan"
```

---

### Task 4 : service `seasonNotesService.ts` — upserts

**Files:**
- Modify: `src/services/seasonNotesService.ts`
- Modify: `src/services/seasonNotesService.test.ts`

- [ ] **Step 1: Écrire les tests des upserts**

Ajouter à la fin de `src/services/seasonNotesService.test.ts` :

```ts
import { db } from '../data/db'
import { setCropNote, setParcelNote } from './seasonNotesService'

beforeEach(async () => {
  await db.seasonNotes.clear()
})

describe('setCropNote', () => {
  it('crée une nouvelle note si aucune n existe pour cette culture et cette année', async () => {
    await setCropNote(5, 2026, 'Trop dense, espacer davantage')
    const rows = await db.seasonNotes.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ cropId: 5, year: 2026, text: 'Trop dense, espacer davantage' })
  })

  it('met à jour la note existante au lieu d en créer une seconde', async () => {
    await setCropNote(5, 2026, 'premier texte')
    await setCropNote(5, 2026, 'texte corrigé')
    const rows = await db.seasonNotes.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toBe('texte corrigé')
  })

  it('supprime la note existante si le texte devient vide', async () => {
    await setCropNote(5, 2026, 'un texte')
    await setCropNote(5, 2026, '')
    const rows = await db.seasonNotes.toArray()
    expect(rows).toHaveLength(0)
  })

  it('ne crée rien si le texte est vide et qu aucune note n existait', async () => {
    await setCropNote(5, 2026, '')
    const rows = await db.seasonNotes.toArray()
    expect(rows).toHaveLength(0)
  })
})

describe('setParcelNote', () => {
  it('crée une nouvelle note si aucune n existe pour cette parcelle et cette année', async () => {
    await setParcelNote(2, 2026, 'Sécheresse en juillet')
    const rows = await db.seasonNotes.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ parcelId: 2, year: 2026, text: 'Sécheresse en juillet' })
  })

  it('met à jour la note existante au lieu d en créer une seconde', async () => {
    await setParcelNote(2, 2026, 'premier texte')
    await setParcelNote(2, 2026, 'texte corrigé')
    const rows = await db.seasonNotes.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].text).toBe('texte corrigé')
  })
})
```

Et ajouter `beforeEach` aux imports vitest en haut du fichier :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/services/seasonNotesService.test.ts`
Expected: FAIL, `setCropNote`/`setParcelNote` ne sont pas exportés.

- [ ] **Step 3: Implémenter les upserts**

Ajouter à la fin de `src/services/seasonNotesService.ts` :

```ts
async function upsertNote(
  match: (n: SeasonNote) => boolean,
  build: () => SeasonNote,
  text: string,
): Promise<void> {
  const all = await db.seasonNotes.toArray()
  const existing = all.find(match)
  const trimmed = text.trim()

  if (existing) {
    if (trimmed === '') {
      await db.seasonNotes.delete(existing.id as number)
    } else {
      await db.seasonNotes.update(existing.id as number, { text: trimmed })
    }
    return
  }

  if (trimmed !== '') {
    await db.seasonNotes.add(build())
  }
}

export async function setCropNote(cropId: number, year: number, text: string): Promise<void> {
  await upsertNote(
    (n) => n.cropId === cropId && n.year === year,
    () => ({ cropId, year, text: text.trim() }),
    text,
  )
}

export async function setParcelNote(parcelId: number, year: number, text: string): Promise<void> {
  await upsertNote(
    (n) => n.parcelId === parcelId && n.year === year,
    () => ({ parcelId, year, text: text.trim() }),
    text,
  )
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/services/seasonNotesService.test.ts`
Expected: PASS, 10 tests verts au total.

- [ ] **Step 5: Commit**

```bash
git add src/services/seasonNotesService.ts src/services/seasonNotesService.test.ts
git commit -m "feat(saison): seasonNotesService - upsert des notes de culture et de parcelle"
```

---

### Task 5 : champs de note sur `SeasonSummaryPage.tsx`

**Files:**
- Modify: `src/pages/SeasonSummaryPage.tsx`
- Modify: `src/pages/SeasonSummaryPage.test.tsx`

- [ ] **Step 1: Écrire le test d'intégration des deux champs**

Ajouter à `src/pages/SeasonSummaryPage.test.tsx`, à l'intérieur du `describe('SeasonSummaryPage', ...)`, après le test existant `'affiche le bilan par culture et par parcelle'` :

```ts
  it('permet de saisir une note de culture et une note de parcelle, et les persiste', async () => {
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

    const cropNoteField = await screen.findByLabelText('À refaire ou à changer pour Tomates')
    fireEvent.change(cropNoteField, { target: { value: 'Espacer davantage les plants' } })
    fireEvent.blur(cropNoteField)

    const parcelNoteField = await screen.findByLabelText('Météo marquante pour Carré nord')
    fireEvent.change(parcelNoteField, { target: { value: 'Sécheresse en juillet' } })
    fireEvent.blur(parcelNoteField)

    await waitFor(async () => {
      const rows = await db.seasonNotes.toArray()
      expect(rows).toHaveLength(2)
      expect(rows.find((r) => r.cropId === cropId)?.text).toBe('Espacer davantage les plants')
      expect(rows.find((r) => r.parcelId === parcelId)?.text).toBe('Sécheresse en juillet')
    })
  })
```

Et mettre à jour l'import en haut du fichier pour ajouter `fireEvent` :

```ts
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/pages/SeasonSummaryPage.test.tsx`
Expected: FAIL, `screen.findByLabelText('À refaire ou à changer pour Tomates')` ne trouve rien.

- [ ] **Step 3: Implémenter les composants et le branchement**

Remplacer le contenu de `src/pages/SeasonSummaryPage.tsx` par :

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
import { getCropNote, getParcelNote, setCropNote, setParcelNote } from '../services/seasonNotesService'
import type { AppSettings, SeasonNote } from '../data/model'

function useSettings(): AppSettings | undefined {
  return useLiveQuery(() => getSettings(), [], undefined)
}

function formatKg(kg: number): string {
  return `${kg.toLocaleString('fr-FR')} kg`
}

function formatEuros(value: number): string {
  return `${value.toLocaleString('fr-FR')} €`
}

function CropNoteField({
  row,
  year,
  notes,
}: {
  row: CropSeasonRow
  year: number
  notes: SeasonNote[]
}) {
  const [value, setValue] = useState(getCropNote(notes, row.cropId, year))

  async function save() {
    await setCropNote(row.cropId, year, value)
  }

  return (
    <label className="mt-1 flex flex-col gap-1 text-xs text-gray-600">
      À refaire ou à changer
      <textarea
        aria-label={`À refaire ou à changer pour ${row.cropName}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        rows={2}
        className="w-full rounded border border-green-200 px-2 py-1 text-sm"
      />
    </label>
  )
}

function ParcelNoteField({
  row,
  year,
  notes,
}: {
  row: ParcelSeasonRow
  year: number
  notes: SeasonNote[]
}) {
  const [value, setValue] = useState(getParcelNote(notes, row.parcelId, year))

  async function save() {
    await setParcelNote(row.parcelId, year, value)
  }

  return (
    <label className="mt-1 flex flex-col gap-1 text-xs text-gray-600">
      Météo marquante
      <textarea
        aria-label={`Météo marquante pour ${row.parcelName}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        rows={2}
        className="w-full rounded border border-green-200 px-2 py-1 text-sm"
      />
    </label>
  )
}

function CropRowView({ row, year, notes }: { row: CropSeasonRow; year: number; notes: SeasonNote[] }) {
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
      <CropNoteField row={row} year={year} notes={notes} />
    </li>
  )
}

function ParcelRowView({ row, year, notes }: { row: ParcelSeasonRow; year: number; notes: SeasonNote[] }) {
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
      <ParcelNoteField row={row} year={year} notes={notes} />
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
  const notes = useLiveQuery(() => db.seasonNotes.toArray(), [], [])

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
                <CropRowView
                  key={`${row.cropId}-${row.varietyId ?? 'none'}`}
                  row={row}
                  year={year}
                  notes={notes}
                />
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-green-700">Par parcelle</h2>
            <ul className="mt-2 space-y-1">
              {parcelRows.map((row) => (
                <ParcelRowView key={row.parcelId} row={row} year={year} notes={notes} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/pages/SeasonSummaryPage.test.tsx`
Expected: PASS, 3 tests verts.

- [ ] **Step 5: Lancer toute la suite de tests pour vérifier l'absence de régression**

Run: `npm test -- --run`
Expected: PASS, tous les tests verts (209 tests précédents + les nouveaux de ce palier).

- [ ] **Step 6: Lint et build**

Run: `npm run lint && npm run build`
Expected: aucune erreur lint, build réussi.

- [ ] **Step 7: Commit**

```bash
git add src/pages/SeasonSummaryPage.tsx src/pages/SeasonSummaryPage.test.tsx
git commit -m "feat(saison): notes qualitatives par culture et par parcelle sur le bilan"
```

---

### Task 6 : vérification manuelle en navigateur

**Files:** aucun fichier modifié, vérification uniquement.

- [ ] **Step 1: Lancer le serveur de dev**

Run: `npm run dev`

- [ ] **Step 2: Naviguer sur `/bilan`, vérifier visuellement**

- Ouvrir une culture et une parcelle ayant des données pour l'année en cours (créer des données de test si besoin via l'UI normale).
- Vérifier que le champ "À refaire ou à changer" apparaît sous chaque ligne de culture, et "Météo marquante" sous chaque ligne de parcelle.
- Saisir un texte, cliquer ailleurs (blur), recharger la page : le texte doit être conservé.
- Changer l'année dans le sélecteur : les champs doivent revenir vides (aucune note pour cette autre année), confirmant le scope par `(year, cropId/parcelId)`.

- [ ] **Step 3: Nettoyer les données de test créées pendant la vérification, si nécessaire**

Si des cultures/parcelles/notes de test ont été ajoutées uniquement pour cette vérification, les supprimer via l'UI pour ne pas polluer les données réelles de Mathieu.
