# Carte photo cliquable du jardin (4D-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la liste texte des parcelles sur `GardenPage` par des cartes photo avec une zone
cliquable (polygone tracé à la main par Mathieu), tap dans la zone ouvre directement le formulaire
d'arrosage prérempli ; ajout d'une gestion minimale des parcelles (créer, renommer, supprimer, ajouter
une photo, tracer la zone).

**Architecture:** Une fonction pure `isPointInPolygon` (nouveau fichier `geometry.ts`), un composant
`ParcelPolygonEditor` pour le tracé tap par tap, un composant `ParcelCard` pour l'affichage/gestion
d'une parcelle, et `GardenPage.tsx` modifié pour orchestrer la liste de `ParcelCard` + la création.
Le champ `Parcel.polygon` est ajouté au modèle (pas de migration Dexie, champ optionnel non indexé).
Le tap dans une zone réutilise le mécanisme `voiceDraft` déjà existant de `QuickAddPage`.

**Tech Stack:** TypeScript, Vitest + Testing Library, React 19, Tailwind 4, Dexie (IndexedDB), Lucide
icons. Pas de nouvelle dépendance.

---

## Référence : spec

Voir `docs/superpowers/specs/2026-06-27-carte-cliquable-jardin-4d2-design.md` pour le contexte complet
et les décisions actées. Résumé utilisé dans ce plan :

- Une `Parcel` = une zone dessinée à la main. Chaque parcelle a sa propre photo (`photoUrl`, déjà dans
  le modèle), pas de table partagée.
