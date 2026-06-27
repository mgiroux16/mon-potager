# Diagnostic IA (bloc final) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the diagnostic-by-hypothesis feature: on a `probleme` log entry, call Gemini with 14-day context plus multi-season history to propose hypotheses with confidence levels, persist them in a new `Diagnostic` record, and let Mathieu record the chosen action, result, and conclusion on a dedicated `/diagnostics` page.

**Architecture:** New Dexie table `diagnostics` (model `Diagnostic`) added via a fresh `version(10)` migration (no change to historic version definitions). A new pure service `diagnosticService.ts` builds the Gemini prompt from journal/weather/season data and parses the response; a thin orchestrator wires it to the existing `geminiService.callGemini`. A "Diagnostiquer" button on `JournalPage` (next to `probleme` entries) and a new `DiagnosticsPage.tsx` (route `/diagnostics`) cover trigger and review/edit. Sync hooks gain the new table for free by adding it to the existing generic `TABLE_NAMES` list in `syncHooks.ts`.

**Tech Stack:** React 19, TypeScript, Dexie (IndexedDB), Vitest + Testing Library, existing `geminiService.ts` (Gemini REST), `weatherService.ts` (Open-Meteo), `seasonSummaryService.ts` / `seasonNotesService.ts` (multi-season history).

---

## File Structure

- Modify `src/data/model.ts`: add `HypothesisConfidence`, `DiagnosticHypothesis`, `Diagnostic` types.
- Modify `src/data/db.ts`: add `version(10)` with the `diagnostics` store, add the `diagnostics` Table property.
- Modify `src/data/syncHooks.ts`: add `'diagnostics'` to `TABLE_NAMES`.
- Create `src/services/diagnosticService.ts`: pure prompt-building + response-parsing + CRUD helpers (no network call inside — network call delegated to `geminiService.callGemini`, called from the page).
- Create `src/services/diagnosticService.test.ts`.
- Create `src/pages/DiagnosticsPage.tsx`: list + inline editing of action/result/conclusion, "Diagnostiquer" trigger for entries without a diagnostic yet.
- Create `src/pages/DiagnosticsPage.test.tsx`.
- Modify `src/pages/JournalPage.tsx`: add a "Diagnostiquer" button under `probleme` entries (links to `/diagnostics` after creating, or just navigates if one already exists).
- Modify `src/pages/GardenPage.tsx`: add a `Link to="/diagnostics"` entry point (same pattern as `/bilan`, `/calendrier`).
- Modify `src/App.tsx`: add the `diagnostics` route.
- Modify `src/services/exportService.test.ts`: bump expected `version` from `9` to `10`.

---

## Task 1: Data model — `Diagnostic` type

**Files:**
- Modify: `src/data/model.ts`

- [ ] **Step 1: Add the types**

Add this block after the `SeasonNote` interface (end of file):

```ts
export type HypothesisConfidence = 'faible' | 'moyen' | 'eleve'

export interface DiagnosticHypothesis {
  text: string
  indices: string
  confidence: HypothesisConfidence
}

export type DiagnosticStatus = 'ouvert' | 'clos'

export interface Diagnostic {
  id?: string
  problemEntryId: string
  cropId?: string
  parcelId?: string
  treeId?: string
  createdAt: number // epoch ms
  hypotheses: DiagnosticHypothesis[]
  chosenAction?: string
  result?: string
  conclusion?: string
  status: DiagnosticStatus
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/model.ts
git commit -m "feat(model): ajouter le type Diagnostic pour le bloc IA"
```

---

## Task 2: Dexie table `diagnostics`

**Files:**
- Modify: `src/data/db.ts`
- Test: `src/data/db.migration.test.ts`

- [ ] **Step 1: Write the failing test**

Read `src/data/db.migration.test.ts` first to match its existing style (it likely opens a fresh Dexie instance and checks `db.verno` / table presence). Add a test case:

```ts
it('cree la table diagnostics en version 10', async () => {
  await db.diagnostics.add({
    id: newId(),
    problemEntryId: 'p1',
    createdAt: 1,
    hypotheses: [],
    status: 'ouvert',
  })
  const rows = await db.diagnostics.toArray()
  expect(rows).toHaveLength(1)
  expect(db.verno).toBe(10)
})
```

Adjust imports (`db`, `newId` from `'../data/db'`) to match the file's existing import style.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/db.migration.test.ts`
Expected: FAIL — `db.diagnostics` is `undefined` (property doesn't exist) or `db.verno` is `9`.

- [ ] **Step 3: Implement the migration**

In `src/data/db.ts`:

1. Add `Diagnostic` to the model import:
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
  Diagnostic,
} from './model'
```

2. Add the Table property inside the `PotagerDB` class, alongside the others:
```ts
diagnostics!: Table<Diagnostic, string>
```

3. Add a new `version(10)` call right after the existing `version(9)` block (do NOT touch `TABLE_NAMES`, `FINAL_STORES`, or any version below 10 — those are historic migrations already applied on real devices):

```ts
    this.version(10).stores({
      diagnostics: 'id, problemEntryId, cropId, parcelId, treeId, status, createdAt, updatedAt',
    })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/db.migration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/db.ts src/data/db.migration.test.ts
