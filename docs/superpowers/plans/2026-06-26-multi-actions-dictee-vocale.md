# Multi-actions à la dictée vocale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `parseVoiceDraft` return an array of drafts instead of one, so a dictated sentence mixing several actions on the same target (ex. "j'ai récolté 3 kilos, j'ai arrosé 20 min les tomates") produces several typed log entries instead of one catch-all note.

**Architecture:** `voiceParseService.ts` asks Gemini for a JSON array (instead of a single object) and parses each element with the existing per-field whitelist logic, now shared by a small per-item helper. `VoiceCapture` routes by draft count: 1 draft → unchanged `/ajouter` flow; 2+ drafts → a new `VoiceReviewPage` showing one summary card per detected action, with Valider/Modifier/Supprimer actions. `Modifier` reuses the existing `EntryForm` (exported from `QuickAddPage.tsx`, not rewritten) as a full-screen overlay.

**Tech Stack:** React + TypeScript, react-router-dom (HashRouter), Dexie (IndexedDB), Vitest + Testing Library, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-06-26-multi-actions-dictee-vocale-design.md`

---

## File Structure

- Modify: `src/services/voiceParseService.ts` — prompt asks for a JSON array; `parseVoiceDraft` → `parseVoiceDrafts` returning `VoiceDraft[]`, capped at 5, with note-fallback on empty/broken input.
- Modify: `src/services/voiceParseService.test.ts` — tests for the array behavior.
- Modify: `src/components/VoiceCapture.tsx` — calls `parseVoiceDrafts`, routes to `/ajouter` (1 draft) or `/revue-vocale` (2+).
- Modify: `src/components/VoiceCapture.test.tsx` — update existing test fixtures to array JSON, add routing tests.
- Modify: `src/services/logView.ts` — broaden `resolveTargetName`'s and export `resolveDetail`'s parameter types from `GardenLogEntry` to `Pick<GardenLogEntry, ...>` so they also accept a `Partial<NewLogEntry>` voice draft.
- Modify: `src/services/logView.test.ts` — test for the newly exported `resolveDetail`.
- Modify: `src/pages/QuickAddPage.tsx` — export `EntryForm`, `configForType`, and `FormConfig` (no behavior change) so `VoiceReviewPage` can reuse them as-is.
- Create: `src/pages/VoiceReviewPage.tsx` — one summary card per draft; Valider/Modifier/Supprimer; navigates to `/journal` once the list is empty.
- Create: `src/pages/VoiceReviewPage.test.tsx`.
- Modify: `src/App.tsx` — register the `revue-vocale` route.

---

### Task 1: `voiceParseService` — array parsing

**Files:**
- Modify: `src/services/voiceParseService.ts`
- Test: `src/services/voiceParseService.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the whole `describe('parseVoiceDraft', ...)` block (and update the `buildVoiceAudioPrompt` test) in `src/services/voiceParseService.test.ts` with:

