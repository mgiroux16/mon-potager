# Palier 3b-1 : recherche journal + photos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter au journal une recherche texte en direct (combinée aux filtres de type) et la capture de photos compressées attachées aux entrées, le tout 100% local.

**Architecture:** Deux fonctions pures testées isolément (`searchLogEntries`, `computeTargetDimensions`) plus un service de compression `compressImage`. La page Journal gagne un champ de recherche appliqué après le filtre de type. Un composant `PhotoInput` capture/compresse/prévisualise des photos dans `EntryForm`, qui les écrit dans le champ `photoUrls` déjà existant du modèle. Un composant `PhotoThumbs` affiche les vignettes dans le journal avec agrandissement plein écran. Aucune migration de base, aucun appel réseau.

**Tech Stack:** React + TypeScript, Vite, Dexie + dexie-react-hooks, Tailwind, lucide-react, Vitest + Testing Library (jsdom, fake-indexeddb).

---

## File Structure

- `src/services/logSearch.ts` (créer) — fonction pure `searchLogEntries` + normalisation accents/casse.
- `src/services/logSearch.test.ts` (créer) — tests de `searchLogEntries`.
- `src/services/logView.ts` (modifier) — exporter `resolveTargetName(entry, refs)` (extraction de l'actuel `resolveTarget`).
- `src/services/imageService.ts` (créer) — `computeTargetDimensions` (pure) + `compressImage` (canvas).
- `src/services/imageService.test.ts` (créer) — tests de `computeTargetDimensions`.
- `src/components/PhotoInput.tsx` (créer) — capture + aperçu + suppression de photos.
- `src/components/PhotoInput.test.tsx` (créer) — test du composant (compression mockée).
- `src/components/PhotoThumbs.tsx` (créer) — vignettes + overlay plein écran.
- `src/components/PhotoThumbs.test.tsx` (créer) — test du composant.
- `src/pages/JournalPage.tsx` (modifier) — champ de recherche + affichage des vignettes.
- `src/pages/JournalPage.test.tsx` (modifier) — tests recherche.
- `src/pages/QuickAddPage.tsx` (modifier) — intégrer `PhotoInput` dans `EntryForm`.
- `src/pages/QuickAddPage.test.tsx` (modifier) — test intégration photo (compression mockée).

---

## Task 1 : recherche, cœur pur

**Files:**
- Modify: `src/services/logView.ts`
- Create: `src/services/logSearch.ts`
- Test: `src/services/logSearch.test.ts`

- [ ] **Step 1: Exporter le resolver de nom de cible depuis logView**

Dans `src/services/logView.ts`, renommer la fonction privée `resolveTarget` en `resolveTargetName` exportée, et mettre à jour son appel dans `describeLogEntry`.

Remplacer :

```ts
function resolveTarget(entry: GardenLogEntry, refs: LogRefs): string | undefined {
  if (entry.parcelId != null) return refs.parcels.get(entry.parcelId)?.name
  if (entry.cropId != null) return refs.crops.get(entry.cropId)?.name
  if (entry.oyaId != null) return refs.oyas.get(entry.oyaId)?.name
  if (entry.treeId != null) return refs.trees.get(entry.treeId)?.name
  return undefined
}
```

par :

```ts
export function resolveTargetName(entry: GardenLogEntry, refs: LogRefs): string | undefined {
  if (entry.parcelId != null) return refs.parcels.get(entry.parcelId)?.name
  if (entry.cropId != null) return refs.crops.get(entry.cropId)?.name
  if (entry.oyaId != null) return refs.oyas.get(entry.oyaId)?.name
  if (entry.treeId != null) return refs.trees.get(entry.treeId)?.name
  return undefined
}
```

Puis, dans `describeLogEntry`, remplacer `target: resolveTarget(entry, refs),` par `target: resolveTargetName(entry, refs),`.

- [ ] **Step 2: Écrire le test de searchLogEntries (échoue)**

Créer `src/services/logSearch.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import type { GardenLogEntry } from '../data/model'
import { searchLogEntries } from './logSearch'

function entry(partial: Partial<GardenLogEntry>): GardenLogEntry {
  return { type: 'note', date: '2026-06-24', createdAt: 0, ...partial }
}

const noTarget = () => undefined

describe('searchLogEntries', () => {
  const entries: GardenLogEntry[] = [
    entry({ id: 1, type: 'observation', description: 'feuilles jaunes' }),
    entry({ id: 2, type: 'recolte', quantityKg: 2 }),
    entry({ id: 3, type: 'note', title: 'Pucerons sur le rosier' }),
  ]

  it('requête vide renvoie toutes les entrées', () => {
    expect(searchLogEntries(entries, '', noTarget)).toHaveLength(3)
  })

  it('match sur la description', () => {
    const out = searchLogEntries(entries, 'jaunes', noTarget)
    expect(out.map((e) => e.id)).toEqual([1])
  })

  it('match sur le titre', () => {
    const out = searchLogEntries(entries, 'rosier', noTarget)
    expect(out.map((e) => e.id)).toEqual([3])
  })

  it('match sur le libellé de type, insensible aux accents et à la casse', () => {
    const out = searchLogEntries(entries, 'RECOLTE', noTarget)
    expect(out.map((e) => e.id)).toEqual([2])
  })

  it('match sur le nom de cible résolu', () => {
    const out = searchLogEntries(
      entries,
      'rosier',
      (e) => (e.id === 1 ? 'Massif rosier' : undefined),
    )
    expect(out.map((e) => e.id).sort()).toEqual([1, 3])
  })

  it('multi-termes : tous les termes doivent matcher (ET)', () => {
    const out = searchLogEntries(entries, 'feuilles jaunes', noTarget)
    expect(out.map((e) => e.id)).toEqual([1])
    expect(searchLogEntries(entries, 'feuilles rosier', noTarget)).toHaveLength(0)
  })

  it('opère sur le sous-ensemble fourni (déjà filtré par type)', () => {
    const subset = entries.filter((e) => e.type === 'note')
    expect(searchLogEntries(subset, 'jaunes', noTarget)).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- src/services/logSearch.test.ts`
Expected: FAIL (`searchLogEntries` introuvable / module manquant).

- [ ] **Step 4: Implémenter searchLogEntries**

Créer `src/services/logSearch.ts` :

```ts
import type { GardenLogEntry } from '../data/model'
import { LOG_TYPE_LABELS } from './logView'

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Filtre des entrées sur une requête texte. Cherche dans le titre, la description,
// le nom de la cible résolue et le libellé du type. Plusieurs mots = ET (tous présents).
// Requête vide = aucun filtre. Insensible à la casse et aux accents.
export function searchLogEntries(
  entries: GardenLogEntry[],
  query: string,
  resolveTargetName: (entry: GardenLogEntry) => string | undefined,
): GardenLogEntry[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return entries
  return entries.filter((entry) => {
    const haystack = normalize(
      [
        entry.title,
        entry.description,
        resolveTargetName(entry),
        LOG_TYPE_LABELS[entry.type],
      ]
        .filter(Boolean)
        .join(' '),
    )
    return terms.every((term) => haystack.includes(term))
  })
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npm test -- src/services/logSearch.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Vérifier que logView n'a pas régressé**

Run: `npm test -- src/services/logView.test.ts`
Expected: PASS (tous les tests existants verts après le renommage).

- [ ] **Step 7: Commit**

```bash
git add src/services/logSearch.ts src/services/logSearch.test.ts src/services/logView.ts
git commit -m "feat(palier-3b-1): recherche journal, cœur pur searchLogEntries"
```

---

## Task 2 : champ de recherche dans JournalPage

**Files:**
- Modify: `src/pages/JournalPage.tsx`
- Test: `src/pages/JournalPage.test.tsx`

- [ ] **Step 1: Écrire les tests de recherche (échouent)**

Ajouter ces deux tests dans le `describe('JournalPage', ...)` de `src/pages/JournalPage.test.tsx` (avant la `}` de fermeture du describe) :

```ts
  it('la recherche restreint la liste affichée', async () => {
    await addLogEntry({ type: 'observation', date: '2026-06-24', description: 'feuilles jaunes' })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    renderJournal()
    await waitFor(() => expect(screen.getByText('feuilles jaunes')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Rechercher'), 'jaunes')

    expect(screen.getByText('feuilles jaunes')).toBeInTheDocument()
    expect(screen.queryByText('2 kg')).not.toBeInTheDocument()
  })

  it('la recherche est insensible aux accents via le libellé de type', async () => {
    await addLogEntry({ type: 'observation', date: '2026-06-24', description: 'feuilles jaunes' })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    renderJournal()
    await waitFor(() => expect(screen.getByText('2 kg')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Rechercher'), 'recolte')

    expect(screen.getByText('2 kg')).toBeInTheDocument()
    expect(screen.queryByText('feuilles jaunes')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/pages/JournalPage.test.tsx`
Expected: FAIL (pas de champ `placeholder="Rechercher"`).

- [ ] **Step 3: Importer searchLogEntries et resolveTargetName**

Dans `src/pages/JournalPage.tsx`, modifier l'import du service de vue pour ajouter `resolveTargetName`, et ajouter l'import de la recherche.

Remplacer :

```ts
import {
  describeLogEntry,
  formatLogDate,
  LOG_TYPE_LABELS,
  type LogRefs,
} from '../services/logView'
```

par :

```ts
import {
  describeLogEntry,
  formatLogDate,
  LOG_TYPE_LABELS,
  resolveTargetName,
  type LogRefs,
} from '../services/logView'
import { searchLogEntries } from '../services/logSearch'
```

- [ ] **Step 4: Ajouter l'état query et appliquer la recherche après le filtre de type**

Dans `JournalPage`, sous la ligne `const [filter, setFilter] = useState<LogEntryType | 'tout'>('tout')`, ajouter :

```ts
  const [query, setQuery] = useState('')
```

Puis remplacer la ligne :

```ts
  const shown = filter === 'tout' ? entries : entries.filter((e) => e.type === filter)
```

par :

```ts
  const typeFiltered = filter === 'tout' ? entries : entries.filter((e) => e.type === filter)
  const shown = searchLogEntries(typeFiltered, query, (e) => resolveTargetName(e, refs))
```

- [ ] **Step 5: Ajouter le champ de recherche dans le rendu**

Dans le `return` principal (la branche avec des entrées), juste après la ligne `<h1 className="text-xl font-semibold text-green-950">Journal</h1>` et avant le `<div className="flex flex-wrap gap-2">` des chips, insérer :

```tsx
      <input
        type="search"
        aria-label="Rechercher"
        placeholder="Rechercher"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-950"
      />
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/pages/JournalPage.test.tsx`
Expected: PASS (tests existants + 2 nouveaux).

- [ ] **Step 7: Commit**

```bash
git add src/pages/JournalPage.tsx src/pages/JournalPage.test.tsx
git commit -m "feat(palier-3b-1): champ de recherche dans le journal"
```

---

## Task 3 : service de compression d'image

**Files:**
- Create: `src/services/imageService.ts`
- Test: `src/services/imageService.test.ts`

- [ ] **Step 1: Écrire le test de computeTargetDimensions (échoue)**

Créer `src/services/imageService.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { computeTargetDimensions } from './imageService'

describe('computeTargetDimensions', () => {
  it('ne change rien si déjà sous la borne', () => {
    expect(computeTargetDimensions(800, 600, 1280)).toEqual({ width: 800, height: 600 })
  })

  it('réduit en préservant le ratio quand la largeur dépasse', () => {
    expect(computeTargetDimensions(2560, 1440, 1280)).toEqual({ width: 1280, height: 720 })
  })

  it('réduit en préservant le ratio quand la hauteur dépasse', () => {
    expect(computeTargetDimensions(1000, 4000, 1280)).toEqual({ width: 320, height: 1280 })
  })

  it('le plus grand côté ne dépasse jamais la borne', () => {
    const out = computeTargetDimensions(3000, 2000, 1280)
    expect(Math.max(out.width, out.height)).toBe(1280)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- src/services/imageService.test.ts`
Expected: FAIL (module / fonction manquante).

- [ ] **Step 3: Implémenter le service**

Créer `src/services/imageService.ts` :

```ts
export interface CompressOptions {
  maxSide?: number
  quality?: number
}

// Calcule les dimensions cibles en bornant le plus grand côté à maxSide,
// ratio préservé. Pure et testable sans canvas.
export function computeTargetDimensions(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  if (width <= maxSide && height <= maxSide) return { width, height }
  const ratio = width >= height ? maxSide / width : maxSide / height
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image illisible'))
    img.src = src
  })
}

// Lit un fichier image, le redimensionne via canvas et renvoie une data URL JPEG
// compressée. Utilise les API navigateur (FileReader, Image, canvas) : non couvert
// par les tests unitaires jsdom, la logique testable est isolée dans
// computeTargetDimensions.
export async function compressImage(file: File, options: CompressOptions = {}): Promise<string> {
  const { maxSide = 1280, quality = 0.7 } = options
  const sourceUrl = await readFileAsDataUrl(file)
  const img = await loadImage(sourceUrl)
  const { width, height } = computeTargetDimensions(img.width, img.height, maxSide)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return sourceUrl
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npm test -- src/services/imageService.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/imageService.ts src/services/imageService.test.ts
git commit -m "feat(palier-3b-1): service compressImage + computeTargetDimensions"
```

---

## Task 4 : composant PhotoInput

**Files:**
- Create: `src/components/PhotoInput.tsx`
- Test: `src/components/PhotoInput.test.tsx`

- [ ] **Step 1: Écrire le test du composant (échoue)**

Créer `src/components/PhotoInput.test.tsx` :

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoInput } from './PhotoInput'

vi.mock('../services/imageService', () => ({
  compressImage: vi.fn(async () => 'data:image/jpeg;base64,COMPRESSED'),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function file(name = 'photo.jpg'): File {
  return new File(['x'], name, { type: 'image/jpeg' })
}

describe('PhotoInput', () => {
  it('ajoute une photo compressée et notifie via onChange', async () => {
    const onChange = vi.fn()
    render(<PhotoInput photos={[]} onChange={onChange} />)
    const user = userEvent.setup()

    await user.upload(screen.getByLabelText('Ajouter une photo'), file())

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(['data:image/jpeg;base64,COMPRESSED']),
    )
  })

  it('affiche une vignette par photo existante', () => {
    render(<PhotoInput photos={['data:image/jpeg;base64,A']} onChange={vi.fn()} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/jpeg;base64,A')
  })

  it('supprime une photo via son bouton', async () => {
    const onChange = vi.fn()
    render(<PhotoInput photos={['data:image/jpeg;base64,A']} onChange={onChange} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Supprimer la photo 1' }))

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('masque le bouton d\'ajout au-delà du maximum', () => {
    render(
      <PhotoInput
        photos={['data:image/jpeg;base64,A', 'data:image/jpeg;base64,B', 'data:image/jpeg;base64,C']}
        onChange={vi.fn()}
        max={3}
      />,
    )
    expect(screen.queryByLabelText('Ajouter une photo')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- src/components/PhotoInput.test.tsx`
Expected: FAIL (module / composant manquant).

- [ ] **Step 3: Implémenter PhotoInput**

Créer `src/components/PhotoInput.tsx` :

```tsx
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Camera, X } from 'lucide-react'
import { compressImage } from '../services/imageService'

interface PhotoInputProps {
  photos: string[]
  onChange: (photos: string[]) => void
  max?: number
}

// Capture de photos optionnelle pour un formulaire d'entrée. Compresse chaque
// fichier choisi en data URL JPEG (via le service), affiche les vignettes et
// permet la suppression. L'input fichier `capture="environment"` ouvre l'appareil
// photo arrière sur mobile, et reste un sélecteur de fichier classique sur desktop.
export function PhotoInput({ photos, onChange, max = 3 }: PhotoInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const dataUrl = await compressImage(file)
      onChange([...photos, dataUrl])
    } finally {
      setBusy(false)
    }
  }

  function removeAt(index: number) {
    onChange(photos.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-green-800">Photos (optionnel)</span>
      <div className="flex flex-wrap gap-2">
        {photos.map((url, index) => (
          <div key={url} className="relative size-20 overflow-hidden rounded-lg border border-green-200">
            <img src={url} alt="" className="size-full object-cover" />
            <button
              type="button"
              aria-label={`Supprimer la photo ${index + 1}`}
              onClick={() => removeAt(index)}
              className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/55 text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="grid size-20 place-items-center rounded-lg border border-dashed border-green-300 text-green-600 disabled:opacity-50"
            >
              <Camera className="size-6" />
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="Ajouter une photo"
              onChange={handleSelect}
              className="hidden"
            />
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npm test -- src/components/PhotoInput.test.tsx`
Expected: PASS (4 tests).

Note : l'input fichier porte `aria-label="Ajouter une photo"` (pour `getByLabelText` dans le test) tandis que le bouton visible déclenche le clic. Le test « masque le bouton d'ajout » vérifie l'absence de cet input au-delà du max.

- [ ] **Step 5: Commit**

```bash
git add src/components/PhotoInput.tsx src/components/PhotoInput.test.tsx
git commit -m "feat(palier-3b-1): composant PhotoInput (capture + apercu + suppression)"
```

---

## Task 5 : intégrer PhotoInput dans EntryForm

**Files:**
- Modify: `src/pages/QuickAddPage.tsx`
- Test: `src/pages/QuickAddPage.test.tsx`

- [ ] **Step 1: Écrire le test d'intégration (échoue)**

Ajouter en haut de `src/pages/QuickAddPage.test.tsx`, juste après les imports existants, le mock du service de compression :

```ts
import { vi } from 'vitest'

vi.mock('../services/imageService', () => ({
  compressImage: vi.fn(async () => 'data:image/jpeg;base64,COMPRESSED'),
}))
```

Puis ajouter ce test dans le `describe('QuickAddPage', ...)` :

```ts
  it('attache une photo compressée à l\'entrée enregistrée', async () => {
    render(
      <MemoryRouter>
        <QuickAddPage />
      </MemoryRouter>,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Observation' }))
    await user.upload(
      screen.getByLabelText('Ajouter une photo'),
      new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
    )
    await screen.findByRole('img')
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(async () => {
      const all = await listLog()
      expect(all).toHaveLength(1)
    })
    const [entry] = await listLog()
    expect(entry.photoUrls).toEqual(['data:image/jpeg;base64,COMPRESSED'])
  })
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- src/pages/QuickAddPage.test.tsx`
Expected: FAIL (pas de champ photo dans le formulaire).

- [ ] **Step 3: Importer PhotoInput dans QuickAddPage**

Dans `src/pages/QuickAddPage.tsx`, ajouter l'import après les imports existants de composants :

```ts
import { PhotoInput } from '../components/PhotoInput'
```

- [ ] **Step 4: Ajouter l'état photos et l'écriture dans l'entrée**

Dans le composant `EntryForm`, sous la ligne `const [description, setDescription] = useState('')`, ajouter :

```ts
  const [photos, setPhotos] = useState<string[]>([])
```

Puis dans `handleSubmit`, juste avant `await addLogEntry(entry)`, ajouter :

```ts
    if (photos.length) entry.photoUrls = photos
```

- [ ] **Step 5: Rendre PhotoInput dans le formulaire**

Dans le `return` de `EntryForm`, juste avant le bloc `<div className="flex gap-3">` (celui de la date/heure), insérer :

```tsx
      <PhotoInput photos={photos} onChange={setPhotos} />
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il passe**

Run: `npm test -- src/pages/QuickAddPage.test.tsx`
Expected: PASS (test existant + nouveau).

- [ ] **Step 7: Commit**

```bash
git add src/pages/QuickAddPage.tsx src/pages/QuickAddPage.test.tsx
git commit -m "feat(palier-3b-1): photos optionnelles dans le formulaire de saisie"
```

---

## Task 6 : afficher les photos dans le journal

**Files:**
- Create: `src/components/PhotoThumbs.tsx`
- Test: `src/components/PhotoThumbs.test.tsx`
- Modify: `src/pages/JournalPage.tsx`

- [ ] **Step 1: Écrire le test du composant PhotoThumbs (échoue)**

Créer `src/components/PhotoThumbs.test.tsx` :

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoThumbs } from './PhotoThumbs'

describe('PhotoThumbs', () => {
  it('ne rend rien sans photo', () => {
    const { container } = render(<PhotoThumbs urls={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche une vignette par photo', () => {
    render(<PhotoThumbs urls={['data:image/jpeg;base64,A', 'data:image/jpeg;base64,B']} />)
    expect(screen.getAllByRole('img')).toHaveLength(2)
  })

  it('agrandit au clic puis ferme', async () => {
    render(<PhotoThumbs urls={['data:image/jpeg;base64,A']} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Agrandir la photo 1' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- src/components/PhotoThumbs.test.tsx`
Expected: FAIL (module / composant manquant).

- [ ] **Step 3: Implémenter PhotoThumbs**

Créer `src/components/PhotoThumbs.tsx` :

```tsx
import { useState } from 'react'

// Vignettes des photos d'une entrée de journal, avec agrandissement plein écran
// au clic et fermeture au clic sur l'overlay.
export function PhotoThumbs({ urls }: { urls: string[] }) {
  const [active, setActive] = useState<string | null>(null)
  if (urls.length === 0) return null

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {urls.map((url, index) => (
        <button
          key={url}
          type="button"
          aria-label={`Agrandir la photo ${index + 1}`}
          onClick={() => setActive(url)}
          className="size-12 overflow-hidden rounded-md border border-green-200"
        >
          <img src={url} alt="" className="size-full object-cover" />
        </button>
      ))}
      {active && (
        <div
          role="dialog"
          aria-label="Photo agrandie"
          onClick={() => setActive(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
        >
          <img src={active} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npm test -- src/components/PhotoThumbs.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Écrire le test d'affichage dans JournalPage (échoue)**

Ajouter ce test dans le `describe('JournalPage', ...)` de `src/pages/JournalPage.test.tsx` :

```ts
  it('affiche les vignettes des photos d\'une entrée', async () => {
    await addLogEntry({
      type: 'observation',
      date: '2026-06-24',
      description: 'feuilles jaunes',
      photoUrls: ['data:image/jpeg;base64,A'],
    })
    renderJournal()
    await waitFor(() => expect(screen.getByText('feuilles jaunes')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Agrandir la photo 1' })).toBeInTheDocument()
  })
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- src/pages/JournalPage.test.tsx`
Expected: FAIL (pas de bouton « Agrandir la photo 1 »).

- [ ] **Step 7: Afficher les vignettes dans JournalPage**

Dans `src/pages/JournalPage.tsx`, ajouter l'import :

```ts
import { PhotoThumbs } from '../components/PhotoThumbs'
```

Puis, dans le rendu d'une ligne de journal, à l'intérieur du `<div className="min-w-0 flex-1">`, juste après le bloc `{view.detail && ...}`, insérer :

```tsx
                {entry.photoUrls && entry.photoUrls.length > 0 && (
                  <PhotoThumbs urls={entry.photoUrls} />
                )}
```

- [ ] **Step 8: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/pages/JournalPage.test.tsx`
Expected: PASS (tous les tests JournalPage verts).

- [ ] **Step 9: Commit**

```bash
git add src/components/PhotoThumbs.tsx src/components/PhotoThumbs.test.tsx src/pages/JournalPage.tsx src/pages/JournalPage.test.tsx
git commit -m "feat(palier-3b-1): vignettes photos dans le journal avec agrandissement"
```

---

## Task 7 : vérification globale

**Files:** aucun (validation).

- [ ] **Step 1: Suite de tests complète**

Run: `npm test`
Expected: PASS (toute la suite verte).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: aucun warning/erreur.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `tsc -b` sans erreur de type, build Vite OK.

- [ ] **Step 4: Vérification au navigateur**

Lancer le serveur de dev et vérifier deux parcours :
1. Journal : taper un mot dans le champ de recherche restreint la liste en direct, combiné avec un filtre de type, accents/casse ignorés.
2. Photo : depuis le formulaire d'une entrée (ex. Observation), ajouter une photo, valider, vérifier qu'elle apparaît en vignette dans le journal et s'agrandit au clic, et qu'elle persiste après rechargement.

Utiliser les outils `preview_*` (preview_start, preview_screenshot, preview_snapshot) pour produire la preuve, ne pas demander à Mathieu de vérifier à la main.

---

## Critères de réussite (rappel spec)

- Recherche en direct restreignant la liste, combinée aux filtres de type, accents/casse ignorés.
- Photo capturée, compressée, stockée localement dans `photoUrls`, persistante après rechargement, affichée en vignette avec agrandissement.
- Aucun appel réseau, aucune clé API, aucune migration de base.
- Suite de tests verte, build et lint OK, vérification navigateur sur un parcours recherche et un parcours photo.
