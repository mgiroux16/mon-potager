# Plan d'implémentation : palier 3 (saisie rapide + journal filtrable)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à la PWA un écran de saisie rapide par tuiles et un journal listé et filtrable par type, en réutilisant les services du palier 2.

**Architecture:** Une couche de formatage pure et testable dans `services/logView.ts` (libellés, vue lisible d'une entrée, date relative). Une table de correspondance type → icône lucide dans `components/logTypeIcons.tsx` (présentation). Les pages `JournalPage` et `QuickAddPage` ne font que du câblage : lecture réactive via `useLiveQuery`, formulaires d'écriture via `addLogEntry`. Aucun nouveau store Dexie.

**Tech Stack:** Vite + React 19 + react-router-dom 7 + TypeScript + Tailwind 4 + Dexie 4 + dexie-react-hooks + lucide-react. Tests : Vitest 3 + fake-indexeddb + @testing-library/react + @testing-library/user-event.

**Spec source :** `docs/superpowers/specs/2026-06-24-palier-3-saisie-journal-design.md`

**Branche de travail :** `palier-3-saisie-journal` (déjà créée, contient le commit de spec `30ecae0`).

---

## Structure des fichiers

| Fichier | Rôle | Action |
|---------|------|--------|
| `src/services/logView.ts` | Formatage pur : `LOG_TYPE_LABELS`, `describeLogEntry`, `formatLogDate`, types `LogRefs` / `LogEntryView`. Zéro React, zéro I/O. | Créer |
| `src/services/logView.test.ts` | Tests des fonctions pures. | Créer |
| `src/components/logTypeIcons.tsx` | `LOG_TYPE_ICONS` : type → composant icône lucide. Présentation. | Créer |
| `src/components/logTypeIcons.test.ts` | Vérifie que les 15 types ont une icône. | Créer |
| `src/pages/JournalPage.tsx` | Liste filtrable. Remplace le placeholder (et son étiquette périmée « Palier 4 »). | Remplacer |
| `src/pages/JournalPage.test.tsx` | Rendu + filtre. | Créer |
| `src/pages/QuickAddPage.tsx` | Grille de tuiles + mini-formulaires. Remplace le placeholder. | Remplacer |
| `src/pages/QuickAddPage.test.tsx` | Flux d'ajout d'une entrée. | Créer |

**Logique métier dans `services/` (pur), présentation dans `components/` :** la spec impose que `services/` reste sans React. Les icônes sont des composants React, donc elles vivent dans `components/logTypeIcons.tsx`, pas dans le service. Les libellés (chaînes pures) restent côté service avec `describeLogEntry` qui les consomme. Deux petits fichiers focalisés plutôt qu'un seul qui violerait la règle de couche.

**Ordre des tâches** (dépendances d'abord) : couche pure → icônes → JournalPage (lecture seule, simple) → QuickAddPage (écriture, la plus riche) → vérification globale.

---

## Task 1 : Couche de formatage pure (`logView.ts`)

**Files:**
- Create: `src/services/logView.ts`
- Test: `src/services/logView.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/services/logView.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import type { GardenLogEntry } from '../data/model'
import { describeLogEntry, formatLogDate, type LogRefs } from './logView'

const refs: LogRefs = {
  parcels: new Map([[1, { id: 1, name: 'Planche tomates' }]]),
  crops: new Map([[2, { id: 2, name: 'Tomate', status: 'en_place' }]]),
  oyas: new Map([[3, { id: 3, name: 'Oya nord', capacityLiters: 10 }]]),
  trees: new Map([[4, { id: 4, name: 'Pommier' }]]),
}

function entry(partial: Partial<GardenLogEntry>): GardenLogEntry {
  return { type: 'note', date: '2026-06-24', createdAt: 0, ...partial }
}

describe('describeLogEntry', () => {
  it('arrosage : libellé, parcelle cible, volume en détail', () => {
    const view = describeLogEntry(
      entry({ type: 'arrosage', parcelId: 1, volumeLiters: 30 }),
      refs,
    )
    expect(view).toEqual({ typeLabel: 'Arrosage', target: 'Planche tomates', detail: '30 L' })
  })

  it('récolte : culture cible, quantité en détail', () => {
    const view = describeLogEntry(entry({ type: 'recolte', cropId: 2, quantityKg: 2 }), refs)
    expect(view).toEqual({ typeLabel: 'Récolte', target: 'Tomate', detail: '2 kg' })
  })

  it("remplissage d'oya : oya cible, volume en détail", () => {
    const view = describeLogEntry(entry({ type: 'remplissage_oya', oyaId: 3, volumeLiters: 8 }), refs)
    expect(view).toEqual({ typeLabel: "Remplissage d'oya", target: 'Oya nord', detail: '8 L' })
  })

  it('observation : description en détail', () => {
    const view = describeLogEntry(
      entry({ type: 'observation', parcelId: 1, description: 'feuilles jaunes' }),
      refs,
    )
    expect(view).toEqual({
      typeLabel: 'Observation',
      target: 'Planche tomates',
      detail: 'feuilles jaunes',
    })
  })

  it('problème sans cible : description en détail, target indéfini', () => {
    const view = describeLogEntry(entry({ type: 'probleme', description: 'pucerons' }), refs)
    expect(view).toEqual({ typeLabel: 'Problème', target: undefined, detail: 'pucerons' })
  })

  it('référence manquante : ne plante pas, target indéfini', () => {
    const view = describeLogEntry(entry({ type: 'recolte', cropId: 999, quantityKg: 1 }), refs)
    expect(view.target).toBeUndefined()
    expect(view.detail).toBe('1 kg')
  })
})

describe('formatLogDate', () => {
  const now = new Date(2026, 5, 24, 18, 30) // 24 juin 2026, 18:30

  it("aujourd'hui avec heure", () => {
    expect(formatLogDate(entry({ date: '2026-06-24', time: '18:30' }), now)).toBe("aujourd'hui 18:30")
  })

  it("aujourd'hui sans heure", () => {
    expect(formatLogDate(entry({ date: '2026-06-24' }), now)).toBe("aujourd'hui")
  })

  it('hier', () => {
    expect(formatLogDate(entry({ date: '2026-06-23' }), now)).toBe('hier')
  })

  it('il y a N jours', () => {
    expect(formatLogDate(entry({ date: '2026-06-20' }), now)).toBe('il y a 4 j')
  })

  it('date ancienne en JJ/MM/AAAA', () => {
    expect(formatLogDate(entry({ date: '2026-05-01' }), now)).toBe('01/05/2026')
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && npm test -- src/services/logView.test.ts`
Expected: FAIL (`logView` n'existe pas / import non résolu).

- [ ] **Step 3 : Écrire l'implémentation**

Créer `src/services/logView.ts` :

```ts
import type {
  Crop,
  FruitTree,
  GardenLogEntry,
  LogEntryType,
  Oya,
  Parcel,
} from '../data/model'

export interface LogRefs {
  parcels: Map<number, Parcel>
  crops: Map<number, Crop>
  oyas: Map<number, Oya>
  trees: Map<number, FruitTree>
}

export interface LogEntryView {
  typeLabel: string
  target?: string
  detail?: string
}

export const LOG_TYPE_LABELS: Record<LogEntryType, string> = {
  arrosage: 'Arrosage',
  remplissage_oya: "Remplissage d'oya",
  releve_pluie: 'Relevé de pluie',
  recolte: 'Récolte',
  semis: 'Semis',
  plantation: 'Plantation',
  paillage: 'Paillage',
  traitement: 'Traitement',
  observation: 'Observation',
  probleme: 'Problème',
  compost: 'Compost',
  taille: 'Taille',
  depense: 'Dépense',
  diagnostic: 'Diagnostic',
  note: 'Note',
}

function resolveTarget(entry: GardenLogEntry, refs: LogRefs): string | undefined {
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

export function describeLogEntry(entry: GardenLogEntry, refs: LogRefs): LogEntryView {
  return {
    typeLabel: LOG_TYPE_LABELS[entry.type],
    target: resolveTarget(entry, refs),
    detail: resolveDetail(entry),
  }
}

export function formatLogDate(entry: GardenLogEntry, now: Date): string {
  const [y, m, d] = entry.date.split('-').map(Number)
  const entryDay = new Date(y, m - 1, d)
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((todayDay.getTime() - entryDay.getTime()) / 86_400_000)
  if (diffDays === 0) return entry.time ? `aujourd'hui ${entry.time}` : "aujourd'hui"
  if (diffDays === 1) return 'hier'
  if (diffDays >= 2 && diffDays <= 7) return `il y a ${diffDays} j`
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && npm test -- src/services/logView.test.ts`
Expected: PASS (11 tests verts).

- [ ] **Step 5 : Commit**

```bash
cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && git add src/services/logView.ts src/services/logView.test.ts && git commit -m "feat(palier-3): couche de formatage pure du journal (describeLogEntry, formatLogDate)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2 : Correspondance type → icône (`logTypeIcons.tsx`)

**Files:**
- Create: `src/components/logTypeIcons.tsx`
- Test: `src/components/logTypeIcons.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/components/logTypeIcons.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import type { LogEntryType } from '../data/model'
import { LOG_TYPE_ICONS } from './logTypeIcons'

const ALL_TYPES: LogEntryType[] = [
  'arrosage', 'remplissage_oya', 'releve_pluie', 'recolte', 'semis',
  'plantation', 'paillage', 'traitement', 'observation', 'probleme',
  'compost', 'taille', 'depense', 'diagnostic', 'note',
]

describe('LOG_TYPE_ICONS', () => {
  it('définit une icône pour chacun des 15 types', () => {
    for (const type of ALL_TYPES) {
      expect(LOG_TYPE_ICONS[type]).toBeDefined()
    }
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && npm test -- src/components/logTypeIcons.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : Écrire l'implémentation**

Créer `src/components/logTypeIcons.tsx` :

```tsx
import {
  AlertTriangle,
  Carrot,
  CloudRain,
  Droplet,
  Droplets,
  Euro,
  Eye,
  Layers,
  Recycle,
  Scissors,
  Shovel,
  SprayCan,
  Sprout,
  Stethoscope,
  StickyNote,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LogEntryType } from '../data/model'

export const LOG_TYPE_ICONS: Record<LogEntryType, LucideIcon> = {
  arrosage: Droplets,
  remplissage_oya: Droplet,
  releve_pluie: CloudRain,
  recolte: Carrot,
  semis: Sprout,
  plantation: Shovel,
  paillage: Layers,
  traitement: SprayCan,
  observation: Eye,
  probleme: AlertTriangle,
  compost: Recycle,
  taille: Scissors,
  depense: Euro,
  diagnostic: Stethoscope,
  note: StickyNote,
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && npm test -- src/components/logTypeIcons.test.ts`
Expected: PASS. (Si un nom d'icône n'existe pas dans lucide-react, l'import est `undefined` et le test échoue : remplacer par une icône valide proche.)

- [ ] **Step 5 : Commit**

```bash
cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && git add src/components/logTypeIcons.tsx src/components/logTypeIcons.test.ts && git commit -m "feat(palier-3): correspondance type d'entrée -> icône lucide" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3 : Écran Journal (`JournalPage.tsx`)

**Files:**
- Modify (remplacement complet) : `src/pages/JournalPage.tsx`
- Test: `src/pages/JournalPage.test.tsx`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/pages/JournalPage.test.tsx` :

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../data/db'
import { addLogEntry } from '../services/logService'
import { JournalPage } from './JournalPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

function renderJournal() {
  return render(
    <MemoryRouter>
      <JournalPage />
    </MemoryRouter>,
  )
}

describe('JournalPage', () => {
  it('affiche les entrées du journal', async () => {
    await addLogEntry({ type: 'arrosage', date: '2026-06-24', volumeLiters: 30 })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    renderJournal()
    await waitFor(() => {
      expect(screen.getByText('30 L')).toBeInTheDocument()
      expect(screen.getByText('2 kg')).toBeInTheDocument()
    })
  })

  it('un filtre de type masque les entrées des autres types', async () => {
    await addLogEntry({ type: 'arrosage', date: '2026-06-24', volumeLiters: 30 })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    renderJournal()
    await waitFor(() => expect(screen.getByText('30 L')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Récolte' }))

    expect(screen.queryByText('30 L')).not.toBeInTheDocument()
    expect(screen.getByText('2 kg')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && npm test -- src/pages/JournalPage.test.tsx`
Expected: FAIL (le placeholder n'affiche ni « 30 L » ni bouton « Récolte »).

- [ ] **Step 3 : Écrire l'implémentation (remplace tout le fichier)**

Remplacer le contenu de `src/pages/JournalPage.tsx` par :

```tsx
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { NotebookPen } from 'lucide-react'
import { db } from '../data/db'
import { listLog } from '../services/logService'
import {
  describeLogEntry,
  formatLogDate,
  LOG_TYPE_LABELS,
  type LogRefs,
} from '../services/logView'
import { LOG_TYPE_ICONS } from '../components/logTypeIcons'
import type { LogEntryType } from '../data/model'

function chipClass(active: boolean): string {
  return [
    'rounded-full px-3 py-1 text-sm font-medium transition-colors',
    active ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800 hover:bg-green-200',
  ].join(' ')
}

export function JournalPage() {
  const entries = useLiveQuery(() => listLog(), [], [])
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const oyas = useLiveQuery(() => db.oyas.toArray(), [], [])
  const trees = useLiveQuery(() => db.trees.toArray(), [], [])
  const [filter, setFilter] = useState<LogEntryType | 'tout'>('tout')

  const refs: LogRefs = {
    parcels: new Map(parcels.map((p) => [p.id!, p] as [number, typeof p])),
    crops: new Map(crops.map((c) => [c.id!, c] as [number, typeof c])),
    oyas: new Map(oyas.map((o) => [o.id!, o] as [number, typeof o])),
    trees: new Map(trees.map((t) => [t.id!, t] as [number, typeof t])),
  }

  if (entries.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        <header className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-green-100 text-green-700">
            <NotebookPen className="size-5" />
          </span>
          <h1 className="text-xl font-semibold text-green-950">Journal</h1>
        </header>
        <div className="rounded-2xl border border-dashed border-green-300 bg-white/60 p-6 text-center">
          <p className="text-sm font-medium text-green-800">Rien encore, note ta première action.</p>
          <Link
            to="/ajouter"
            className="mt-3 inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white"
          >
            Ajouter une entrée
          </Link>
        </div>
      </section>
    )
  }

  const presentTypes = [...new Set(entries.map((e) => e.type))]
  const shown = filter === 'tout' ? entries : entries.filter((e) => e.type === filter)
  const now = new Date()

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-green-950">Journal</h1>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setFilter('tout')} className={chipClass(filter === 'tout')}>
          Tout
        </button>
        {presentTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setFilter(type)}
            className={chipClass(filter === type)}
          >
            {LOG_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {shown.map((entry) => {
          const view = describeLogEntry(entry, refs)
          const Icon = LOG_TYPE_ICONS[entry.type]
          return (
            <li
              key={entry.id}
              className="flex items-start gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm"
            >
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-green-100 text-green-700">
                <Icon className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-green-950">
                  {view.typeLabel}
                  {view.target ? ` · ${view.target}` : ''}
                </p>
                {view.detail && <p className="truncate text-sm text-green-700/80">{view.detail}</p>}
              </div>
              <span className="shrink-0 text-xs text-green-700/60">{formatLogDate(entry, now)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && npm test -- src/pages/JournalPage.test.tsx`
Expected: PASS (2 tests verts). L'étiquette périmée « Palier 4 » a disparu (placeholder supprimé).

- [ ] **Step 5 : Commit**

```bash
cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && git add src/pages/JournalPage.tsx src/pages/JournalPage.test.tsx && git commit -m "feat(palier-3): écran Journal listé et filtrable par type" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4 : Écran Saisie rapide (`QuickAddPage.tsx`)

**Files:**
- Modify (remplacement complet) : `src/pages/QuickAddPage.tsx`
- Test: `src/pages/QuickAddPage.test.tsx`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/pages/QuickAddPage.test.tsx` :

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../data/db'
import { listLog } from '../services/logService'
import { QuickAddPage } from './QuickAddPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('QuickAddPage', () => {
  it('ajoute un arrosage via la tuile dédiée', async () => {
    await db.parcels.add({ name: 'Planche test' })
    render(
      <MemoryRouter>
        <QuickAddPage />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Arrosage' }))

    const option = await screen.findByRole('option', { name: 'Planche test' })
    await user.selectOptions(screen.getByLabelText('Parcelle'), option)
    await user.type(screen.getByLabelText('Volume (litres)'), '30')
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(async () => {
      const all = await listLog()
      expect(all).toHaveLength(1)
    })
    const [entry] = await listLog()
    expect(entry.type).toBe('arrosage')
    expect(entry.volumeLiters).toBe(30)
    expect(entry.parcelId).toBeDefined()
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && npm test -- src/pages/QuickAddPage.test.tsx`
Expected: FAIL (le placeholder n'a ni tuile « Arrosage » ni champ « Volume (litres) »).

- [ ] **Step 3 : Écrire l'implémentation (remplace tout le fichier)**

Remplacer le contenu de `src/pages/QuickAddPage.tsx` par :

```tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import { db } from '../data/db'
import type { LogEntryType } from '../data/model'
import { addLogEntry, type NewLogEntry } from '../services/logService'
import { LOG_TYPE_LABELS } from '../services/logView'
import { LOG_TYPE_ICONS } from '../components/logTypeIcons'

type TargetKind = 'parcelle' | 'oya' | 'culture' | 'element' | 'none'
type MeasureKind = 'volume' | 'quantite' | 'description' | 'titre_description' | 'none'

interface FormConfig {
  type: LogEntryType
  target: TargetKind
  measure: MeasureKind
  withTime: boolean
}

const FREQUENT: FormConfig[] = [
  { type: 'arrosage', target: 'parcelle', measure: 'volume', withTime: true },
  { type: 'remplissage_oya', target: 'oya', measure: 'volume', withTime: true },
  { type: 'recolte', target: 'culture', measure: 'quantite', withTime: false },
  { type: 'observation', target: 'element', measure: 'description', withTime: false },
  { type: 'probleme', target: 'element', measure: 'description', withTime: false },
]

const OTHER_TYPES: LogEntryType[] = [
  'semis', 'plantation', 'paillage', 'traitement', 'compost',
  'taille', 'depense', 'diagnostic', 'releve_pluie', 'note',
]

function genericConfig(type: LogEntryType): FormConfig {
  return { type, target: 'none', measure: 'titre_description', withTime: false }
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nowHM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type View = 'grid' | 'autre' | FormConfig

function EntryForm({ config, onSaved, onCancel }: {
  config: FormConfig
  onSaved: () => void
  onCancel: () => void
}) {
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const oyas = useLiveQuery(() => db.oyas.toArray(), [], [])
  const trees = useLiveQuery(() => db.trees.toArray(), [], [])

  const [date, setDate] = useState(todayISO())
  const [time, setTime] = useState(nowHM())
  const [targetValue, setTargetValue] = useState('')
  const [volume, setVolume] = useState('')
  const [quantity, setQuantity] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const entry: NewLogEntry = { type: config.type, date }
    if (config.withTime) entry.time = time

    if (config.target === 'parcelle' && targetValue) entry.parcelId = Number(targetValue)
    if (config.target === 'oya' && targetValue) entry.oyaId = Number(targetValue)
    if (config.target === 'culture' && targetValue) entry.cropId = Number(targetValue)
    if (config.target === 'element' && targetValue) {
      const [kind, id] = targetValue.split(':')
      if (kind === 'parcelle') entry.parcelId = Number(id)
      else if (kind === 'culture') entry.cropId = Number(id)
      else if (kind === 'arbre') entry.treeId = Number(id)
    }

    if (config.measure === 'volume' && volume) entry.volumeLiters = Number(volume)
    if (config.measure === 'quantite' && quantity) entry.quantityKg = Number(quantity)
    if (config.measure === 'description' && description) entry.description = description
    if (config.measure === 'titre_description') {
      if (title) entry.title = title
      if (description) entry.description = description
    }

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

      {config.target === 'parcelle' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Parcelle
          <select
            aria-label="Parcelle"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucune)</option>
            {parcels.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </label>
      )}

      {config.target === 'oya' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Oya
          <select
            aria-label="Oya"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucune)</option>
            {oyas.map((o) => (
              <option key={o.id} value={String(o.id)}>{o.name}</option>
            ))}
          </select>
        </label>
      )}

      {config.target === 'culture' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Culture
          <select
            aria-label="Culture"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucune)</option>
            {crops.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      {config.target === 'element' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Élément concerné (optionnel)
          <select
            aria-label="Élément concerné"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
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

export function QuickAddPage() {
  const [view, setView] = useState<View>('grid')
  const [confirmation, setConfirmation] = useState<string | null>(null)

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
        onSaved={() => {
          setConfirmation('Entrée ajoutée au journal.')
          setView('grid')
        }}
        onCancel={() => setView('grid')}
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

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && npm test -- src/pages/QuickAddPage.test.tsx`
Expected: PASS (1 test vert).

- [ ] **Step 5 : Commit**

```bash
cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && git add src/pages/QuickAddPage.tsx src/pages/QuickAddPage.test.tsx && git commit -m "feat(palier-3): écran Saisie rapide par tuiles d'action" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5 : Vérification globale + preuve navigateur

**Files:** aucun nouveau fichier ; on valide l'ensemble.

- [ ] **Step 1 : Suite de tests complète**

Run: `cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && npm test`
Expected: PASS, tous les fichiers verts (les 16 tests du palier 2 + les nouveaux des Tasks 1 à 4).

- [ ] **Step 2 : Type-check + build de production**

Run: `cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && npm run build`
Expected: `tsc -b` sans erreur puis build Vite OK. (Garde-fou : tout import d'icône lucide invalide casse ici.)

- [ ] **Step 3 : Lint**

Run: `cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && npm run lint`
Expected: oxlint sans erreur (aucune variable inutilisée, aucun import mort).

- [ ] **Step 4 : Vérification au navigateur (preview)**

Démarrer le serveur de dev (preview_start), puis vérifier sans intervention manuelle de l'utilisateur :
- `/ajouter` : la grille montre 5 tuiles + « Autre… ». Cliquer « Arrosage » ouvre le mini-formulaire (parcelle, volume, date, heure). Valider revient à la grille avec le bandeau de confirmation.
- `/journal` : l'entrée saisie apparaît (icône + « Arrosage · <parcelle> » + « N L » + date relative). Les chips de filtre apparaissent ; cliquer un type restreint la liste.
- Vérifier la console (preview_console_logs) : aucune erreur.
- Capturer les deux écrans (preview_screenshot) comme preuve.

- [ ] **Step 5 : Commit éventuel**

S'il a fallu un ajustement (icône, lint), committer :

```bash
cd "/Users/mathieugiroux/PROJETS-IA/mon-potager" && git add -A && git commit -m "fix(palier-3): ajustements vérification (build/lint/preview)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Sinon, rien à committer : le palier est terminé sur la branche `palier-3-saisie-journal`, prêt pour la fusion dans `main` (même schéma qu'au palier 2).

---

## Notes pour l'exécutant

- **Réutilisation stricte :** `addLogEntry`, `listLog`, `listLogByType` du palier 2 ne sont pas modifiés. Aucun nouveau store Dexie.
- **Règle de couche :** rien de métier dans les composants. `describeLogEntry` / `formatLogDate` portent toute la logique de présentation et sont testés isolément.
- **Pas de tiret cadratin (U+2014)** dans le code, les libellés ou les commits. Les libellés utilisent « · » comme séparateur ; les options vides s'écrivent « (aucune) » / « (aucun) ».
- **Hors périmètre (micro-palier 3b) :** saisie vocale, recherche plein texte, photos. Ne pas les amorcer ici.
- **Suivi reporté (écran Réglages, palier ultérieur) :** `settingsService.getSettings()` renvoie la référence partagée `DEFAULT_SETTINGS` quand la base est vide ; la passer en copie `{ ...DEFAULT_SETTINGS }` avant qu'un formulaire ne mute l'objet. Ne concerne pas ce palier.