git commit -m "feat(db): migration version 10, table diagnostics"
```

---

## Task 3: Sync hooks pour la table `diagnostics`

**Files:**
- Modify: `src/data/syncHooks.ts`

- [ ] **Step 1: Ajouter la table à la liste générique**

Dans `src/data/syncHooks.ts`, ajouter `'diagnostics'` à la fin du tableau `TABLE_NAMES` :

```ts
const TABLE_NAMES = [
  'log',
  'parcels',
  'crops',
  'oyas',
  'trees',
  'tanks',
  'catalog',
  'expenses',
  'soil',
  'settings',
  'varieties',
  'seasonNotes',
  'diagnostics',
] as const
```

Aucune autre modification nécessaire : les hooks `creating`/`updating`/`reading` et le patch de
`toArray` s'appliquent déjà génériquement à toutes les entrées de `TABLE_NAMES`.

- [ ] **Step 2: Vérifier qu'aucun test existant ne casse**

Run: `npx vitest run src/data/syncHooks.test.ts`
Expected: PASS (le fichier de test existant ne fige pas la longueur de `TABLE_NAMES`).

- [ ] **Step 3: Commit**

```bash
git add src/data/syncHooks.ts
git commit -m "feat(sync): inclure diagnostics dans la synchro Firestore"
```

---

## Task 4: Bump de version attendue dans `exportService.test.ts`

**Files:**
- Modify: `src/services/exportService.test.ts:14`

- [ ] **Step 1: Mettre à jour l'assertion**

Changer :
```ts
expect(dump.version).toBe(9)
```
en :
```ts
expect(dump.version).toBe(10)
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/services/exportService.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/services/exportService.test.ts
git commit -m "test(export): mettre a jour la version attendue (10) apres ajout diagnostics"
```

---

## Task 5: `diagnosticService.ts` — construction du contexte et du prompt

**Files:**
- Create: `src/services/diagnosticService.ts`
- Test: `src/services/diagnosticService.test.ts`

Ce service est **pur** : pas d'appel réseau ni Dexie dedans (suit le pattern de
`voiceParseService.ts`). Il construit le prompt à partir de données déjà chargées par
l'appelant, et parse la réponse texte de Gemini en `DiagnosticHypothesis[]`.

- [ ] **Step 1: Write the failing test — construction du prompt**

```ts
import { describe, it, expect } from 'vitest'
import { buildDiagnosticPrompt, parseDiagnosticResponse } from './diagnosticService'
import type { GardenLogEntry } from '../data/model'

describe('buildDiagnosticPrompt', () => {
  it('inclut le probleme, la fenetre de 14 jours et l historique multi-saisons', () => {
    const problemEntry: GardenLogEntry = {
      id: 'e1',
      type: 'probleme',
      date: '2026-06-20',
      description: 'feuilles jaunes sur les tomates',
      cropId: 'crop1',
      createdAt: 1,
    }
    const recentEntries: GardenLogEntry[] = [
      { id: 'e2', type: 'arrosage', date: '2026-06-18', volumeLiters: 10, cropId: 'crop1', createdAt: 1 },
    ]
    const prompt = buildDiagnosticPrompt({
      problemEntry,
      recentEntries,
      weatherSummary: 'Pluie quasi nulle sur 14 jours, pic a 32 degres le 2026-06-15.',
      seasonHistory: ['2025 : mildiou note fin juillet sur la meme culture.'],
    })

    expect(prompt).toContain('feuilles jaunes sur les tomates')
    expect(prompt).toContain('Pluie quasi nulle sur 14 jours')
    expect(prompt).toContain('mildiou note fin juillet')
    expect(prompt).toContain('arrosage')
    expect(prompt).toContain('faible, moyen ou eleve')
  })
})

