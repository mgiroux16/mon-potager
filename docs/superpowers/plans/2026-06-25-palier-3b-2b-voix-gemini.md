# Palier 3b-2b : la voix Gemini — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Appuyer sur un micro flottant, dicter une phrase de jardin, et obtenir le formulaire de saisie déjà rempli (type, mesures, parcelle, culture), à valider d'un geste.

**Architecture:** La transcription est faite par l'API Web Speech du navigateur (gratuit). Le texte transcrit part à `callGemini` (déjà posé en 3b-2a) avec le catalogue de la base ; un service pur valide le JSON renvoyé en brouillon. Le brouillon transite par le `state` du router jusqu'à `QuickAddPage`, qui ouvre le formulaire prérempli. Rien n'est enregistré sans le clic Valider.

**Tech Stack:** React 19, TypeScript, react-router-dom v7, Dexie + dexie-react-hooks, Web Speech API, Gemini via `callGemini`, Vitest + @testing-library/react, oxlint.

**Reconciliation actée vs spec :** la spec décrit `parseVoiceDraft(geminiText, catalog)` mais son repli documenté est `{ type:'note', description: transcript }`, ce qui exige la phrase d'origine. Le plan ajoute donc un 3e paramètre `transcript`. Aucune autre déviation.

---

## File Structure

| Fichier | Création/Modif | Responsabilité |
|---------|----------------|----------------|
| `src/data/model.ts` | Modif | Exposer `LOG_ENTRY_TYPES` (tuple runtime) et dériver `LogEntryType` dessus, pour que le parsing valide les types sans dupliquer la liste. |
| `src/services/speechService.ts` | Création | Encapsule l'API Web Speech (support + session). Pas de React, pas de réseau. |
| `src/services/voiceParseService.ts` | Création | Cœur pur : construit le prompt, valide/range le JSON Gemini en brouillon. Pas de réseau. |
| `src/components/VoiceCapture.tsx` | Création | UI globale : micro flottant + overlay, orchestre écoute → Gemini → navigation préremplie. |
| `src/pages/QuickAddPage.tsx` | Modif | Lit le brouillon dans le router state ; `EntryForm` accepte des valeurs initiales et affiche parcelle ET culture. |
| `src/components/Layout.tsx` | Modif | Monte `<VoiceCapture />` une fois, global. |

Tests jumelés : `src/services/speechService.test.ts`, `src/services/voiceParseService.test.ts`, `src/components/VoiceCapture.test.tsx`, `src/pages/QuickAddPage.test.tsx`.

---

## Task 1 : Liste runtime des types de journal

**Files:**
- Modify: `src/data/model.ts:9-24`
- Test: `src/services/voiceParseService.test.ts` (créé en Task 3, ce point est couvert là)

Aujourd'hui `LogEntryType` est une union écrite à la main. `voiceParseService` a besoin de la liste à l'exécution pour valider un type. On fait du tuple la source unique et on dérive le type, sans changer aucune valeur.

- [ ] **Step 1 : Remplacer l'union par un tuple `as const` + type dérivé**

Dans `src/data/model.ts`, remplacer le bloc actuel :

```ts
export type LogEntryType =
  | 'arrosage'
  | 'remplissage_oya'
  | 'releve_pluie'
  | 'recolte'
  | 'semis'
  | 'plantation'
  | 'paillage'
  | 'traitement'
  | 'observation'
  | 'probleme'
  | 'compost'
  | 'taille'
  | 'depense'
  | 'diagnostic'
  | 'note'
```

par :

```ts
export const LOG_ENTRY_TYPES = [
  'arrosage',
  'remplissage_oya',
  'releve_pluie',
  'recolte',
  'semis',
  'plantation',
  'paillage',
  'traitement',
  'observation',
  'probleme',
  'compost',
  'taille',
  'depense',
  'diagnostic',
  'note',
] as const

export type LogEntryType = (typeof LOG_ENTRY_TYPES)[number]
```