```typescript
import { describe, expect, it } from 'vitest'
import { LOG_ENTRY_TYPES } from '../data/model'
import { buildVoiceAudioPrompt, parseVoiceDrafts, type GardenCatalog } from './voiceParseService'

const catalog: GardenCatalog = {
  parcels: [{ id: 1, name: 'Parcelle A' }, { id: 2, name: 'Parcelle B' }],
  crops: [{ id: 10, name: 'Tomates' }],
  oyas: [{ id: 20, name: 'Oya nord' }],
  trees: [{ id: 30, name: 'Pommier' }],
}

describe('buildVoiceAudioPrompt', () => {
  it('demande de transcrire l audio, donne la date, tous les types, le catalogue et un tableau', () => {
    const prompt = buildVoiceAudioPrompt(catalog, '2026-06-25')

    expect(prompt.toLowerCase()).toContain('audio')
    expect(prompt.toLowerCase()).toContain('tableau')
    expect(prompt).toContain('2026-06-25')
    for (const type of LOG_ENTRY_TYPES) {
      expect(prompt).toContain(type)
    }
    expect(prompt).toContain('Parcelle A')
    expect(prompt).toContain('1')
    expect(prompt).toContain('Tomates')
    expect(prompt).toContain('10')
  })
})

describe('parseVoiceDrafts', () => {
  const transcript = 'j ai arrose dix litres sur la parcelle A avec des tomates'

  it('range un JSON propre a un seul element (type, volume, parcelId, cropId)', () => {
    const text = JSON.stringify([
      { type: 'arrosage', volumeLiters: 10, parcelId: 1, cropId: 10, time: '08:00' },
    ])
    const drafts = parseVoiceDrafts(text, catalog, transcript)
    expect(drafts).toHaveLength(1)
    const { draft, parsed } = drafts[0]
    expect(parsed).toBe(true)
    expect(draft.type).toBe('arrosage')
    expect(draft.volumeLiters).toBe(10)
    expect(draft.parcelId).toBe(1)
    expect(draft.cropId).toBe(10)
    expect(draft.time).toBe('08:00')
  })

  it('separe une phrase en deux actions distinctes', () => {
    const text = JSON.stringify([
      { type: 'recolte', quantityKg: 3, cropId: 10 },
      { type: 'arrosage', volumeLiters: 20, cropId: 10 },
    ])
    const drafts = parseVoiceDrafts(text, catalog, transcript)
    expect(drafts).toHaveLength(2)
    expect(drafts[0].draft.type).toBe('recolte')
    expect(drafts[0].draft.quantityKg).toBe(3)
    expect(drafts[1].draft.type).toBe('arrosage')
    expect(drafts[1].draft.volumeLiters).toBe(20)
  })

  it('plafonne a 5 actions, le reste est ignore', () => {
    const text = JSON.stringify(
      Array.from({ length: 6 }, (_, i) => ({ type: 'recolte', quantityKg: i + 1 })),
    )
    const drafts = parseVoiceDrafts(text, catalog, transcript)
    expect(drafts).toHaveLength(5)
    expect(drafts.map((d) => d.draft.quantityKg)).toEqual([1, 2, 3, 4, 5])
  })

  it('extrait le tableau JSON meme entoure de texte ou d un bloc markdown', () => {
    const text =
      'Voici les entrees :\n```json\n[{"type":"recolte","quantityKg":2,"cropId":10}]\n```\nVoila.'
    const drafts = parseVoiceDrafts(text, catalog, transcript)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].draft.type).toBe('recolte')
    expect(drafts[0].draft.quantityKg).toBe(2)
    expect(drafts[0].draft.cropId).toBe(10)
  })

  it('ignore un champ inconnu et retombe sur note si le type est invalide', () => {
    const text = JSON.stringify([{ type: 'pas_un_type', foo: 'bar', description: 'coucou' }])
    const { draft } = parseVoiceDrafts(text, catalog, transcript)[0]
    expect(draft.type).toBe('note')
    expect((draft as Record<string, unknown>).foo).toBeUndefined()
    expect(draft.description).toBe('coucou')
  })

  it('rejette un id absent du catalogue mais garde le reste', () => {
    const text = JSON.stringify([{ type: 'arrosage', volumeLiters: 5, parcelId: 999 }])
    const { draft } = parseVoiceDrafts(text, catalog, transcript)[0]
    expect(draft.parcelId).toBeUndefined()
    expect(draft.volumeLiters).toBe(5)
    expect(draft.type).toBe('arrosage')
  })

  it('ignore un nombre non numerique', () => {
    const text = JSON.stringify([{ type: 'arrosage', volumeLiters: 'beaucoup' }])
    const { draft } = parseVoiceDrafts(text, catalog, transcript)[0]
    expect(draft.volumeLiters).toBeUndefined()
  })

  it('repli note + transcript quand le JSON est casse ou absent', () => {
    const drafts = parseVoiceDrafts('aucun json ici', catalog, transcript)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].parsed).toBe(false)
    expect(drafts[0].draft.type).toBe('note')
    expect(drafts[0].draft.description).toBe(transcript)
  })

  it('repli note quand le tableau JSON est vide', () => {
    const drafts = parseVoiceDrafts('[]', catalog, transcript)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].parsed).toBe(false)
    expect(drafts[0].draft.type).toBe('note')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/voiceParseService.test.ts`