describe('parseDiagnosticResponse', () => {
  it('parse un tableau JSON valide en hypotheses', () => {
    const raw = JSON.stringify([
      { text: 'Stress hydrique', indices: 'Peu de pluie, forte chaleur', confidence: 'eleve' },
      { text: 'Carence azotee', indices: 'Jaunissement progressif des feuilles basses', confidence: 'faible' },
    ])
    const result = parseDiagnosticResponse(raw)
    expect(result).toEqual([
      { text: 'Stress hydrique', indices: 'Peu de pluie, forte chaleur', confidence: 'eleve' },
      { text: 'Carence azotee', indices: 'Jaunissement progressif des feuilles basses', confidence: 'faible' },
    ])
  })

  it('ignore les entrees avec une confiance invalide et garde les autres', () => {
    const raw = JSON.stringify([
      { text: 'Bonne hypothese', indices: 'Indice valable', confidence: 'moyen' },
      { text: 'Mauvaise', indices: 'x', confidence: 'extreme' },
    ])
    const result = parseDiagnosticResponse(raw)
    expect(result).toEqual([{ text: 'Bonne hypothese', indices: 'Indice valable', confidence: 'moyen' }])
  })

  it('leve une erreur lisible si la reponse n est pas un JSON exploitable', () => {
    expect(() => parseDiagnosticResponse('texte libre sans JSON')).toThrow(
      'Réponse Gemini illisible pour le diagnostic',
    )
  })

  it('leve une erreur si aucune hypothese valide n a survecu au parsing', () => {
    const raw = JSON.stringify([{ text: 'x', indices: 'y', confidence: 'extreme' }])
    expect(() => parseDiagnosticResponse(raw)).toThrow('Réponse Gemini illisible pour le diagnostic')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/diagnosticService.test.ts`
Expected: FAIL — `diagnosticService` module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { DiagnosticHypothesis, GardenLogEntry, HypothesisConfidence } from '../data/model'

const VALID_CONFIDENCES: HypothesisConfidence[] = ['faible', 'moyen', 'eleve']

export interface DiagnosticPromptInput {
  problemEntry: GardenLogEntry
  recentEntries: GardenLogEntry[]
  weatherSummary: string
  seasonHistory: string[]
}

function describeEntry(entry: GardenLogEntry): string {
  const parts = [entry.date, entry.type]
  if (entry.description) parts.push(entry.description)
  if (typeof entry.volumeLiters === 'number') parts.push(`${entry.volumeLiters} L`)
  if (typeof entry.quantityKg === 'number') parts.push(`${entry.quantityKg} kg`)
  return parts.join(' - ')
}

/**
 * Construit le prompt envoye a Gemini pour proposer des hypotheses face a un probleme.
 * Fonction pure : tout le contexte (entrees recentes, resume meteo, historique multi-saisons)
 * est deja assemble par l'appelant (page/orchestrateur), rien n'est lu ici depuis Dexie.
 */
export function buildDiagnosticPrompt(input: DiagnosticPromptInput): string {
  const { problemEntry, recentEntries, weatherSummary, seasonHistory } = input

  const recentLines =
    recentEntries.length > 0
      ? recentEntries.map((e) => `- ${describeEntry(e)}`).join('\n')
      : '(aucune action ou observation notee dans les 14 derniers jours)'

  const historyLines =
    seasonHistory.length > 0
      ? seasonHistory.map((line) => `- ${line}`).join('\n')
      : '(aucun historique de saison precedente disponible pour cette culture/variete)'

  return [
    'Tu es un assistant de jardinage. Un probleme a ete note dans le journal :',
    `"${problemEntry.description ?? '(pas de description)'}" le ${problemEntry.date}.`,
    '',
    'Contexte meteo des 14 derniers jours :',
    weatherSummary,
    '',
    'Actions et observations des 14 derniers jours sur la meme culture/parcelle :',
    recentLines,
    '',
    'Historique des saisons precedentes sur la meme culture ou variete :',
    historyLines,
    '',
    'Propose entre 2 et 4 hypotheses plausibles (jamais une certitude). Pour chaque hypothese,',
    'donne le texte, les indices precis du contexte ci-dessus qui la soutiennent, et un niveau',
    'de confiance qui doit etre exactement l un de ces trois mots : faible, moyen ou eleve.',
    'Reponds UNIQUEMENT par un tableau JSON d objets { "text", "indices", "confidence" },',
    'sans aucun texte autour.',
  ].join('\n')
}

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return null
  return text.slice(start, end + 1)
}

/**
 * Parse la reponse texte de Gemini en une liste d'hypotheses valides. Toute hypothese dont la
 * confiance ne correspond pas exactement a faible/moyen/eleve est ecartee plutot que corrigee :
 * mieux vaut perdre une hypothese douteuse que d'afficher une confiance inventee.
 */
export function parseDiagnosticResponse(raw: string): DiagnosticHypothesis[] {
  const jsonText = extractJsonArray(raw)
  if (!jsonText) throw new Error('Réponse Gemini illisible pour le diagnostic')

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('Réponse Gemini illisible pour le diagnostic')
  }

  if (!Array.isArray(parsed)) throw new Error('Réponse Gemini illisible pour le diagnostic')

  const hypotheses: DiagnosticHypothesis[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue
    const { text, indices, confidence } = item as Record<string, unknown>
    if (typeof text !== 'string' || text.trim() === '') continue
    if (typeof indices !== 'string' || indices.trim() === '') continue
    if (typeof confidence !== 'string' || !VALID_CONFIDENCES.includes(confidence as HypothesisConfidence)) {
      continue
    }
    hypotheses.push({ text, indices, confidence: confidence as HypothesisConfidence })
  }

  if (hypotheses.length === 0) throw new Error('Réponse Gemini illisible pour le diagnostic')
  return hypotheses
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/diagnosticService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/diagnosticService.ts src/services/diagnosticService.test.ts
git commit -m "feat(diagnostic): prompt et parsing des hypotheses Gemini"
```

---

## Task 6: CRUD `Diagnostic` (Dexie)

**Files:**
- Modify: `src/services/diagnosticService.ts`
- Modify: `src/services/diagnosticService.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/services/diagnosticService.test.ts` (needs `db`/`newId`, mirrors `seasonNotesService.test.ts` setup style — check that file for the `beforeEach(() => db.tables...clear())` pattern and reuse it):

```ts
import { db, newId } from '../data/db'
import {
  createDiagnostic,
  getDiagnosticForEntry,
  updateDiagnosticOutcome,
} from './diagnosticService'

describe('createDiagnostic / getDiagnosticForEntry', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('cree un diagnostic ouvert lie a l entree probleme', async () => {
    const hypotheses = [{ text: 'Stress hydrique', indices: 'Peu de pluie', confidence: 'eleve' as const }]
    const id = await createDiagnostic({ problemEntryId: 'p1', cropId: 'c1', hypotheses })

    const found = await getDiagnosticForEntry('p1')
    expect(found?.id).toBe(id)
    expect(found?.status).toBe('ouvert')
    expect(found?.hypotheses).toEqual(hypotheses)
  })

  it('renvoie le diagnostic existant plutot que d en creer un second pour la meme entree', async () => {
    const hypotheses = [{ text: 'A', indices: 'B', confidence: 'moyen' as const }]
    const firstId = await createDiagnostic({ problemEntryId: 'p2', hypotheses })
    const all = await db.diagnostics.toArray()
    expect(all).toHaveLength(1)

    const again = await getDiagnosticForEntry('p2')
    expect(again?.id).toBe(firstId)
  })
})

describe('updateDiagnosticOutcome', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('reste ouvert si seul le resultat est rempli', async () => {
    const id = await createDiagnostic({ problemEntryId: 'p3', hypotheses: [] })
    await updateDiagnosticOutcome(id, { chosenAction: 'Arrosage augmente', result: 'Feuilles reverdies' })
    const row = await db.diagnostics.get(id)
    expect(row?.status).toBe('ouvert')
  })

  it('passe a clos quand resultat et conclusion sont tous les deux remplis', async () => {
    const id = await createDiagnostic({ problemEntryId: 'p4', hypotheses: [] })
    await updateDiagnosticOutcome(id, {
      chosenAction: 'Arrosage augmente',
      result: 'Feuilles reverdies',
      conclusion: 'Surveiller l arrosage plus tot l an prochain',
    })
    const row = await db.diagnostics.get(id)
    expect(row?.status).toBe('clos')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/diagnosticService.test.ts`
Expected: FAIL — `createDiagnostic`, `getDiagnosticForEntry`, `updateDiagnosticOutcome` not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/services/diagnosticService.ts`:

```ts
import { db, newId } from '../data/db'
import type { Diagnostic } from '../data/model'

export interface CreateDiagnosticInput {
  problemEntryId: string
  cropId?: string
  parcelId?: string
  treeId?: string
  hypotheses: DiagnosticHypothesis[]
}

/**
 * Cree un Diagnostic ouvert pour une entree probleme, sauf s il en existe deja un : un seul
 * diagnostic par entree probleme (voir spec section 4).
 */
export async function createDiagnostic(input: CreateDiagnosticInput): Promise<string> {
  const existing = await getDiagnosticForEntry(input.problemEntryId)
  if (existing) return existing.id as string

  const id = newId()
  const diagnostic: Diagnostic = {
    id,
    problemEntryId: input.problemEntryId,
    cropId: input.cropId,
    parcelId: input.parcelId,
    treeId: input.treeId,
    createdAt: Date.now(),
    hypotheses: input.hypotheses,
    status: 'ouvert',
  }
  await db.diagnostics.add(diagnostic)
  return id
}

export async function getDiagnosticForEntry(problemEntryId: string): Promise<Diagnostic | undefined> {
  return db.diagnostics.toCollection().filter((d) => d.problemEntryId === problemEntryId).first()
}

export interface DiagnosticOutcome {
  chosenAction?: string
  result?: string
  conclusion?: string
}

/**
 * Met a jour action/resultat/conclusion sur un diagnostic. Passe automatiquement le statut a
 * 'clos' des que resultat ET conclusion sont non vides (cf. spec section 4) ; reste 'ouvert'
 * sinon, y compris si l un des deux redevient vide apres une correction.
 */
export async function updateDiagnosticOutcome(id: string, outcome: DiagnosticOutcome): Promise<void> {
  const closed = (outcome.result ?? '').trim() !== '' && (outcome.conclusion ?? '').trim() !== ''
  await db.diagnostics.update(id, {
    chosenAction: outcome.chosenAction,
    result: outcome.result,
    conclusion: outcome.conclusion,
    status: closed ? 'clos' : 'ouvert',
  })
}
```

Also add `DiagnosticHypothesis` to the type-only import already present at the top of the file
(`import type { DiagnosticHypothesis, GardenLogEntry, HypothesisConfidence } from '../data/model'`
already covers this from Task 5 — no duplicate import).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/diagnosticService.test.ts`
Expected: PASS (all describe blocks from Task 5 and Task 6)

- [ ] **Step 5: Commit**

```bash
git add src/services/diagnosticService.ts src/services/diagnosticService.test.ts
git commit -m "feat(diagnostic): CRUD createDiagnostic/getDiagnosticForEntry/updateDiagnosticOutcome"
```

---

## Task 7: Page `/diagnostics` — liste et édition inline

**Files:**
- Create: `src/pages/DiagnosticsPage.tsx`
- Create: `src/pages/DiagnosticsPage.test.tsx`
- Modify: `src/App.tsx`

This page lists existing `Diagnostic` rows (open first, then closed) and lets Mathieu edit
`chosenAction` / `result` / `conclusion` inline (textarea, save on blur — same pattern as
`CropNoteField` in `SeasonSummaryPage.tsx`). It does **not** trigger new Gemini calls — that
happens from `JournalPage` (Task 8). Read `src/pages/SeasonSummaryPage.tsx` in full before
writing this task, to match its exact textarea/labels/styling conventions.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db, newId } from '../data/db'
import { DiagnosticsPage } from './DiagnosticsPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('DiagnosticsPage', () => {
  it('affiche un message vide quand il n y a aucun diagnostic', async () => {
    render(<MemoryRouter><DiagnosticsPage /></MemoryRouter>)
    expect(await screen.findByText(/aucun diagnostic/i)).toBeInTheDocument()
  })

  it('affiche les hypotheses avec leur niveau de confiance et permet de cloturer', async () => {
    await db.log.add({
      id: 'entry1',
      type: 'probleme',
      date: '2026-06-20',
      description: 'feuilles jaunes',
      createdAt: 1,
    })
    await db.diagnostics.add({
      id: newId(),
      problemEntryId: 'entry1',
      createdAt: 1,
      hypotheses: [{ text: 'Stress hydrique', indices: 'Peu de pluie', confidence: 'eleve' }],
      status: 'ouvert',
    })

    render(<MemoryRouter><DiagnosticsPage /></MemoryRouter>)

    expect(await screen.findByText('Stress hydrique')).toBeInTheDocument()
    expect(screen.getByText('eleve')).toBeInTheDocument()
    expect(screen.getByText('feuilles jaunes')).toBeInTheDocument()

    const resultField = screen.getByLabelText(/résultat observé/i)
    fireEvent.change(resultField, { target: { value: 'Feuilles reverdies' } })
    fireEvent.blur(resultField)

    const conclusionField = screen.getByLabelText(/conclusion/i)
    fireEvent.change(conclusionField, { target: { value: 'Arroser plus tot l an prochain' } })
    fireEvent.blur(conclusionField)

    await waitFor(async () => {
      const rows = await db.diagnostics.toArray()
      expect(rows[0].status).toBe('clos')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/DiagnosticsPage.test.tsx`
Expected: FAIL — module `./DiagnosticsPage` not found.

- [ ] **Step 3: Write the implementation**

```tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Stethoscope } from 'lucide-react'
import { db } from '../data/db'
import { updateDiagnosticOutcome } from '../services/diagnosticService'
import type { Diagnostic, GardenLogEntry, HypothesisConfidence } from '../data/model'

const CONFIDENCE_CLASS: Record<HypothesisConfidence, string> = {
  faible: 'bg-gray-100 text-gray-700',
  moyen: 'bg-amber-100 text-amber-800',
  eleve: 'bg-red-100 text-red-800',
}

function OutcomeFields({ diagnostic }: { diagnostic: Diagnostic }) {
  const [action, setAction] = useState(diagnostic.chosenAction ?? '')
  const [result, setResult] = useState(diagnostic.result ?? '')
  const [conclusion, setConclusion] = useState(diagnostic.conclusion ?? '')

  async function save(next: { chosenAction?: string; result?: string; conclusion?: string }) {
    await updateDiagnosticOutcome(diagnostic.id as string, {
      chosenAction: action,
      result,
      conclusion,
      ...next,
    })
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-gray-600">
        Action choisie
        <textarea
          aria-label="Action choisie"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onBlur={() => save({ chosenAction: action })}
          rows={2}
          className="w-full rounded border border-green-200 px-2 py-1 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-600">
        Résultat observé
        <textarea
          aria-label="Résultat observé"
          value={result}
          onChange={(e) => setResult(e.target.value)}
          onBlur={() => save({ result })}
          rows={2}
          className="w-full rounded border border-green-200 px-2 py-1 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-600">
        Conclusion pour l'an prochain
        <textarea
          aria-label="Conclusion pour l'an prochain"
          value={conclusion}
          onChange={(e) => setConclusion(e.target.value)}
          onBlur={() => save({ conclusion })}
          rows={2}
          className="w-full rounded border border-green-200 px-2 py-1 text-sm"
        />
      </label>
    </div>
  )
}

function DiagnosticCard({ diagnostic, problem }: { diagnostic: Diagnostic; problem?: GardenLogEntry }) {
  return (
    <li className="rounded-2xl bg-white px-4 py-3 shadow-sm">
      <p className="text-sm font-medium text-green-950">
        {problem?.description ?? 'Problème'}
        <span className="ml-2 text-xs font-normal text-green-700/60">{problem?.date}</span>
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {diagnostic.hypotheses.map((h, i) => (
          <li key={i} className="rounded-lg bg-green-50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-green-950">{h.text}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${CONFIDENCE_CLASS[h.confidence]}`}>
                {h.confidence}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-green-700/80">{h.indices}</p>
          </li>
        ))}
      </ul>
      <OutcomeFields diagnostic={diagnostic} />
    </li>
  )
}

export function DiagnosticsPage() {
  const diagnostics = useLiveQuery(() => db.diagnostics.toArray(), [], [])
  const entries = useLiveQuery(() => db.log.toArray(), [], [])
  const entryById = new Map(entries.map((e) => [e.id, e] as [string | undefined, GardenLogEntry]))

  const open = diagnostics.filter((d) => d.status === 'ouvert').sort((a, b) => b.createdAt - a.createdAt)
  const closed = diagnostics.filter((d) => d.status === 'clos').sort((a, b) => b.createdAt - a.createdAt)

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-green-100 text-green-700">
          <Stethoscope className="size-5" />
        </span>
        <h1 className="text-xl font-semibold text-green-950">Diagnostics</h1>
      </header>

      {diagnostics.length === 0 && (
        <p className="text-sm text-green-700/80">
          Aucun diagnostic pour le moment. Lance une analyse depuis une entrée « problème » du
          journal.
        </p>
      )}

      {open.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-green-900">Ouverts</h2>
          <ul className="flex flex-col gap-3">
            {open.map((d) => (
              <DiagnosticCard key={d.id} diagnostic={d} problem={entryById.get(d.problemEntryId)} />
            ))}
          </ul>
        </div>
      )}

      {closed.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-green-900">Clos</h2>
          <ul className="flex flex-col gap-3">
            {closed.map((d) => (
              <DiagnosticCard key={d.id} diagnostic={d} problem={entryById.get(d.problemEntryId)} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
```

Then in `src/App.tsx`, add the import and route:

```ts
import { DiagnosticsPage } from './pages/DiagnosticsPage'
```
```tsx
<Route path="diagnostics" element={<DiagnosticsPage />} />
```
(place it next to `bilan`/`calendrier` routes)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/DiagnosticsPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/DiagnosticsPage.tsx src/pages/DiagnosticsPage.test.tsx src/App.tsx
git commit -m "feat(diagnostic): page /diagnostics, liste et edition inline"
```

---

## Task 8: Lien depuis GardenPage

**Files:**
- Modify: `src/pages/GardenPage.tsx`

- [ ] **Step 1: Ajouter le lien**

Read `src/pages/GardenPage.tsx` around line 191-194 (the existing `/bilan` and `/calendrier`
links) and add, right after the `/calendrier` link, following the exact same JSX pattern:

```tsx
<Link to="/diagnostics" className="mt-2 block text-sm font-medium text-green-700">
  Diagnostics →
</Link>
```

- [ ] **Step 2: Vérification visuelle**

Lancer le serveur de dev (`npm run dev`), ouvrir `/jardin`, vérifier que le lien "Diagnostics"
apparaît et mène à une page `/diagnostics` qui affiche bien "Aucun diagnostic pour le moment."
sur une base vide.

- [ ] **Step 3: Commit**

```bash
git add src/pages/GardenPage.tsx
git commit -m "feat(diagnostic): lien Diagnostics depuis la page Jardin"
```

---

## Task 9: Bouton "Diagnostiquer" sur les entrées `probleme` du journal

**Files:**
- Modify: `src/pages/JournalPage.tsx`
- Create: `src/services/diagnosticContext.ts`
- Create: `src/services/diagnosticContext.test.ts`
- Modify: `src/services/diagnosticService.ts` (export already covers `buildDiagnosticPrompt`)

This task assembles the actual context (14-day weather + season history) and wires the Gemini
call. Splitting it into its own `diagnosticContext.ts` keeps `JournalPage.tsx` free of business
logic, matching the existing split between `JournalPage.tsx` (rendering) and
`weatherSummary.ts`/`logService.ts` (logic).

- [ ] **Step 1: Write the failing test for the history-line builder**

```ts
import { describe, it, expect } from 'vitest'
import { buildSeasonHistoryLines } from './diagnosticContext'
import type { SeasonNote, Diagnostic } from '../data/model'

describe('buildSeasonHistoryLines', () => {
  it('combine les notes de saison et les diagnostics clos de la meme culture', () => {
    const notes: SeasonNote[] = [
      { id: 'n1', year: 2025, cropId: 'crop1', text: 'Mildiou fin juillet' },
      { id: 'n2', year: 2025, cropId: 'crop2', text: 'Sans rapport' },
    ]
    const diagnostics: Diagnostic[] = [
      {
        id: 'd1',
        problemEntryId: 'e0',
        cropId: 'crop1',
        createdAt: 1,
        hypotheses: [],
        status: 'clos',
        conclusion: 'Traiter preventivement plus tot',
      },
    ]
    const lines = buildSeasonHistoryLines({ cropId: 'crop1', notes, diagnostics })
    expect(lines).toEqual([
      '2025 : Mildiou fin juillet',
      'Diagnostic precedent conclu : Traiter preventivement plus tot',
    ])
  })

  it('renvoie un tableau vide si rien ne correspond a la culture', () => {
    const lines = buildSeasonHistoryLines({ cropId: 'crop9', notes: [], diagnostics: [] })
    expect(lines).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/diagnosticContext.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `diagnosticContext.ts`**

```ts
import type { Diagnostic, SeasonNote } from '../data/model'

export interface SeasonHistoryInput {
  cropId?: string
  notes: SeasonNote[]
  diagnostics: Diagnostic[]
}

/**
 * Assemble les lignes d'historique multi-saisons envoyees a Gemini : notes de bilan de saison
 * (seasonNotesService) et conclusions des diagnostics deja clos, filtrees sur la meme culture.
 * Pas de filtrage par variete ici : les notes de saison ne portent que cropId/parcelId
 * (cf. data/model.ts SeasonNote), donc l agregation se fait au niveau culture.
 */
export function buildSeasonHistoryLines(input: SeasonHistoryInput): string[] {
  const { cropId, notes, diagnostics } = input
  if (!cropId) return []

  const noteLines = notes
    .filter((n) => n.cropId === cropId)
    .map((n) => `${n.year} : ${n.text}`)

  const diagnosticLines = diagnostics
    .filter((d) => d.cropId === cropId && d.status === 'clos' && d.conclusion)
    .map((d) => `Diagnostic precedent conclu : ${d.conclusion}`)

  return [...noteLines, ...diagnosticLines]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/diagnosticContext.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/diagnosticContext.ts src/services/diagnosticContext.test.ts
git commit -m "feat(diagnostic): assembler l historique multi-saisons pour le prompt"
```

- [ ] **Step 6: Wire the button into `JournalPage.tsx`**

Read `src/pages/JournalPage.tsx` in full (already shown above) before editing. Add, inside the
`<li>` for each entry, right after the existing `WeatherContextBanner`/`PhotoThumbs` block and
only for `entry.type === 'probleme'`, a small inline component that:
1. Checks via `getDiagnosticForEntry(entry.id)` whether a diagnostic already exists for this
   entry (use `useLiveQuery`).
2. If yes: renders a `Link to="/diagnostics"` saying "Voir le diagnostic →".
3. If no: renders a "Diagnostiquer" button. On click: builds the 14-day window from `history`
   (already loaded in `JournalPage`) via `summarizeWeather` (already imported), assembles
   `recentEntries` by filtering `entries` to the same `cropId`/`parcelId` within the last 14
   days, calls `buildSeasonHistoryLines` (needs `db.seasonNotes.toArray()` and
   `db.diagnostics.toArray()`, both loaded via `useLiveQuery` at the top of `JournalPage`), then
   `buildDiagnosticPrompt`, then `callGemini` (needs `getSettings().geminiApiKey`), then
   `parseDiagnosticResponse`, then `createDiagnostic`. On success, shows "Voir le diagnostic →".
   On failure (network/key/parse error caught), shows the error message inline with a "Réessayer"
   button (do not create a `Diagnostic` row on failure — `createDiagnostic` is only called after
   `parseDiagnosticResponse` succeeds).

Concretely, add this component above `export function JournalPage()`:

```tsx
function DiagnoseButton({
  entry,
  history,
  entries,
  seasonNotes,
  diagnostics,
  geminiApiKey,
}: {
  entry: GardenLogEntry
  history: DailyWeather[] | null
  entries: GardenLogEntry[]
  seasonNotes: SeasonNote[]
  diagnostics: Diagnostic[]
  geminiApiKey: string | undefined
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const existing = diagnostics.find((d) => d.problemEntryId === entry.id)
  if (existing) {
    return (
      <Link to="/diagnostics" className="text-xs font-medium text-green-700">
        Voir le diagnostic →
      </Link>
    )
  }

  async function diagnose() {
    if (!geminiApiKey) {
      setStatus('error')
      setError('Aucune clé Gemini configurée dans les réglages.')
      return
    }
    setStatus('loading')
    setError(null)
    try {
      const cutoff = new Date(entry.date)
      cutoff.setDate(cutoff.getDate() - 14)
      const cutoffISO = cutoff.toISOString().slice(0, 10)
      const recentEntries = entries.filter(
        (e) =>
          e.date >= cutoffISO &&
          e.date <= entry.date &&
          (e.cropId === entry.cropId || e.parcelId === entry.parcelId),
      )
      const weatherSummary = history
        ? `Pluie cumulee 14 jours : ${history
            .slice(-14)
            .reduce((sum, d) => sum + d.rainMm, 0)
            .toFixed(1)} mm. Temperature max recente : ${Math.max(
            ...history.slice(-14).map((d) => d.tempMaxC),
          )} °C.`
        : 'Donnees meteo indisponibles.'
      const seasonHistory = buildSeasonHistoryLines({ cropId: entry.cropId, notes: seasonNotes, diagnostics })
      const prompt = buildDiagnosticPrompt({ problemEntry: entry, recentEntries, weatherSummary, seasonHistory })
      const raw = await callGemini(prompt, geminiApiKey)
      const hypotheses = parseDiagnosticResponse(raw)
      await createDiagnostic({
        problemEntryId: entry.id as string,
        cropId: entry.cropId,
        parcelId: entry.parcelId,
        treeId: entry.treeId,
        hypotheses,
      })
      setStatus('idle')
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={diagnose}
        disabled={status === 'loading'}
        className="text-xs font-medium text-green-700 disabled:opacity-50"
      >
        {status === 'loading' ? 'Analyse en cours…' : 'Diagnostiquer'}
      </button>
      {status === 'error' && error && (
        <p className="mt-1 text-xs text-red-700">{error} <button type="button" onClick={diagnose} className="font-medium underline">Réessayer</button></p>
      )}
    </div>
  )
}
```

Add the needed imports at the top of `JournalPage.tsx`:
```ts
import { useState } from 'react' // merge with existing `useEffect, useState` import
import { db, newId as _unused } from '../data/db' // db already imported; do not re-import
import { callGemini } from '../services/geminiService'
import {
  buildDiagnosticPrompt,
  parseDiagnosticResponse,
  createDiagnostic,
} from '../services/diagnosticService'
import { buildSeasonHistoryLines } from '../services/diagnosticContext'
import type { Diagnostic, SeasonNote } from '../data/model'
```
(Remove the unused `_unused` import shown above — `newId` is not needed in `JournalPage.tsx`;
that line is illustrative only, do not actually add it.)

In the `JournalPage` function body, add two more `useLiveQuery` calls next to the existing ones:
```ts
const seasonNotes = useLiveQuery(() => db.seasonNotes.toArray(), [], [])
const diagnostics = useLiveQuery(() => db.diagnostics.toArray(), [], [])
```

In the entry rendering `<li>`, right after the `{entry.photoUrls && ...}` block, add:
```tsx
{entry.type === 'probleme' && (
  <DiagnoseButton
    entry={entry}
    history={history}
    entries={entries}
    seasonNotes={seasonNotes}
    diagnostics={diagnostics}
    geminiApiKey={settings?.geminiApiKey}
  />
)}
```

- [ ] **Step 7: Manual verification in preview (no automated test for this wiring step — it's UI glue over already-tested pure functions)**

Run `npm run dev`, open `/journal`, create a `probleme` entry (via `/ajouter`), confirm the
"Diagnostiquer" button appears under it. If a Gemini key is configured in réglages, click it and
confirm either hypotheses appear (navigate to `/diagnostics` to see them) or a clear error
message shows if the call fails. Clean up any test data created.

- [ ] **Step 8: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all existing + new tests)

- [ ] **Step 9: Run lint and build**

Run: `npm run lint && npm run build`
Expected: both succeed with no errors

- [ ] **Step 10: Commit**

```bash
git add src/pages/JournalPage.tsx
git commit -m "feat(diagnostic): bouton Diagnostiquer sur les entrees probleme du journal"
```

---

## Task 10: Vérification finale en preview navigateur

**Files:** none (verification only)

- [ ] **Step 1: Scénario complet**

Avec `npm run dev` :
1. Créer une entrée `probleme` réaliste (ex: "feuilles jaunes sur les tomates") liée à une
   culture existante.
2. Cliquer "Diagnostiquer" depuis `/journal`.
3. Vérifier sur `/diagnostics` que les hypothèses s'affichent avec leur badge de confiance et
   leurs indices.
4. Remplir action/résultat puis conclusion, vérifier que la carte passe en section "Clos".
5. Nettoyer les données de test créées (entrée journal + diagnostic).

- [ ] **Step 2: Rapport**

Confirmer à Mathieu que le scénario fonctionne de bout en bout, avec capture d'écran si pertinent.

---

## Self-Review Notes

- **Spec coverage** : déclenchement auto+manuel (Task 9 + lien existant `/diagnostics` réutilisable
  depuis une entrée passée déjà couverte par le rendu générique de `JournalPage`), contexte
  14j + multi-saisons (Task 9 + Task 9 step 6), entité `Diagnostic` dédiée (Task 1-2), page
  `/diagnostics` (Task 7-8), gestion d'erreur Gemini sans création de ligne partielle (Task 9 —
  `createDiagnostic` appelé seulement après `parseDiagnosticResponse` réussi), garde-fous IA
  (aucune écriture automatique : le bouton est toujours un clic explicite).
- **Hors périmètre respecté** : pas de suggestion d'action par Gemini (texte libre uniquement
  dans `OutcomeFields`), pas de relance automatique (pas de `reminderService` touché), pas de
  score chiffré (boutons texte uniquement).