- [ ] **Step 2 : Vérifier que rien ne casse (le type est identique, c'est un refactor pur)**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npm run build`
Expected : build OK, aucune erreur de typage (les 15 valeurs sont inchangées, `LOG_TYPE_LABELS` reste exhaustif).

- [ ] **Step 3 : Lancer la suite existante (non-régression)**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npm test`
Expected : tous les tests existants au vert.

- [ ] **Step 4 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/data/model.ts
git commit -m "refactor(model): tuple LOG_ENTRY_TYPES comme source des types de journal"
```

---

## Task 2 : speechService (API Web Speech encapsulée)

**Files:**
- Create: `src/services/speechService.ts`
- Test: `src/services/speechService.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue (`isSpeechSupported`)**

Créer `src/services/speechService.test.ts` :

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { isSpeechSupported } from './speechService'

describe('isSpeechSupported', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  })

  it('renvoie faux quand aucune API de reconnaissance n est presente', () => {
    expect(isSpeechSupported()).toBe(false)
  })

  it('renvoie vrai avec SpeechRecognition standard', () => {
    ;(window as unknown as Record<string, unknown>).SpeechRecognition = class {}
    expect(isSpeechSupported()).toBe(true)
  })

  it('renvoie vrai avec le prefixe webkit', () => {
    ;(window as unknown as Record<string, unknown>).webkitSpeechRecognition = class {}
    expect(isSpeechSupported()).toBe(true)
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/speechService.test.ts`
Expected : FAIL (`isSpeechSupported` introuvable, module inexistant).

- [ ] **Step 3 : Écrire `speechService.ts`**

Créer `src/services/speechService.ts` :

```ts
// Encapsule l'API Web Speech du navigateur. Aucune clé, aucun réseau, aucune dépendance React.

export type SpeechErrorReason = 'not-allowed' | 'no-speech' | 'not-supported' | 'other'

export interface SpeechHandlers {
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  onError: (reason: SpeechErrorReason) => void
}

export interface SpeechSession {
  stop: () => void
}

type SpeechWindow = typeof window & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

// Surface minimale de l'API utilisée ici (non typée par lib.dom selon les navigateurs).
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
}

interface SpeechResultEvent {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

interface SpeechErrorEvent {
  error: string
}

function getCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as SpeechWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function isSpeechSupported(): boolean {
  return getCtor() != null
}

export function createSpeechSession(handlers: SpeechHandlers): SpeechSession {
  const Ctor = getCtor()
  if (!Ctor) {
    handlers.onError('not-supported')
    return { stop: () => {} }
  }

  const recognition = new Ctor()
  recognition.lang = 'fr-FR'
  recognition.interimResults = true
  recognition.continuous = false

  recognition.onresult = (event) => {
    let interim = ''
    let final = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const transcript = result[0].transcript
      if (result.isFinal) final += transcript
      else interim += transcript
    }
    if (interim) handlers.onInterim(interim)
    if (final) handlers.onFinal(final)
  }

  recognition.onerror = (event) => {
    const reason: SpeechErrorReason =
      event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'not-allowed'
        : event.error === 'no-speech'
          ? 'no-speech'
          : 'other'
    handlers.onError(reason)
  }

  recognition.start()
  return { stop: () => recognition.stop() }
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/speechService.test.ts`
Expected : PASS (3 tests).

- [ ] **Step 5 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/services/speechService.ts src/services/speechService.test.ts
git commit -m "feat(voix): speechService encapsule l API Web Speech"
```

---

## Task 3 : voiceParseService — `buildVoicePrompt`

**Files:**
- Create: `src/services/voiceParseService.ts`
- Test: `src/services/voiceParseService.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue (`buildVoicePrompt`)**

Créer `src/services/voiceParseService.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { LOG_ENTRY_TYPES } from '../data/model'
import { buildVoicePrompt, type GardenCatalog } from './voiceParseService'

const catalog: GardenCatalog = {
  parcels: [{ id: 1, name: 'Parcelle A' }, { id: 2, name: 'Parcelle B' }],
  crops: [{ id: 10, name: 'Tomates' }],
  oyas: [{ id: 20, name: 'Oya nord' }],
  trees: [{ id: 30, name: 'Pommier' }],
}

describe('buildVoicePrompt', () => {
  it('contient la phrase, la date du jour, tous les types et le catalogue', () => {
    const prompt = buildVoicePrompt('j ai arrose dix litres sur la parcelle A', catalog, '2026-06-25')

    expect(prompt).toContain('j ai arrose dix litres sur la parcelle A')
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
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/voiceParseService.test.ts`
Expected : FAIL (module / export inexistant).

- [ ] **Step 3 : Écrire le squelette + `buildVoicePrompt`**

Créer `src/services/voiceParseService.ts` :

```ts
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
  draft: NewLogEntry
  parsed: boolean
}

function listForPrompt(label: string, entries: CatalogEntry[]): string {
  if (entries.length === 0) return `${label} : (aucun)`
  const items = entries.map((e) => `${e.id} = ${e.name}`).join(', ')
  return `${label} : ${items}`
}

export function buildVoicePrompt(
  transcript: string,
  catalog: GardenCatalog,
  todayISO: string,
): string {
  return [
    'Tu transformes une phrase de jardinage dictee en une entree de journal structuree.',
    `Date du jour : ${todayISO} (resous "ce matin", "hier", "aujourd hui" par rapport a elle).`,
    '',
    `Phrase dictee : "${transcript}"`,
    '',
    `Types valides (champ "type") : ${LOG_ENTRY_TYPES.join(', ')}.`,
    '',
    'Catalogue du jardin (utilise UNIQUEMENT ces identifiants, jamais d autres) :',
    listForPrompt('Parcelles (parcelId)', catalog.parcels),
    listForPrompt('Cultures (cropId)', catalog.crops),
    listForPrompt('Oyas (oyaId)', catalog.oyas),
    listForPrompt('Arbres (treeId)', catalog.trees),
    '',
    'Reponds UNIQUEMENT par un objet JSON, sans texte autour, avec seulement les champs reconnus :',
    'type, date (YYYY-MM-DD), time (HH:mm), title, description,',
    'parcelId, cropId, oyaId, treeId, volumeLiters, rainMm, quantityKg.',
    'Omets tout champ non mentionne dans la phrase.',
    'Une entree peut porter a la fois parcelId et cropId.',
    'N invente jamais un identifiant absent du catalogue.',
  ].join('\n')
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/voiceParseService.test.ts`
Expected : PASS (1 test).

- [ ] **Step 5 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/services/voiceParseService.ts src/services/voiceParseService.test.ts
git commit -m "feat(voix): buildVoicePrompt assemble le prompt Gemini avec catalogue"
```

---

## Task 4 : voiceParseService — `parseVoiceDraft`

**Files:**
- Modify: `src/services/voiceParseService.ts`
- Test: `src/services/voiceParseService.test.ts`

- [ ] **Step 1 : Ajouter les tests qui échouent (`parseVoiceDraft`)**

Ajouter à `src/services/voiceParseService.test.ts` (après le bloc `buildVoicePrompt`, en complétant l'import) :

```ts
import { buildVoicePrompt, parseVoiceDraft, type GardenCatalog } from './voiceParseService'
```

```ts
describe('parseVoiceDraft', () => {
  const transcript = 'j ai arrose dix litres sur la parcelle A avec des tomates'

  it('range un JSON propre (type, volume, parcelId, cropId)', () => {
    const text = JSON.stringify({
      type: 'arrosage',
      volumeLiters: 10,
      parcelId: 1,
      cropId: 10,
      time: '08:00',
    })
    const { draft, parsed } = parseVoiceDraft(text, catalog, transcript)
    expect(parsed).toBe(true)
    expect(draft.type).toBe('arrosage')
    expect(draft.volumeLiters).toBe(10)
    expect(draft.parcelId).toBe(1)
    expect(draft.cropId).toBe(10)
    expect(draft.time).toBe('08:00')
  })

  it('extrait le JSON meme entoure de texte ou d un bloc markdown', () => {
    const text = 'Voici l entree :\n```json\n{"type":"recolte","quantityKg":2,"cropId":10}\n```\nVoila.'
    const { draft, parsed } = parseVoiceDraft(text, catalog, transcript)
    expect(parsed).toBe(true)
    expect(draft.type).toBe('recolte')
    expect(draft.quantityKg).toBe(2)
    expect(draft.cropId).toBe(10)
  })

  it('ignore un champ inconnu et retombe sur note si le type est invalide', () => {
    const text = JSON.stringify({ type: 'pas_un_type', foo: 'bar', description: 'coucou' })
    const { draft } = parseVoiceDraft(text, catalog, transcript)
    expect(draft.type).toBe('note')
    expect((draft as Record<string, unknown>).foo).toBeUndefined()
    expect(draft.description).toBe('coucou')
  })

  it('rejette un id absent du catalogue mais garde le reste', () => {
    const text = JSON.stringify({ type: 'arrosage', volumeLiters: 5, parcelId: 999 })
    const { draft } = parseVoiceDraft(text, catalog, transcript)
    expect(draft.parcelId).toBeUndefined()
    expect(draft.volumeLiters).toBe(5)
    expect(draft.type).toBe('arrosage')
  })

  it('ignore un nombre non numerique', () => {
    const text = JSON.stringify({ type: 'arrosage', volumeLiters: 'beaucoup' })
    const { draft } = parseVoiceDraft(text, catalog, transcript)
    expect(draft.volumeLiters).toBeUndefined()
  })

  it('repli note + transcript quand le JSON est casse ou absent', () => {
    const { draft, parsed } = parseVoiceDraft('aucun json ici', catalog, transcript)
    expect(parsed).toBe(false)
    expect(draft.type).toBe('note')
    expect(draft.description).toBe(transcript)
  })
})
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/voiceParseService.test.ts`
Expected : FAIL (`parseVoiceDraft` introuvable).

- [ ] **Step 3 : Implémenter `parseVoiceDraft`**

Ajouter à la fin de `src/services/voiceParseService.ts` :

```ts
const STRING_FIELDS = ['date', 'time', 'title', 'description'] as const
const NUMBER_FIELDS = ['volumeLiters', 'rainMm', 'quantityKg'] as const
const ID_FIELDS = [
  { field: 'parcelId', list: 'parcels' },
  { field: 'cropId', list: 'crops' },
  { field: 'oyaId', list: 'oyas' },
  { field: 'treeId', list: 'trees' },
] as const

function extractJson(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  return text.slice(start, end + 1)
}

function fallback(transcript: string): VoiceDraft {
  return { draft: { type: 'note', description: transcript }, parsed: false }
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

export function parseVoiceDraft(
  geminiText: string,
  catalog: GardenCatalog,
  transcript: string,
): VoiceDraft {
  const json = extractJson(geminiText)
  if (!json) return fallback(transcript)

  let raw: Record<string, unknown>
  try {
    const parsed = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return fallback(transcript)
    raw = parsed as Record<string, unknown>
  } catch {
    return fallback(transcript)
  }

  const type: LogEntryType = LOG_ENTRY_TYPES.includes(raw.type as LogEntryType)
    ? (raw.type as LogEntryType)
    : 'note'

  const draft: NewLogEntry = { type }

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
```

- [ ] **Step 4 : Lancer toute la suite du service, vérifier le succès**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/voiceParseService.test.ts`
Expected : PASS (7 tests).

- [ ] **Step 5 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/services/voiceParseService.ts src/services/voiceParseService.test.ts
git commit -m "feat(voix): parseVoiceDraft valide defensivement le JSON Gemini"
```

---

## Task 5 : EntryForm accepte un brouillon + affiche parcelle ET culture

**Files:**
- Modify: `src/pages/QuickAddPage.tsx` (composant `EntryForm`, lignes 51-283)
- Test: `src/pages/QuickAddPage.test.tsx`

Le but : `EntryForm` prend des valeurs initiales optionnelles et, quand le brouillon porte plusieurs cibles, affiche plusieurs sélecteurs. La saisie manuelle (sans brouillon) reste identique.

- [ ] **Step 1 : Écrire le test qui échoue (valeurs initiales + double cible)**

Créer `src/pages/QuickAddPage.test.tsx` :

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../data/db'
import { listLog } from '../services/logService'
import { QuickAddPage } from './QuickAddPage'

afterEach(async () => {
  await db.delete()
  await db.open()
})

async function seed() {
  await db.parcels.add({ id: 1, name: 'Parcelle A' })
  await db.crops.add({ id: 10, name: 'Tomates', status: 'en_place' })
}

describe('QuickAddPage avec brouillon vocal', () => {
  it('ouvre EntryForm prerempli (type + volume) depuis le router state', async () => {
    await seed()
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/ajouter',
            state: { voiceDraft: { type: 'arrosage', volumeLiters: 10, parcelId: 1, cropId: 10 } },
          },
        ]}
      >
        <QuickAddPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Arrosage' })).toBeInTheDocument()
    expect(screen.getByLabelText('Volume (litres)')).toHaveValue(10)
    expect(screen.getByLabelText('Parcelle')).toBeInTheDocument()
    expect(screen.getByLabelText('Culture')).toBeInTheDocument()
  })

  it('valide une entree avec parcelId ET cropId', async () => {
    await seed()
    const user = userEvent.setup()
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/ajouter',
            state: { voiceDraft: { type: 'arrosage', volumeLiters: 10, parcelId: 1, cropId: 10 } },
          },
        ]}
      >
        <QuickAddPage />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: 'Valider' }))

    await waitFor(async () => {
      const entries = await listLog()
      expect(entries).toHaveLength(1)
      expect(entries[0].parcelId).toBe(1)
      expect(entries[0].cropId).toBe(10)
      expect(entries[0].volumeLiters).toBe(10)
    })
  })

  it('sans brouillon, affiche la grille de saisie rapide (non-regression)', () => {
    render(
      <MemoryRouter initialEntries={['/ajouter']}>
        <QuickAddPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Saisie rapide' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/pages/QuickAddPage.test.tsx`
Expected : FAIL (le formulaire ne se préremplit pas, `Culture` absent pour un arrosage, et `QuickAddPage` ne lit pas le router state).

- [ ] **Step 3 : Refactor du composant `EntryForm`**

Dans `src/pages/QuickAddPage.tsx`, remplacer entièrement la fonction `EntryForm` (lignes 51-283) par :

```tsx
type TargetField = 'parcelle' | 'culture' | 'oya' | 'arbre'

function visibleTargets(config: FormConfig, initial?: NewLogEntry): Set<TargetField> {
  const s = new Set<TargetField>()
  if (config.target === 'parcelle') s.add('parcelle')
  if (config.target === 'oya') s.add('oya')
  if (config.target === 'culture') s.add('culture')
  if (config.target === 'element') {
    s.add('parcelle')
    s.add('culture')
    s.add('arbre')
  }
  if (initial?.parcelId != null) s.add('parcelle')
  if (initial?.cropId != null) s.add('culture')
  if (initial?.oyaId != null) s.add('oya')
  if (initial?.treeId != null) s.add('arbre')
  return s
}

function EntryForm({ config, initial, onSaved, onCancel }: {
  config: FormConfig
  initial?: NewLogEntry
  onSaved: () => void
  onCancel: () => void
}) {
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const oyas = useLiveQuery(() => db.oyas.toArray(), [], [])
  const trees = useLiveQuery(() => db.trees.toArray(), [], [])

  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [time, setTime] = useState(initial?.time ?? nowHM())
  const [parcelId, setParcelId] = useState(initial?.parcelId != null ? String(initial.parcelId) : '')
  const [cropId, setCropId] = useState(initial?.cropId != null ? String(initial.cropId) : '')
  const [oyaId, setOyaId] = useState(initial?.oyaId != null ? String(initial.oyaId) : '')
  const [treeId, setTreeId] = useState(initial?.treeId != null ? String(initial.treeId) : '')
  const [elementValue, setElementValue] = useState('')
  const [volume, setVolume] = useState(initial?.volumeLiters != null ? String(initial.volumeLiters) : '')
  const [quantity, setQuantity] = useState(initial?.quantityKg != null ? String(initial.quantityKg) : '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [photos, setPhotos] = useState<string[]>(initial?.photoUrls ?? [])

  // En saisie manuelle d'une observation/probleme (config 'element' sans brouillon), on garde
  // le selecteur combine d'origine. Des qu'un brouillon porte une cible, on bascule sur des
  // selecteurs individuels (parcelle ET culture possibles simultanement).
  const hasDraftTarget =
    initial != null &&
    (initial.parcelId != null ||
      initial.cropId != null ||
      initial.oyaId != null ||
      initial.treeId != null)
  const useLegacyElement = config.target === 'element' && !hasDraftTarget
  const visible = visibleTargets(config, initial)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const entry: NewLogEntry = { type: config.type, date }
    if (config.withTime) entry.time = time

    if (useLegacyElement) {
      if (elementValue) {
        const [kind, id] = elementValue.split(':')
        if (kind === 'parcelle') entry.parcelId = Number(id)
        else if (kind === 'culture') entry.cropId = Number(id)
        else if (kind === 'arbre') entry.treeId = Number(id)
      }
    } else {
      if (visible.has('parcelle') && parcelId) entry.parcelId = Number(parcelId)
      if (visible.has('culture') && cropId) entry.cropId = Number(cropId)
      if (visible.has('oya') && oyaId) entry.oyaId = Number(oyaId)
      if (visible.has('arbre') && treeId) entry.treeId = Number(treeId)
    }

    if (config.measure === 'volume' && volume) entry.volumeLiters = Number(volume)
    if (config.measure === 'quantite' && quantity) entry.quantityKg = Number(quantity)
    if (config.measure === 'description' && description) entry.description = description
    if (config.measure === 'titre_description') {
      if (title) entry.title = title
      if (description) entry.description = description
    }

    if (photos.length) entry.photoUrls = photos

    await addLogEntry(entry)
    onSaved()
  }

  const fieldClass =
    'w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-950'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1 self-start text-sm text-green-700"
      >
        <ArrowLeft className="size-4" /> Retour
      </button>

      <h1 className="text-xl font-semibold text-green-950">{LOG_TYPE_LABELS[config.type]}</h1>

      {!useLegacyElement && visible.has('parcelle') && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Parcelle
          <select
            aria-label="Parcelle"
            value={parcelId}
            onChange={(e) => setParcelId(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucune)</option>
            {parcels.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </label>
      )}

      {!useLegacyElement && visible.has('culture') && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Culture
          <select
            aria-label="Culture"
            value={cropId}
            onChange={(e) => setCropId(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucune)</option>
            {crops.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      {!useLegacyElement && visible.has('oya') && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Oya
          <select
            aria-label="Oya"
            value={oyaId}
            onChange={(e) => setOyaId(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucune)</option>
            {oyas.map((o) => (
              <option key={o.id} value={String(o.id)}>{o.name}</option>
            ))}
          </select>
        </label>
      )}

      {!useLegacyElement && visible.has('arbre') && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Arbre
          <select
            aria-label="Arbre"
            value={treeId}
            onChange={(e) => setTreeId(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucun)</option>
            {trees.map((t) => (
              <option key={t.id} value={String(t.id)}>{t.name}</option>
            ))}
          </select>
        </label>
      )}

      {useLegacyElement && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Élément concerné (optionnel)
          <select
            aria-label="Élément concerné"
            value={elementValue}
            onChange={(e) => setElementValue(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucun)</option>
            <optgroup label="Parcelles">
              {parcels.map((p) => (
                <option key={`p${p.id}`} value={`parcelle:${p.id}`}>{p.name}</option>
              ))}
            </optgroup>
            <optgroup label="Cultures">
              {crops.map((c) => (
                <option key={`c${c.id}`} value={`culture:${c.id}`}>{c.name}</option>
              ))}
            </optgroup>
            <optgroup label="Arbres">
              {trees.map((t) => (
                <option key={`t${t.id}`} value={`arbre:${t.id}`}>{t.name}</option>
              ))}
            </optgroup>
          </select>
        </label>
      )}

      {config.measure === 'volume' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Volume (litres)
          <input
            aria-label="Volume (litres)"
            type="number"
            inputMode="numeric"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className={fieldClass}
          />
        </label>
      )}

      {config.measure === 'quantite' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Quantité (kg)
          <input
            aria-label="Quantité (kg)"
            type="number"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={fieldClass}
          />
        </label>
      )}

      {config.measure === 'titre_description' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Titre
          <input
            aria-label="Titre"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={fieldClass}
          />
        </label>
      )}

      {(config.measure === 'description' || config.measure === 'titre_description') && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Description
          <textarea
            aria-label="Description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={fieldClass}
          />
        </label>
      )}

      <PhotoInput photos={photos} onChange={setPhotos} />

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm text-green-800">
          Date
          <input
            aria-label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={fieldClass}
          />
        </label>
        {config.withTime && (
          <label className="flex flex-1 flex-col gap-1 text-sm text-green-800">
            Heure
            <input
              aria-label="Heure"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={fieldClass}
            />
          </label>
        )}
      </div>

      <button
        type="submit"
        className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white"
      >
        Valider
      </button>
    </form>
  )
}
```

Note : `EntryForm` est encore appelé sans `initial` par le `QuickAddPage` actuel ; c'est valide (`initial` optionnel). La Task 6 câble le brouillon. Cette task se vérifie d'abord via le test manuel ci-dessous puis pleinement en Task 6 ; mais le 3e test (non-régression grille) passe déjà.

- [ ] **Step 4 : Lancer le test de non-régression (les deux premiers échouent encore tant que Task 6 n'est pas faite)**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/pages/QuickAddPage.test.tsx -t "non-regression"`
Expected : PASS pour « non-regression ». Les deux autres tests restent rouges jusqu'à la Task 6 (QuickAddPage ne lit pas encore le router state) — c'est attendu.

- [ ] **Step 5 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/pages/QuickAddPage.tsx src/pages/QuickAddPage.test.tsx
git commit -m "feat(voix): EntryForm accepte des valeurs initiales et plusieurs cibles"
```

---

## Task 6 : QuickAddPage lit le brouillon dans le router state

**Files:**
- Modify: `src/pages/QuickAddPage.tsx` (imports + fonction `QuickAddPage`, lignes 1-9 et 285-378)
- Test: `src/pages/QuickAddPage.test.tsx` (déjà écrit en Task 5)

- [ ] **Step 1 : Adapter les imports**

En tête de `src/pages/QuickAddPage.tsx`, remplacer :

```tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
```

par :

```tsx
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
```

- [ ] **Step 2 : Ajouter le helper de config par type (sous `genericConfig`, vers la ligne 37)**

```tsx
function configForType(type: LogEntryType): FormConfig {
  return FREQUENT.find((c) => c.type === type) ?? genericConfig(type)
}
```

- [ ] **Step 3 : Réécrire la fonction `QuickAddPage` (lignes 285-378)**

Remplacer la fonction `QuickAddPage` par :

```tsx
export function QuickAddPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const voiceDraft = (location.state as { voiceDraft?: NewLogEntry } | null)?.voiceDraft

  // Brouillon consomme une seule fois : on capture a l'init, puis on nettoie le router state
  // pour qu'un retour arriere ou un rafraichissement ne rouvre pas le formulaire prerempli.
  const initialDraft = useRef(voiceDraft).current
  const [view, setView] = useState<View>(() =>
    initialDraft ? configForType(initialDraft.type) : 'grid',
  )
  const [draft, setDraft] = useState<NewLogEntry | undefined>(initialDraft)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  useEffect(() => {
    if (voiceDraft) {
      navigate(location.pathname, { replace: true, state: null })
    }
    // On ne veut nettoyer qu'une fois, a l'arrivee du brouillon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function backToGrid() {
    setDraft(undefined)
    setView('grid')
  }

  if (view === 'autre') {
    return (
      <section className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setView('grid')}
          className="flex items-center gap-1 self-start text-sm text-green-700"
        >
          <ArrowLeft className="size-4" /> Retour
        </button>
        <h1 className="text-xl font-semibold text-green-950">Autre type d'entrée</h1>
        <ul className="flex flex-col gap-2">
          {OTHER_TYPES.map((type) => {
            const Icon = LOG_TYPE_ICONS[type]
            return (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => setView(genericConfig(type))}
                  className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left shadow-sm"
                >
                  <span className="grid size-9 place-items-center rounded-lg bg-green-100 text-green-700">
                    <Icon className="size-4.5" />
                  </span>
                  <span className="text-sm font-medium text-green-950">{LOG_TYPE_LABELS[type]}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  if (view !== 'grid') {
    return (
      <EntryForm
        config={view}
        initial={draft}
        onSaved={() => {
          setConfirmation('Entrée ajoutée au journal.')
          backToGrid()
        }}
        onCancel={backToGrid}
      />
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-green-950">Saisie rapide</h1>
      {confirmation && (
        <p className="rounded-lg bg-green-100 px-3 py-2 text-sm text-green-800">{confirmation}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {FREQUENT.map((config) => {
          const Icon = LOG_TYPE_ICONS[config.type]
          return (
            <button
              key={config.type}
              type="button"
              onClick={() => {
                setConfirmation(null)
                setDraft(undefined)
                setView(config)
              }}
              className="flex flex-col items-center gap-2 rounded-2xl bg-white px-3 py-5 shadow-sm"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-green-100 text-green-700">
                <Icon className="size-6" />
              </span>
              <span className="text-sm font-medium text-green-950">{LOG_TYPE_LABELS[config.type]}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => {
            setConfirmation(null)
            setDraft(undefined)
            setView('autre')
          }}
          className="flex flex-col items-center gap-2 rounded-2xl bg-white px-3 py-5 shadow-sm"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-green-100 text-green-700">
            <MoreHorizontal className="size-6" />
          </span>
          <span className="text-sm font-medium text-green-950">Autre…</span>
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 4 : Lancer toute la suite QuickAddPage, vérifier le succès**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/pages/QuickAddPage.test.tsx`
Expected : PASS (3 tests : préremplissage, double cible enregistrée, non-régression).

- [ ] **Step 5 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/pages/QuickAddPage.tsx
git commit -m "feat(voix): QuickAddPage ouvre le formulaire prerempli depuis le router state"
```

---

## Task 7 : VoiceCapture (micro flottant + orchestration)

**Files:**
- Create: `src/components/VoiceCapture.tsx`
- Test: `src/components/VoiceCapture.test.tsx`

- [ ] **Step 1 : Écrire les tests qui échouent (rendu conditionnel + ouverture overlay)**

Créer `src/components/VoiceCapture.test.tsx` :

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../services/speechService', () => ({
  isSpeechSupported: vi.fn(),
  createSpeechSession: vi.fn(() => ({ stop: vi.fn() })),
}))

import { isSpeechSupported } from '../services/speechService'
import { VoiceCapture } from './VoiceCapture'

const mockedSupported = vi.mocked(isSpeechSupported)

function renderCapture() {
  return render(
    <MemoryRouter>
      <VoiceCapture />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('VoiceCapture', () => {
  it('ne rend pas le bouton quand la reconnaissance vocale n est pas supportee', () => {
    mockedSupported.mockReturnValue(false)
    renderCapture()
    expect(screen.queryByRole('button', { name: 'Dicter une entrée' })).not.toBeInTheDocument()
  })

  it('rend le bouton et ouvre l overlay d ecoute quand supporte', async () => {
    mockedSupported.mockReturnValue(true)
    const user = userEvent.setup()
    renderCapture()

    const button = screen.getByRole('button', { name: 'Dicter une entrée' })
    expect(button).toBeInTheDocument()

    await user.click(button)
    expect(screen.getByText(/J'écoute/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/components/VoiceCapture.test.tsx`
Expected : FAIL (module `VoiceCapture` inexistant).

- [ ] **Step 3 : Écrire `VoiceCapture.tsx`**

Créer `src/components/VoiceCapture.tsx` :

```tsx
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, X } from 'lucide-react'
import { db } from '../data/db'
import { getSettings } from '../services/settingsService'
import { callGemini } from '../services/geminiService'
import {
  createSpeechSession,
  isSpeechSupported,
  type SpeechErrorReason,
  type SpeechSession,
} from '../services/speechService'
import {
  buildVoicePrompt,
  parseVoiceDraft,
  type GardenCatalog,
} from '../services/voiceParseService'
import type { NewLogEntry } from '../services/logService'

type Phase = 'idle' | 'listening' | 'processing' | 'error'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function errorMessage(reason: SpeechErrorReason): string {
  switch (reason) {
    case 'not-allowed':
      return 'Micro refusé. Autorise le micro pour dicter.'
    case 'no-speech':
      return 'Je n ai rien entendu. Réessaie.'
    case 'not-supported':
      return 'La dictée n est pas disponible sur ce navigateur.'
    default:
      return 'Souci avec la dictée. Réessaie.'
  }
}

async function loadCatalog(): Promise<GardenCatalog> {
  const [parcels, crops, oyas, trees] = await Promise.all([
    db.parcels.toArray(),
    db.crops.toArray(),
    db.oyas.toArray(),
    db.trees.toArray(),
  ])
  const pick = <T extends { id?: number; name: string }>(rows: T[]) =>
    rows.filter((r) => r.id != null).map((r) => ({ id: r.id as number, name: r.name }))
  return {
    parcels: pick(parcels),
    crops: pick(crops),
    oyas: pick(oyas),
    trees: pick(trees),
  }
}

export function VoiceCapture() {
  const navigate = useNavigate()
  const sessionRef = useRef<SpeechSession | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [message, setMessage] = useState('')

  if (!isSpeechSupported()) return null

  function close() {
    sessionRef.current?.stop()
    sessionRef.current = null
    setPhase('idle')
    setTranscript('')
    setMessage('')
  }

  // Transforme la phrase finale en brouillon puis ouvre le formulaire prerempli.
  async function finalize(finalText: string) {
    setPhase('processing')
    const settings = await getSettings()
    const key = settings.geminiApiKey?.trim()

    let voiceDraft: NewLogEntry = { type: 'note', description: finalText }
    if (key) {
      try {
        const catalog = await loadCatalog()
        const prompt = buildVoicePrompt(finalText, catalog, todayISO())
        const answer = await callGemini(prompt, key)
        voiceDraft = parseVoiceDraft(answer, catalog, finalText).draft
      } catch {
        // Reseau coupe, quota, JSON casse : on garde le repli note + phrase brute.
        voiceDraft = { type: 'note', description: finalText }
      }
    }

    sessionRef.current = null
    setPhase('idle')
    setTranscript('')
    navigate('/ajouter', { state: { voiceDraft } })
  }

  function start() {
    setPhase('listening')
    setTranscript('')
    setMessage('')
    sessionRef.current = createSpeechSession({
      onInterim: (text) => setTranscript(text),
      onFinal: (text) => {
        setTranscript(text)
        void finalize(text)
      },
      onError: (reason) => {
        sessionRef.current = null
        setPhase('error')
        setMessage(errorMessage(reason))
      },
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        aria-label="Dicter une entrée"
        className="fixed bottom-24 right-4 z-20 grid size-14 place-items-center rounded-full bg-green-600 text-white shadow-lg shadow-green-600/30"
      >
        <Mic className="size-6" />
      </button>

      {phase !== 'idle' && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-green-950">
                {phase === 'listening' && "J'écoute…"}
                {phase === 'processing' && 'Je range…'}
                {phase === 'error' && 'Oups'}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className="rounded-lg p-1 text-green-700"
              >
                <X className="size-5" />
              </button>
            </div>

            {phase === 'error' ? (
              <p className="mt-3 text-sm text-green-800">{message}</p>
            ) : (
              <p className="mt-3 min-h-12 text-sm text-green-800">
                {transcript || 'Parle, je transcris…'}
              </p>
            )}

            {phase === 'listening' && (
              <button
                type="button"
                onClick={() => sessionRef.current?.stop()}
                className="mt-4 w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white"
              >
                Terminer
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/components/VoiceCapture.test.tsx`
Expected : PASS (2 tests).

- [ ] **Step 5 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/components/VoiceCapture.tsx src/components/VoiceCapture.test.tsx
git commit -m "feat(voix): VoiceCapture, micro flottant et orchestration ecoute -> Gemini -> formulaire"
```

---

## Task 8 : Monter VoiceCapture globalement dans Layout

**Files:**
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1 : Importer et monter le composant**

Dans `src/components/Layout.tsx`, ajouter l'import sous les imports existants :

```tsx
import { VoiceCapture } from './VoiceCapture'
```

Puis, dans le JSX, juste avant la balise fermante `</div>` du conteneur racine (après le `<nav>…</nav>`), ajouter :

```tsx
      <VoiceCapture />
```

Le bloc devient :

```tsx
      </nav>

      <VoiceCapture />
    </div>
```

- [ ] **Step 2 : Vérifier le build et le lint**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npm run build && npm run lint`
Expected : build OK, lint sans erreur.

- [ ] **Step 3 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/components/Layout.tsx
git commit -m "feat(voix): micro flottant present sur toutes les pages"
```

---

## Task 9 : Vérification complète

**Files:** aucun changement de code (sauf correctifs si un check échoue).

- [ ] **Step 1 : Suite de tests complète**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npm test`
Expected : toute la suite au vert (anciens + nouveaux).

- [ ] **Step 2 : Build typé (leçon 3b-2a : Vitest ne type-check pas)**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npm run build`
Expected : `tsc -b` puis `vite build` OK, zéro erreur de typage.

- [ ] **Step 3 : Lint**

Run : `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npm run lint`
Expected : oxlint sans erreur.

- [ ] **Step 4 : Vérification navigateur (parcours dégradé, clé bidon)**

Démarrer le serveur de dev (preview_start) puis vérifier, via les outils preview, sur Chrome :
- Le micro flottant apparaît en bas-droite, au-dessus de la barre de navigation, sur plusieurs pages (Accueil, Journal, Jardin).
- Un appui ouvre l'overlay « J'écoute… ». (La reconnaissance vocale réelle peut ne pas tourner dans l'environnement preview ; dans ce cas, prouver au minimum l'ouverture/fermeture de l'overlay et l'absence d'erreur console.)
- Renseigner dans Réglages une clé Gemini bidon, dicter (ou simuler une phrase finale) : prouver que l'échec Gemini retombe proprement sur le formulaire avec la phrase brute en Description, sans plantage, sans enregistrement automatique.
- Prendre une capture d'écran du micro + overlay et du formulaire prérempli.

Le test avec la vraie clé Gemini reste à la main de Mathieu : on ne manipule pas son secret.

- [ ] **Step 5 : Commit final éventuel + bilan**

Si des correctifs ont été nécessaires, les committer. Sinon, le palier est livré sur la branche `palier-3b-2b-voix-gemini`, prêt pour relecture / merge.

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git status
```

---

## Self-review (effectué)

- **Couverture spec :** Web Speech (Task 2) ✓ ; parsing/matching catalogue + double cible (Tasks 3-4) ✓ ; micro flottant global (Tasks 7-8) ✓ ; confirmation via formulaire réutilisé (Tasks 5-6) ✓ ; dégradé sans clé (Task 7 `finalize`) ✓ ; rien d'enregistré sans Valider (aucune écriture hors `handleSubmit`) ✓ ; rejet des ids inconnus (Task 4) ✓ ; build+test+lint+navigateur (Task 9) ✓.
- **Placeholders :** aucun ; chaque step porte le code complet ou la commande exacte.
- **Cohérence des types :** `NewLogEntry` (existant), `GardenCatalog`/`CatalogEntry`/`VoiceDraft` (Task 3) réutilisés à l'identique en Tasks 4/7 ; `parseVoiceDraft(geminiText, catalog, transcript)` à 3 paramètres partout (test Task 4 + appel Task 7) ; `configForType`/`visibleTargets` définis avant usage ; `SpeechSession`/`SpeechErrorReason` exportés en Task 2 et importés en Task 7.
- **Reconciliation signature** `parseVoiceDraft` documentée en tête (3e param `transcript`).