Expected: FAIL — `parseVoiceDrafts is not exported` / `parseVoiceDraft` still the only export, prompt doesn't contain "tableau".

- [ ] **Step 3: Rewrite `voiceParseService.ts`**

Replace the whole content of `src/services/voiceParseService.ts` with:

```typescript
// Cœur pur de la voix : construit le prompt Gemini et valide le JSON renvoyé.
// Aucun réseau ici ; callGemini est appelé par l'orchestrateur (VoiceCapture).

import { LOG_ENTRY_TYPES, type LogEntryType } from '../data/model'
import type { NewLogEntry } from './logService'

export interface CatalogEntry {
  id: number
  name: string
}

export interface GardenCatalog {
  parcels: CatalogEntry[]
  crops: CatalogEntry[]
  oyas: CatalogEntry[]
  trees: CatalogEntry[]
}

export interface VoiceDraft {
  draft: Partial<NewLogEntry>
  parsed: boolean
}

const MAX_DRAFTS = 5

function listForPrompt(label: string, entries: CatalogEntry[]): string {
  if (entries.length === 0) return `${label} : (aucun)`
  const items = entries.map((e) => `${e.id} = ${e.name}`).join(', ')
  return `${label} : ${items}`
}

export function buildVoiceAudioPrompt(catalog: GardenCatalog, todayISO: string): string {
  return [
    'Tu reçois un enregistrement audio en français où une personne décrit une ou plusieurs',
    'actions de jardinage. Transcris-le puis transforme-le en entrees de journal structurees.',
    `Date du jour : ${todayISO} (resous "ce matin", "hier", "aujourd hui" par rapport a elle).`,
    '',
    `Types valides (champ "type") : ${LOG_ENTRY_TYPES.join(', ')}.`,
    '',
    'Catalogue du jardin (utilise UNIQUEMENT ces identifiants, jamais d autres) :',
    listForPrompt('Parcelles (parcelId)', catalog.parcels),
    listForPrompt('Cultures (cropId)', catalog.crops),
    listForPrompt('Oyas (oyaId)', catalog.oyas),
    listForPrompt('Arbres (treeId)', catalog.trees),
    '',
    'La phrase peut decrire plusieurs actions distinctes (ex : une recolte puis un arrosage).',
    'Reponds UNIQUEMENT par un tableau JSON d objets, sans texte autour, meme s il n y a qu',
    'une seule action detectee. Chaque objet ne porte que les champs reconnus :',
    'type, date (YYYY-MM-DD), time (HH:mm), title, description,',
    'parcelId, cropId, oyaId, treeId, volumeLiters, rainMm, quantityKg.',
    'Omets tout champ non mentionne dans la phrase.',
    'Une entree peut porter a la fois parcelId et cropId.',
    'Mets toujours dans "description" la transcription de ce qui a ete dit pour cette action.',
    'N invente jamais un identifiant absent du catalogue.',
  ].join('\n')
}

// Listes blanches a garder en phase avec GardenLogEntry (data/model.ts) : un champ
// ajoute la-bas sans l'ajouter ici est simplement ignore dans les brouillons vocaux.
const STRING_FIELDS = ['date', 'time', 'title', 'description'] as const
const NUMBER_FIELDS = ['volumeLiters', 'rainMm', 'quantityKg'] as const
const ID_FIELDS = [
  { field: 'parcelId', list: 'parcels' },
  { field: 'cropId', list: 'crops' },
  { field: 'oyaId', list: 'oyas' },
  { field: 'treeId', list: 'trees' },
] as const

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return null
  return text.slice(start, end + 1)
}

function fallback(transcript: string): VoiceDraft[] {
  return [{ draft: { type: 'note', description: transcript }, parsed: false }]
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

function parseOneDraft(raw: Record<string, unknown>, catalog: GardenCatalog): VoiceDraft {
  const type: LogEntryType = LOG_ENTRY_TYPES.includes(raw.type as LogEntryType)
    ? (raw.type as LogEntryType)
    : 'note'

  const draft: Partial<NewLogEntry> = { type }

  // `field` vient toujours des tableaux litteraux ci-dessus, jamais des cles de `raw` :
  // aucune cle controlee par le modele (ex : __proto__) ne peut donc devenir une cible
  // d'affectation. C'est ce qui rend la copie de la sortie LLM sure.
  for (const field of STRING_FIELDS) {
    const value = raw[field]
    if (typeof value === 'string' && value.trim() !== '') {
      ;(draft as Record<string, unknown>)[field] = value
    }
  }

  for (const field of NUMBER_FIELDS) {
    const value = asNumber(raw[field])
    if (value !== undefined) {
      ;(draft as Record<string, unknown>)[field] = value
    }
  }

  for (const { field, list } of ID_FIELDS) {
    const value = asNumber(raw[field])
    if (value !== undefined && catalog[list].some((e) => e.id === value)) {
      ;(draft as Record<string, unknown>)[field] = value
    }
  }

  return { draft, parsed: true }
}

export function parseVoiceDrafts(
  geminiText: string,
  catalog: GardenCatalog,
  transcript: string,
): VoiceDraft[] {
  const json = extractJsonArray(geminiText)
  if (!json) return fallback(transcript)

  let rawArray: unknown
  try {
    rawArray = JSON.parse(json)
  } catch {
    return fallback(transcript)
  }
  if (!Array.isArray(rawArray) || rawArray.length === 0) return fallback(transcript)

  const items = rawArray
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .slice(0, MAX_DRAFTS)

  if (items.length === 0) return fallback(transcript)

  return items.map((raw) => parseOneDraft(raw, catalog))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/voiceParseService.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/services/voiceParseService.ts src/services/voiceParseService.test.ts
git commit -m "feat(voix): parseVoiceDraft devient parseVoiceDrafts, tableau plafonne a 5"
```