- Tracé tap par tap, un seul bouton « Recommencer » (pas d'annulation point par point).
- Tap dans le polygone (vue normale) → `navigate('/ajouter', { state: { voiceDraft: { type:
  'arrosage', parcelId } } })`.
- CRUD minimal : créer (nom), renommer (inline), supprimer (confirm), ajouter/changer la photo.
- Changer la photo d'une parcelle qui avait déjà un polygone vide ce polygone et repasse en mode
  tracé.
- Parcelle sans photo ou sans polygone valide (moins de 3 points) → repli affichage nom seul (état
  actuel).

## Fichiers concernés

- Modifier : `src/data/model.ts` (ajout du champ `polygon` sur `Parcel`)
- Créer : `src/services/geometry.ts` + `src/services/geometry.test.ts` (fonction pure
  `isPointInPolygon`)
- Créer : `src/components/ParcelPolygonEditor.tsx` + test (tracé tap par tap)
- Créer : `src/components/ParcelCard.tsx` + test (affichage + gestion d'une parcelle)
- Modifier : `src/pages/GardenPage.tsx` (remplace la section Parcelles, ajoute la création)
- Modifier : `src/pages/GardenPage.test.tsx` (adapter les tests existants à la nouvelle structure si
  besoin)

---

### Task 1 : `isPointInPolygon`

**Files:**
- Create: `src/services/geometry.ts`
- Test: `src/services/geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { isPointInPolygon } from './geometry'

describe('isPointInPolygon', () => {
  const square = [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
    { x: 0.2, y: 0.8 },
  ]

  it('detecte un point a l interieur', () => {
    expect(isPointInPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true)
  })

  it('detecte un point a l exterieur', () => {
    expect(isPointInPolygon({ x: 0.1, y: 0.1 }, square)).toBe(false)
  })

  it('detecte un point a l exterieur sur un polygone non rectangulaire', () => {
    const triangle = [
      { x: 0.1, y: 0.9 },
      { x: 0.9, y: 0.9 },
      { x: 0.5, y: 0.1 },
    ]
    expect(isPointInPolygon({ x: 0.5, y: 0.8 }, triangle)).toBe(true)
    expect(isPointInPolygon({ x: 0.1, y: 0.1 }, triangle)).toBe(false)
  })

  it('renvoie false pour un polygone avec moins de 3 points', () => {
    expect(isPointInPolygon({ x: 0.5, y: 0.5 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/geometry.test.ts`
Expected: FAIL, `Failed to resolve import "./geometry"` (le fichier n'existe pas encore).

- [ ] **Step 3: Write the implementation**

```ts
export interface PolygonPoint {
  x: number
  y: number
}

// Algorithme du ray casting : compte les croisements d'une demi-droite horizontale
// partant du point avec chaque segment du polygone. Coordonnees attendues en 0-1
// (relatives a l'image), mais fonctionne avec n'importe quelle unite coherente.
export function isPointInPolygon(point: PolygonPoint, polygon: PolygonPoint[]): boolean {
  if (polygon.length < 3) return false

  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/geometry.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/geometry.ts src/services/geometry.test.ts
git commit -m "feat(jardin): isPointInPolygon - detection de tap dans une zone"
```

---

### Task 2 : champ `polygon` sur `Parcel`

**Files:**
- Modify: `src/data/model.ts:66-75`

- [ ] **Step 1: Modifier l'interface `Parcel`**

Remplacer dans `src/data/model.ts` :

```ts
export interface Parcel {
  id?: number
  name: string
  areaM2?: number
  exposure?: Exposure
  soil?: string
  mulch?: string
  notes?: string
  photoUrl?: string
}
```

par :

```ts
export interface Parcel {
  id?: number
  name: string
  areaM2?: number
  exposure?: Exposure
  soil?: string
  mulch?: string
  notes?: string
  photoUrl?: string
  polygon?: { x: number; y: number }[] // coordonnees relatives 0-1 sur photoUrl, vide/absent = pas de zone tracee
}
```

- [ ] **Step 2: Vérifier que rien ne casse**

Run: `npx tsc --noEmit`
Expected: aucune erreur (champ optionnel, aucun code existant n'est impacté).

- [ ] **Step 3: Commit**

```bash
git add src/data/model.ts
git commit -m "feat(jardin): ajoute le champ polygon sur Parcel"
```

---

### Task 3 : `ParcelPolygonEditor` (tracé tap par tap)

**Files:**
- Create: `src/components/ParcelPolygonEditor.tsx`
- Test: `src/components/ParcelPolygonEditor.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ParcelPolygonEditor } from './ParcelPolygonEditor'

function clickAt(svg: Element, x: number, y: number) {
  fireEvent.click(svg, { clientX: x, clientY: y })
}

describe('ParcelPolygonEditor', () => {
  it('le bouton Valider est desactive avec moins de 3 points', () => {
    render(<ParcelPolygonEditor photoUrl="data:image/jpeg;base64,X" onValidate={vi.fn()} onCancel={vi.fn()} />)
    const svg = screen.getByTestId('polygon-surface')
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    clickAt(svg, 10, 10)
    clickAt(svg, 50, 10)
    expect(screen.getByRole('button', { name: 'Valider la forme' })).toBeDisabled()
  })

  it('valide la forme avec 3 points et convertit en coordonnees relatives', () => {
    const onValidate = vi.fn()
    render(<ParcelPolygonEditor photoUrl="data:image/jpeg;base64,X" onValidate={onValidate} onCancel={vi.fn()} />)
    const svg = screen.getByTestId('polygon-surface')
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    clickAt(svg, 20, 10)
    clickAt(svg, 100, 10)
    clickAt(svg, 60, 80)
    fireEvent.click(screen.getByRole('button', { name: 'Valider la forme' }))
    expect(onValidate).toHaveBeenCalledWith([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.3, y: 0.8 },
    ])
  })

  it('Recommencer vide les points et redesactive Valider', () => {
    render(<ParcelPolygonEditor photoUrl="data:image/jpeg;base64,X" onValidate={vi.fn()} onCancel={vi.fn()} />)
    const svg = screen.getByTestId('polygon-surface')
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    clickAt(svg, 20, 10)
    clickAt(svg, 100, 10)
    clickAt(svg, 60, 80)
    fireEvent.click(screen.getByRole('button', { name: 'Recommencer' }))
    expect(screen.getByRole('button', { name: 'Valider la forme' })).toBeDisabled()
  })

  it('Annuler appelle onCancel', () => {
    const onCancel = vi.fn()
    render(<ParcelPolygonEditor photoUrl="data:image/jpeg;base64,X" onValidate={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ParcelPolygonEditor.test.tsx`
Expected: FAIL, `Failed to resolve import "./ParcelPolygonEditor"`.

- [ ] **Step 3: Write the implementation**

```tsx
import { useState } from 'react'
import type { MouseEvent } from 'react'

interface Point {
  x: number
  y: number
}

interface ParcelPolygonEditorProps {
  photoUrl: string
  onValidate: (polygon: Point[]) => void
  onCancel: () => void
}

export function ParcelPolygonEditor({ photoUrl, onValidate, onCancel }: ParcelPolygonEditorProps) {
  const [points, setPoints] = useState<Point[]>([])

  function handleClick(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setPoints([...points, { x, y }])
  }

  function validate() {
    if (points.length >= 3) onValidate(points)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <img src={photoUrl} alt="Photo de la parcelle" className="w-full rounded-lg" />
        <svg
          data-testid="polygon-surface"
          onClick={handleClick}
          className="absolute inset-0 size-full"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          {points.length > 1 && (
            <polyline
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="rgb(34 197 94)"
              strokeWidth={0.006}
            />
          )}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={0.01} fill="rgb(34 197 94)" />
          ))}
        </svg>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPoints([])}
          className="rounded-lg border border-green-300 px-3 py-2 text-sm text-green-700"
        >
          Recommencer
        </button>
        <button
          type="button"
          onClick={validate}
          disabled={points.length < 3}
          className="rounded-lg bg-green-600 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Valider la forme
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/ParcelPolygonEditor.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ParcelPolygonEditor.tsx src/components/ParcelPolygonEditor.test.tsx
git commit -m "feat(jardin): ParcelPolygonEditor - trace tap par tap d une zone"
```

---

### Task 4 : `ParcelCard` (affichage + gestion d'une parcelle)

**Files:**
- Create: `src/components/ParcelCard.tsx`
- Test: `src/components/ParcelCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../data/db'
import { ParcelCard } from './ParcelCard'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

beforeEach(async () => {
  await db.parcels.clear()
  mockNavigate.mockClear()
})

describe('ParcelCard', () => {
  it('affiche le nom seul en repli sans photo ni polygone', async () => {
    const id = await db.parcels.add({ name: 'Carré sans photo' })
    const parcel = (await db.parcels.get(id))!
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    expect(screen.getByText('Carré sans photo')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('affiche la photo et la zone cliquable quand photoUrl et polygon sont presents', async () => {
    const id = await db.parcels.add({
      name: 'Planche tomates',
      photoUrl: 'data:image/jpeg;base64,X',
      polygon: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.5, y: 0.9 }],
    })
    const parcel = (await db.parcels.get(id))!
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    expect(screen.getByRole('img', { name: 'Planche tomates' })).toBeInTheDocument()
  })

  it('tap dans la zone navigue vers le formulaire d arrosage preremplit', async () => {
    const id = await db.parcels.add({
      name: 'Planche tomates',
      photoUrl: 'data:image/jpeg;base64,X',
      polygon: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.5, y: 0.9 }],
    })
    const parcel = (await db.parcels.get(id))!
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    const zone = screen.getByTestId('parcel-zone')
    zone.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    fireEvent.click(zone, { clientX: 100, clientY: 50 })
    expect(mockNavigate).toHaveBeenCalledWith('/ajouter', {
      state: { voiceDraft: { type: 'arrosage', parcelId: id } },
    })
  })

  it('tap hors de la zone ne navigue pas', async () => {
    const id = await db.parcels.add({
      name: 'Planche tomates',
      photoUrl: 'data:image/jpeg;base64,X',
      polygon: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.2, y: 0.3 }],
    })
    const parcel = (await db.parcels.get(id))!
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    const zone = screen.getByTestId('parcel-zone')
    zone.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    fireEvent.click(zone, { clientX: 190, clientY: 95 })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('permet de renommer la parcelle', async () => {
    const id = await db.parcels.add({ name: 'Ancien nom' })
    const parcel = (await db.parcels.get(id))!
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByText('Ancien nom'))
    const input = screen.getByDisplayValue('Ancien nom')
    fireEvent.change(input, { target: { value: 'Nouveau nom' } })
    fireEvent.blur(input)
    await waitFor(async () => {
      expect((await db.parcels.get(id))?.name).toBe('Nouveau nom')
    })
  })

  it('permet de supprimer la parcelle apres confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const id = await db.parcels.add({ name: 'A supprimer' })
    const parcel = (await db.parcels.get(id))!
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByLabelText('Supprimer la parcelle'))
    await waitFor(async () => {
      expect(await db.parcels.get(id)).toBeUndefined()
    })
    vi.restoreAllMocks()
  })

  it('n efface pas la parcelle si la confirmation est annulee', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const id = await db.parcels.add({ name: 'A garder' })
    const parcel = (await db.parcels.get(id))!
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByLabelText('Supprimer la parcelle'))
    await waitFor(async () => {
      expect(await db.parcels.get(id)).toBeDefined()
    })
    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ParcelCard.test.tsx`
Expected: FAIL, `Failed to resolve import "./ParcelCard"`.

- [ ] **Step 3: Write the implementation**

```tsx
import { useState } from 'react'
import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Pencil, Trash2 } from 'lucide-react'
import { db } from '../data/db'
import type { Parcel } from '../data/model'
import { compressImage } from '../services/imageService'
import { isPointInPolygon } from '../services/geometry'
import { ParcelPolygonEditor } from './ParcelPolygonEditor'

interface ParcelCardProps {
  parcel: Parcel
}

export function ParcelCard({ parcel }: ParcelCardProps) {
  const navigate = useNavigate()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(parcel.name)
  const [editingPhoto, setEditingPhoto] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | null>(null)

  const hasZone = !!parcel.photoUrl && (parcel.polygon?.length ?? 0) >= 3

  async function saveName() {
    setRenaming(false)
    const trimmed = name.trim()
    if (parcel.id != null && trimmed && trimmed !== parcel.name) {
      await db.parcels.update(parcel.id, { name: trimmed })
    } else {
      setName(parcel.name)
    }
  }

  async function removeParcel() {
    if (parcel.id == null) return
    if (window.confirm(`Supprimer la parcelle "${parcel.name}" ?`)) {
      await db.parcels.delete(parcel.id)
    }
  }

  async function handlePhotoSelected(file: File) {
    const dataUrl = await compressImage(file)
    setPendingPhotoUrl(dataUrl)
    setEditingPhoto(false)
    setDrawing(true)
  }

  async function handlePolygonValidated(polygon: { x: number; y: number }[]) {
    if (parcel.id == null) return
    await db.parcels.update(parcel.id, {
      photoUrl: pendingPhotoUrl ?? parcel.photoUrl,
      polygon,
    })
    setDrawing(false)
    setPendingPhotoUrl(null)
  }

  function handleZoneClick(e: MouseEvent<HTMLDivElement>) {
    if (!parcel.polygon) return
    const rect = e.currentTarget.getBoundingClientRect()
    const point = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    }
    if (isPointInPolygon(point, parcel.polygon)) {
      navigate('/ajouter', { state: { voiceDraft: { type: 'arrosage', parcelId: parcel.id } } })
    }
  }

  if (drawing) {
    const photoForEditor = pendingPhotoUrl ?? parcel.photoUrl
    if (!photoForEditor) return null
    return (
      <ParcelPolygonEditor
        photoUrl={photoForEditor}
        onValidate={handlePolygonValidated}
        onCancel={() => {
          setDrawing(false)
          setPendingPhotoUrl(null)
        }}
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-lg bg-green-50">
      {hasZone ? (
        <div data-testid="parcel-zone" onClick={handleZoneClick} className="relative cursor-pointer">
          <img src={parcel.photoUrl} alt={parcel.name} className="w-full" />
          <svg
            className="absolute inset-0 size-full"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
          >
            <polygon
              points={parcel.polygon!.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(34,197,94,0.25)"
              stroke="rgb(34,197,94)"
              strokeWidth={0.004}
            />
          </svg>
          <span className="absolute left-2 top-2 rounded bg-black/55 px-2 py-1 text-xs text-white">
            {parcel.name}
          </span>
        </div>
      ) : null}

      <div className="flex items-center gap-2 px-3 py-2">
        {!hasZone &&
          (renaming ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              className="rounded border border-green-300 px-1 text-sm"
            />
          ) : (
            <span onClick={() => setRenaming(true)} className="cursor-pointer font-medium">
              {parcel.name}
            </span>
          ))}
        {parcel.areaM2 && !hasZone ? (
          <span className="text-sm text-gray-500">· {parcel.areaM2} m²</span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label={hasZone ? 'Modifier la zone' : 'Ajouter une photo'}
            onClick={() => setEditingPhoto(true)}
            className="text-green-700"
          >
            <Camera size={16} />
          </button>
          {!hasZone && (
            <button type="button" aria-label="Renommer la parcelle" onClick={() => setRenaming(true)} className="text-green-700">
              <Pencil size={16} />
            </button>
          )}
          <button type="button" aria-label="Supprimer la parcelle" onClick={removeParcel} className="text-red-600">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {editingPhoto && (
        <div className="px-3 pb-3">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Choisir une photo"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handlePhotoSelected(file)
            }}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/ParcelCard.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ParcelCard.tsx src/components/ParcelCard.test.tsx
git commit -m "feat(jardin): ParcelCard - affichage et gestion d une parcelle"
```

---

### Task 5 : brancher `ParcelCard` + création dans `GardenPage`

**Files:**
- Modify: `src/pages/GardenPage.tsx`
- Modify: `src/pages/GardenPage.test.tsx`

- [ ] **Step 1: Write the failing test pour la création**

Ajouter dans `src/pages/GardenPage.test.tsx`, dans le `describe('GardenPage', ...)` existant :

```tsx
  it('permet de creer une nouvelle parcelle par son nom', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getAllByText('Planche tomates').length).toBeGreaterThan(0)
    })
    fireEvent.click(screen.getByRole('button', { name: '+ Nouvelle parcelle' }))
    const input = screen.getByLabelText('Nom de la nouvelle parcelle')
    fireEvent.change(input, { target: { value: 'Carré test' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(screen.getByText('Carré test')).toBeInTheDocument()
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/GardenPage.test.tsx -t "permet de creer une nouvelle parcelle"`
Expected: FAIL, le bouton `+ Nouvelle parcelle` n'existe pas encore.

- [ ] **Step 3: Modifier `GardenPage.tsx`**

Remplacer l'import des icônes et ajouter l'import de `ParcelCard` :

```ts
import { Sprout, Trees, MapPin, Pencil, Bell } from 'lucide-react'
```

par :

```ts
import { Sprout, Trees, MapPin, Pencil, Bell } from 'lucide-react'
import { ParcelCard } from '../components/ParcelCard'
```

Remplacer la section Parcelles :

```tsx
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
```

par :

```tsx
      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-green-700">
          <MapPin size={18} /> Parcelles
        </h2>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {parcels.map((p) => (
            <ParcelCard key={p.id} parcel={p} />
          ))}
        </div>
        {creatingParcel ? (
          <form
            className="mt-2 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              const trimmed = newParcelName.trim()
              if (trimmed) await db.parcels.add({ name: trimmed })
              setNewParcelName('')
              setCreatingParcel(false)
            }}
          >
            <input
              autoFocus
              aria-label="Nom de la nouvelle parcelle"
              value={newParcelName}
              onChange={(e) => setNewParcelName(e.target.value)}
              className="rounded border border-green-300 px-2 py-1 text-sm"
            />
            <button type="submit" className="rounded bg-green-600 px-3 py-1 text-sm text-white">
              Créer
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreatingParcel(true)}
            className="mt-2 text-sm font-medium text-green-700"
          >
            + Nouvelle parcelle
          </button>
        )}
      </section>
```

Ajouter l'état nécessaire dans `GardenPage`, juste après les `useLiveQuery` :

```ts
  const [creatingParcel, setCreatingParcel] = useState(false)
  const [newParcelName, setNewParcelName] = useState('')
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/GardenPage.test.tsx`
Expected: PASS (tous les tests, y compris le nouveau)

- [ ] **Step 5: Run the full suite and the type checker**

Run: `npx vitest run`
Expected: tous les tests passent (les nouveaux + les 249 existants, soit 249 + nouveaux ajoutés dans
ce plan).

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add src/pages/GardenPage.tsx src/pages/GardenPage.test.tsx
git commit -m "feat(jardin): carte cliquable des parcelles sur GardenPage"
```

---

### Task 6 : vérification visuelle en navigateur

**Files:** aucun fichier modifié, vérification seulement.

- [ ] **Step 1: Démarrer le serveur de dev**

Run: `npm run dev`

- [ ] **Step 2: Créer une parcelle de test, ajouter une photo, tracer une zone**

Dans la page `/jardin` : cliquer « + Nouvelle parcelle », saisir « Test carte », valider. Sur la
nouvelle carte affichée en repli (nom seul), cliquer l'icône photo, choisir un fichier image
quelconque depuis l'ordinateur. Le mode tracé doit s'afficher : tapoter 3 à 5 points sur la photo,
vérifier que les points et segments verts apparaissent au fur et à mesure, puis cliquer « Valider la
forme ».

- [ ] **Step 3: Vérifier l'affichage et le tap**

Revenir à la vue normale : la carte doit maintenant afficher la photo avec le polygone semi-transparent
dessiné dessus et le nom en badge. Cliquer à l'intérieur du polygone : doit naviguer vers `/ajouter`
avec le formulaire d'arrosage ouvert et la parcelle « Test carte » déjà sélectionnée dans le champ
parcelle.

- [ ] **Step 4: Vérifier le repli et la suppression**

Revenir sur `/jardin`, vérifier que les parcelles seedées sans photo/polygone (ex. « Rang pommes de
terre ») s'affichent toujours en repli nom seul. Supprimer la parcelle « Test carte » via l'icône
corbeille, confirmer, vérifier qu'elle disparaît de la liste.

- [ ] **Step 5: Nettoyer si besoin**

Si des données de test persistent en IndexedDB après la vérification, les supprimer via la console du
navigateur (`(await import('/src/data/db.ts')).db.parcels.where('name').equals('Test carte').delete()`).

---

## Self-Review (effectuée avant remise du plan)

- **Couverture spec** : champ `polygon` (Task 2), tracé tap par tap + Recommencer/Valider/Annuler
  (Task 3), CRUD minimal créer/renommer/supprimer/photo (Task 4 + 5), tap dans le polygone → formulaire
  prérempli (Task 4, réutilise le mécanisme `voiceDraft` existant), repli sans photo/polygone (Task 4
  et 5), remplacement de la section Parcelles (Task 5), vérification manuelle du tracé (Task 6, pas de
  test automatisé de l'UX tap-par-tap réelle au-delà des clics simulés sur l'élément SVG). Tout est
  couvert.
- **Pas de placeholder** : code complet dans chaque step.
- **Cohérence des types** : `Point`/`{ x: number; y: number }` utilisé de façon identique entre
  `geometry.ts`, `ParcelPolygonEditor`, `ParcelCard` et `Parcel.polygon` dans `model.ts`. Le nom de la
  fonction `isPointInPolygon` est identique partout où elle est importée et appelée.