---

### Task 2: `VoiceCapture` — routage par nombre de brouillons

**Files:**
- Modify: `src/components/VoiceCapture.tsx`
- Test: `src/components/VoiceCapture.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/components/VoiceCapture.test.tsx`, replace the last test's JSON payload and add two new tests. Replace this line inside `'n ouvre pas le formulaire si on ferme l overlay pendant l appel Gemini'`:

```typescript
      resolveGemini('{"type":"note","description":"x"}')
```

with:

```typescript
      resolveGemini('[{"type":"note","description":"x"}]')
```

Then add two new tests at the end of the `describe('VoiceCapture', ...)` block, right before the final closing `})`:

```typescript
  it('un seul brouillon detecte navigue directement vers /ajouter', async () => {
    mockedSupported.mockReturnValue(true)
    h.getSettings.mockResolvedValue({ geminiApiKey: 'fake-key' })
    h.callGeminiAudio.mockResolvedValue(
      JSON.stringify([{ type: 'arrosage', volumeLiters: 10 }]),
    )

    const user = userEvent.setup()
    renderCapture()
    await user.click(screen.getByRole('button', { name: 'Dicter une entrée' }))
    await act(async () => {
      h.handlers.current?.onReady(audio)
    })

    await waitFor(() => expect(h.navigateSpy).toHaveBeenCalled())
    expect(h.navigateSpy).toHaveBeenCalledWith('/ajouter', {
      state: { voiceDraft: { type: 'arrosage', volumeLiters: 10 } },
    })
  })

  it('deux brouillons ou plus naviguent vers la revue vocale', async () => {
    mockedSupported.mockReturnValue(true)
    h.getSettings.mockResolvedValue({ geminiApiKey: 'fake-key' })
    h.callGeminiAudio.mockResolvedValue(
      JSON.stringify([
        { type: 'recolte', quantityKg: 3 },
        { type: 'arrosage', volumeLiters: 20 },
      ]),
    )

    const user = userEvent.setup()
    renderCapture()
    await user.click(screen.getByRole('button', { name: 'Dicter une entrée' }))
    await act(async () => {
      h.handlers.current?.onReady(audio)
    })

    await waitFor(() => expect(h.navigateSpy).toHaveBeenCalled())
    expect(h.navigateSpy).toHaveBeenCalledWith('/revue-vocale', {
      state: {
        voiceDrafts: [
          { type: 'recolte', quantityKg: 3 },
          { type: 'arrosage', volumeLiters: 20 },
        ],
      },
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/components/VoiceCapture.test.tsx`
Expected: FAIL — `parseVoiceDraft` (old single-object API) misparses the array fixtures, and the two new routing tests don't match current navigate calls.

- [ ] **Step 3: Update `VoiceCapture.tsx`**

In `src/components/VoiceCapture.tsx`, change the import:

```typescript
import {
  buildVoiceAudioPrompt,
  parseVoiceDrafts,
  type GardenCatalog,
} from '../services/voiceParseService'
```

Then replace the body of `finalize` from the `let voiceDraft` line through the `navigate(...)` call with:

```typescript
    // Repli par defaut : si Gemini ou le JSON echoue, on ouvre quand meme une note vide
    // a completer a la main plutot que de tout perdre.
    let voiceDrafts: Partial<NewLogEntry>[] = [{ type: 'note' }]
    try {
      const catalog = await loadCatalog()
      const prompt = buildVoiceAudioPrompt(catalog, todayISO())
      const answer = await callGeminiAudio(prompt, audio, key)
      voiceDrafts = parseVoiceDrafts(answer, catalog, '').map((d) => d.draft)
    } catch {
      voiceDrafts = [{ type: 'note' }]
    }

    // L'utilisateur a ferme l'overlay pendant l'attente : on n'ouvre pas le formulaire.
    if (cancelledRef.current) return

    sessionRef.current = null
    setPhase('idle')
    if (voiceDrafts.length <= 1) {
      navigate('/ajouter', { state: { voiceDraft: voiceDrafts[0] ?? { type: 'note' } } })
    } else {
      navigate('/revue-vocale', { state: { voiceDrafts } })
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/components/VoiceCapture.test.tsx`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/components/VoiceCapture.tsx src/components/VoiceCapture.test.tsx
git commit -m "feat(voix): VoiceCapture route vers /ajouter ou /revue-vocale selon le nombre de brouillons"
```

---

### Task 3: `logView` — réutilisable pour un brouillon partiel

**Files:**
- Modify: `src/services/logView.ts`
- Test: `src/services/logView.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/services/logView.test.ts`, replace the import line:

```typescript
import { describeLogEntry, formatLogDate, formatSnapshotTemp, type LogRefs } from './logView'
```

with:

```typescript
import {
  describeLogEntry,
  formatLogDate,
  formatSnapshotTemp,
  resolveDetail,
  type LogRefs,
} from './logView'
```

Then add this test inside (or next to) the existing `describe` blocks:

```typescript
describe('resolveDetail', () => {
  it('priorise volume, puis quantite, puis pluie, puis description, puis titre', () => {
    expect(resolveDetail({ volumeLiters: 10, quantityKg: 2 })).toBe('10 L')
    expect(resolveDetail({ quantityKg: 2, rainMm: 5 })).toBe('2 kg')
    expect(resolveDetail({ rainMm: 5, description: 'x' })).toBe('5 mm')
    expect(resolveDetail({ description: 'une note', title: 'titre' })).toBe('une note')
    expect(resolveDetail({ title: 'titre' })).toBe('titre')
    expect(resolveDetail({})).toBeUndefined()
  })

  it('accepte un brouillon vocal partiel, pas seulement une GardenLogEntry complete', () => {
    const draft: { volumeLiters?: number } = { volumeLiters: 15 }
    expect(resolveDetail(draft)).toBe('15 L')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/logView.test.ts`
Expected: FAIL — `resolveDetail` is not exported from `./logView`.

- [ ] **Step 3: Export and broaden `resolveDetail` and `resolveTargetName`**

In `src/services/logView.ts`, replace:

```typescript
export function resolveTargetName(entry: GardenLogEntry, refs: LogRefs): string | undefined {
  if (entry.parcelId != null) return refs.parcels.get(entry.parcelId)?.name
  if (entry.cropId != null) return refs.crops.get(entry.cropId)?.name
  if (entry.oyaId != null) return refs.oyas.get(entry.oyaId)?.name
  if (entry.treeId != null) return refs.trees.get(entry.treeId)?.name
  return undefined
}

function resolveDetail(entry: GardenLogEntry): string | undefined {
  if (entry.volumeLiters != null) return `${entry.volumeLiters} L`
  if (entry.quantityKg != null) return `${entry.quantityKg} kg`
  if (entry.rainMm != null) return `${entry.rainMm} mm`
  return entry.description ?? entry.title
}
```

with:

```typescript
// Pick<...> plutot que GardenLogEntry entier : ces deux helpers servent aussi a resumer
// un brouillon vocal partiel (VoiceReviewPage), pas seulement une entree deja en base.
export type TargetFields = Pick<GardenLogEntry, 'parcelId' | 'cropId' | 'oyaId' | 'treeId'>

export function resolveTargetName(entry: TargetFields, refs: LogRefs): string | undefined {
  if (entry.parcelId != null) return refs.parcels.get(entry.parcelId)?.name
  if (entry.cropId != null) return refs.crops.get(entry.cropId)?.name
  if (entry.oyaId != null) return refs.oyas.get(entry.oyaId)?.name
  if (entry.treeId != null) return refs.trees.get(entry.treeId)?.name
  return undefined
}

export type DetailFields = Pick<
  GardenLogEntry,
  'volumeLiters' | 'quantityKg' | 'rainMm' | 'description' | 'title'
>

export function resolveDetail(entry: DetailFields): string | undefined {
  if (entry.volumeLiters != null) return `${entry.volumeLiters} L`
  if (entry.quantityKg != null) return `${entry.quantityKg} kg`
  if (entry.rainMm != null) return `${entry.rainMm} mm`
  return entry.description ?? entry.title
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/logView.test.ts`
Expected: PASS (all tests green, including the pre-existing `describeLogEntry` tests which still call `resolveTargetName`/`resolveDetail` with a full `GardenLogEntry`).

- [ ] **Step 5: Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/services/logView.ts src/services/logView.test.ts
git commit -m "refactor(journal): exporte resolveDetail, type Pick<> pour reutiliser sur un brouillon partiel"
```

---

### Task 4: `QuickAddPage` — exporter `EntryForm` et `configForType`

**Files:**
- Modify: `src/pages/QuickAddPage.tsx`

No behavior change: this only adds `export` keywords so `VoiceReviewPage` (Task 5) can reuse the existing form instead of rewriting it.

- [ ] **Step 1: Export the three symbols**

In `src/pages/QuickAddPage.tsx`:

Replace:
```typescript
interface FormConfig {
```
with:
```typescript
export interface FormConfig {
```

Replace:
```typescript
function configForType(type: LogEntryType): FormConfig {
```
with:
```typescript
export function configForType(type: LogEntryType): FormConfig {
```

Replace:
```typescript
function EntryForm({ config, initial, onSaved, onCancel }: {
```
with:
```typescript
export function EntryForm({ config, initial, onSaved, onCancel }: {
```

- [ ] **Step 2: Run the existing test suite to confirm no regression**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/pages/QuickAddPage.test.tsx`
Expected: PASS (unchanged — adding `export` does not alter runtime behavior).

- [ ] **Step 3: Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/pages/QuickAddPage.tsx
git commit -m "refactor(saisie): exporte EntryForm/configForType/FormConfig pour reutilisation par VoiceReviewPage"
```

---

### Task 5: `VoiceReviewPage` — écran de revue multi-actions

**Files:**
- Create: `src/pages/VoiceReviewPage.tsx`
- Create: `src/pages/VoiceReviewPage.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/pages/VoiceReviewPage.test.tsx`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../data/db'
import { listLog } from '../services/logService'
import { VoiceReviewPage } from './VoiceReviewPage'

const h = vi.hoisted(() => ({ navigateSpy: vi.fn() }))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => h.navigateSpy }
})

vi.mock('../services/weatherService', () => ({
  fetchTodaySnapshot: vi.fn(async () => null),
  fetchDailyHistory: vi.fn(async () => null),
}))

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  h.navigateSpy.mockClear()
})

function renderReview(voiceDrafts: unknown[]) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/revue-vocale', state: { voiceDrafts } }]}>
      <VoiceReviewPage />
    </MemoryRouter>,
  )
}

describe('VoiceReviewPage', () => {
  it('affiche une carte resumee par action detectee', () => {
    renderReview([
      { type: 'recolte', quantityKg: 3 },
      { type: 'arrosage', volumeLiters: 20 },
    ])

    expect(screen.getByText('Récolte')).toBeInTheDocument()
    expect(screen.getByText('3 kg')).toBeInTheDocument()
    expect(screen.getByText('Arrosage')).toBeInTheDocument()
    expect(screen.getByText('20 L')).toBeInTheDocument()
  })

  it('Valider ecrit l entree en base et retire la carte', async () => {
    const user = userEvent.setup()
    renderReview([
      { type: 'recolte', quantityKg: 3, date: '2026-06-20' },
      { type: 'arrosage', volumeLiters: 20, date: '2026-06-20' },
    ])

    await user.click(screen.getAllByRole('button', { name: 'Valider' })[0])

    await waitFor(async () => {
      const all = await listLog()
      expect(all).toHaveLength(1)
    })
    const [entry] = await listLog()
    expect(entry.type).toBe('recolte')
    expect(entry.quantityKg).toBe(3)
    expect(screen.queryByText('3 kg')).not.toBeInTheDocument()
    expect(screen.getByText('Arrosage')).toBeInTheDocument()
  })

  it('Supprimer retire la carte sans rien ecrire en base', async () => {
    const user = userEvent.setup()
    renderReview([
      { type: 'recolte', quantityKg: 3, date: '2026-06-20' },
      { type: 'arrosage', volumeLiters: 20, date: '2026-06-20' },
    ])

    await user.click(screen.getAllByRole('button', { name: 'Supprimer' })[0])

    expect(screen.queryByText('3 kg')).not.toBeInTheDocument()
    const all = await listLog()
    expect(all).toHaveLength(0)
  })

  it('Modifier ouvre EntryForm preremplie ; sauvegarder retire la carte', async () => {
    const user = userEvent.setup()
    renderReview([{ type: 'arrosage', volumeLiters: 15, date: '2026-06-20' }])

    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    expect(screen.getByLabelText('Volume (litres)')).toHaveValue(15)

    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(async () => {
      const all = await listLog()
      expect(all).toHaveLength(1)
    })
    expect((await listLog())[0].volumeLiters).toBe(15)
  })

  it('derniere carte traitee navigue vers le journal', async () => {
    const user = userEvent.setup()
    renderReview([{ type: 'recolte', quantityKg: 3, date: '2026-06-20' }])

    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(() => {
      expect(h.navigateSpy).toHaveBeenCalledWith('/journal', { replace: true })
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/pages/VoiceReviewPage.test.tsx`
Expected: FAIL — `Cannot find module './VoiceReviewPage'`.

- [ ] **Step 3: Create `VoiceReviewPage.tsx`**

Create `src/pages/VoiceReviewPage.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { addLogEntry, type NewLogEntry } from '../services/logService'
import { LOG_TYPE_LABELS, resolveDetail, resolveTargetName, type LogRefs } from '../services/logView'
import { LOG_TYPE_ICONS } from '../components/logTypeIcons'
import { configForType, EntryForm } from './QuickAddPage'

interface DraftCard {
  key: string
  draft: Partial<NewLogEntry>
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const actionButtonClass =
  'flex-1 rounded-lg px-3 py-2 text-sm font-medium'

export function VoiceReviewPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const oyas = useLiveQuery(() => db.oyas.toArray(), [], [])
  const trees = useLiveQuery(() => db.trees.toArray(), [], [])

  const voiceDrafts = (location.state as { voiceDrafts?: Partial<NewLogEntry>[] } | null)
    ?.voiceDrafts

  // Brouillons consommes une seule fois : on capture a l'init, puis on nettoie le router
  // state pour qu'un retour arriere ou un rafraichissement ne rouvre pas la revue.
  const initialCards = useRef(
    (voiceDrafts ?? []).map((draft, i) => ({ key: `d${i}`, draft })),
  ).current
  const [cards, setCards] = useState<DraftCard[]>(initialCards)
  const [editingKey, setEditingKey] = useState<string | null>(null)

  useEffect(() => {
    if (voiceDrafts) {
      navigate(location.pathname, { replace: true, state: null })
    }
    // On ne veut nettoyer qu'une fois, a l'arrivee des brouillons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refs: LogRefs = {
    parcels: new Map(parcels.map((p) => [p.id!, p] as [number, typeof p])),
    crops: new Map(crops.map((c) => [c.id!, c] as [number, typeof c])),
    oyas: new Map(oyas.map((o) => [o.id!, o] as [number, typeof o])),
    trees: new Map(trees.map((t) => [t.id!, t] as [number, typeof t])),
  }

  function removeCard(key: string) {
    const next = cards.filter((c) => c.key !== key)
    setCards(next)
    if (next.length === 0) navigate('/journal', { replace: true })
  }

  async function valider(card: DraftCard) {
    const entry: NewLogEntry = {
      type: card.draft.type ?? 'note',
      date: card.draft.date ?? todayISO(),
      ...card.draft,
    }
    await addLogEntry(entry)
    removeCard(card.key)
  }

  const editingCard = cards.find((c) => c.key === editingKey)

  if (editingCard) {
    return (
      <section className="flex flex-col gap-4">
        <EntryForm
          config={configForType(editingCard.draft.type ?? 'note')}
          initial={editingCard.draft}
          onSaved={() => {
            setEditingKey(null)
            removeCard(editingCard.key)
          }}
          onCancel={() => setEditingKey(null)}
        />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-green-950">Plusieurs actions détectées</h1>
      <p className="text-sm text-green-800">
        Valide, modifie ou supprime chaque action avant de continuer.
      </p>
      <ul className="flex flex-col gap-3">
        {cards.map((card) => {
          const type = card.draft.type ?? 'note'
          const Icon = LOG_TYPE_ICONS[type]
          const target = resolveTargetName(card.draft, refs)
          const detail = resolveDetail(card.draft)
          return (
            <li key={card.key} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-green-100 text-green-700">
                  <Icon className="size-4.5" />
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-green-950">
                    {LOG_TYPE_LABELS[type]}
                    {target ? ` · ${target}` : ''}
                  </span>
                  {detail && <span className="text-xs text-green-700">{detail}</span>}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void valider(card)}
                  className={`${actionButtonClass} bg-green-600 text-white`}
                >
                  Valider
                </button>
                <button
                  type="button"
                  onClick={() => setEditingKey(card.key)}
                  className={`${actionButtonClass} bg-green-100 text-green-800`}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => removeCard(card.key)}
                  className={`${actionButtonClass} bg-red-50 text-red-700`}
                >
                  Supprimer
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Register the route**

In `src/App.tsx`, add the import:

```typescript
import { VoiceReviewPage } from './pages/VoiceReviewPage'
```

and add the route inside `<Routes>`, right after the `ajouter` route:

```typescript
          <Route path="ajouter" element={<QuickAddPage />} />
          <Route path="revue-vocale" element={<VoiceReviewPage />} />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/pages/VoiceReviewPage.test.tsx`
Expected: PASS (all 5 tests green).

- [ ] **Step 6: Run the full test suite**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npm test`
Expected: PASS — no regression in `VoiceCapture`, `QuickAddPage`, `voiceParseService`, `logView`, or any other suite.

- [ ] **Step 7: Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/pages/VoiceReviewPage.tsx src/pages/VoiceReviewPage.test.tsx src/App.tsx
git commit -m "feat(voix): ecran de revue multi-actions (Valider/Modifier/Supprimer) pour 2+ brouillons"
```

---

## Final check

- [ ] Run `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npm run lint` — expect no new warnings.
- [ ] Run `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npm run build` — expect the TypeScript build to succeed (catches any signature mismatch left over from Task 3/4's exports).
- [ ] Manually dictate a two-action sentence (or temporarily fake `callGeminiAudio`'s response) to confirm the `/revue-vocale` screen renders and that Valider/Modifier/Supprimer behave as in the spec.
