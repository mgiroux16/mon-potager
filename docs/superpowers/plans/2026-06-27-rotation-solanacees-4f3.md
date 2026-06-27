# Alerte rotation de famille (4f-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Détecter, pour chaque parcelle, quand une famille botanique est cultivée deux années de suite, et l'afficher dans la section Rappels de la page Jardin.

**Architecture:** Une nouvelle fonction pure `getRotationReminders` dans `src/services/reminderService.ts`, testée en isolation, puis branchée dans `src/pages/GardenPage.tsx` comme une troisième liste de rappels (même pattern que `getInactiveParcels` et `getHarvestReminders`).

**Tech Stack:** TypeScript, Vitest, React 19, Tailwind 4. Pas de nouvelle dépendance.

---

## Référence : spec

Voir `docs/superpowers/specs/2026-06-27-rotation-solanacees-4f3-design.md` pour les règles complètes. Résumé des règles utilisées dans ce plan :

- Année d'un `Crop` = année de `sowingDate ?? plantingDate`. Pas de date → ignoré.
- `Crop` sans `parcelId` ou sans `catalogId` → ignoré.
- Famille `'autres'` exclue.
- Tous les statuts comptent (y compris `'prevu'`).
- Comparaison : familles de l'année courante (dérivée de `today`) vs année courante - 1, par parcelle.
- Une entrée de résultat par `Crop` en conflit (pas de déduplication par famille).

## Types existants utilisés

Dans `src/data/model.ts` (ne pas modifier) :

```ts
export type VegetableFamily =
  | 'solanacees'
  | 'cucurbitacees'
  | 'fabacees'
  | 'brassicacees'
  | 'alliacees'
  | 'apiacees'
  | 'asteracees'
  | 'chenopodiacees'
  | 'autres'

export interface Parcel {
  id?: number
  name: string
  // ...
}

export interface Crop {
  id?: number
  name: string
  parcelId?: number
  catalogId?: number
  sowingDate?: ISODate
  plantingDate?: ISODate
  status: CropStatus
  // ...
}

export interface CatalogItem {
  id?: number
  vegetable: string
  family: VegetableFamily
  // ...
}
```

---

### Task 1: `getRotationReminders` — cas de base (alerte sur famille répétée)

**Files:**
- Modify: `src/services/reminderService.ts`
- Test: `src/services/reminderService.test.ts`

- [ ] **Step 1: Write the failing tests**

Ajouter à la fin de `src/services/reminderService.test.ts` :

```ts
describe('getRotationReminders', () => {
  const catalog: CatalogItem[] = [
    { id: 1, vegetable: 'Tomate', family: 'solanacees' },
    { id: 2, vegetable: 'Poivron', family: 'solanacees' },
    { id: 3, vegetable: 'Courgette', family: 'cucurbitacees' },
    { id: 4, vegetable: 'Radis', family: 'autres' },
  ]
  const parcels: Parcel[] = [
    { id: 1, name: 'Carré nord' },
    { id: 2, name: 'Carré sud' },
  ]

  it('alerte quand la meme famille revient sur la meme parcelle deux annees de suite', () => {
    const crops: Crop[] = [
      { id: 10, name: 'Tomate 2025', status: 'termine', parcelId: 1, catalogId: 1, plantingDate: '2025-04-01' },
      { id: 11, name: 'Poivron 2026', status: 'prevu', parcelId: 1, catalogId: 2, plantingDate: '2026-04-01' },
    ]
    const result = getRotationReminders(parcels, crops, catalog, '2026-06-27')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ family: 'solanacees', crop: crops[1] })
    expect(result[0].parcel.id).toBe(1)
  })

  it('pas d alerte quand les familles different', () => {
    const crops: Crop[] = [
      { id: 10, name: 'Tomate 2025', status: 'termine', parcelId: 1, catalogId: 1, plantingDate: '2025-04-01' },
      { id: 11, name: 'Courgette 2026', status: 'prevu', parcelId: 1, catalogId: 3, plantingDate: '2026-04-01' },
    ]
    const result = getRotationReminders(parcels, crops, catalog, '2026-06-27')
    expect(result).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/services/reminderService.test.ts -t "getRotationReminders"`
Expected: FAIL with `getRotationReminders is not a function` (ou import error, `getRotationReminders` n'existe pas encore).

- [ ] **Step 3: Write the implementation**

Ajouter en haut de `src/services/reminderService.ts`, dans l'import existant :

```ts
import type { Parcel, GardenLogEntry, Crop, CatalogItem, VegetableFamily } from '../data/model'
```

Ajouter à la fin du fichier :

```ts
export interface RotationReminder {
  parcel: Parcel
  family: VegetableFamily
  crop: Crop
}

function cropYear(crop: Crop): number | null {
  const date = crop.sowingDate ?? crop.plantingDate
  if (!date) return null
  return new Date(date).getFullYear()
}

export function getRotationReminders(
  parcels: Parcel[],
  crops: Crop[],
  catalog: CatalogItem[],
  today: string,
): RotationReminder[] {
  const currentYear = new Date(today).getFullYear()
  const previousYear = currentYear - 1

  const familiesByParcelYear = new Map<string, Set<VegetableFamily>>()

  for (const crop of crops) {
    if (crop.parcelId == null || crop.catalogId == null) continue
    const year = cropYear(crop)
    if (year == null) continue

    const catalogItem = catalog.find((c) => c.id === crop.catalogId)
    if (catalogItem == null || catalogItem.family === 'autres') continue

    const key = `${crop.parcelId}-${year}`
    const set = familiesByParcelYear.get(key) ?? new Set<VegetableFamily>()
    set.add(catalogItem.family)
    familiesByParcelYear.set(key, set)
  }

  const result: RotationReminder[] = []

  for (const crop of crops) {
    if (crop.parcelId == null || crop.catalogId == null) continue
    const year = cropYear(crop)
    if (year !== currentYear) continue

    const catalogItem = catalog.find((c) => c.id === crop.catalogId)
    if (catalogItem == null || catalogItem.family === 'autres') continue

    const previousFamilies = familiesByParcelYear.get(`${crop.parcelId}-${previousYear}`)
    if (previousFamilies?.has(catalogItem.family)) {
      const parcel = parcels.find((p) => p.id === crop.parcelId)
      if (parcel) {
        result.push({ parcel, family: catalogItem.family, crop })
      }
    }
  }

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/reminderService.test.ts -t "getRotationReminders"`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/reminderService.ts src/services/reminderService.test.ts
git commit -m "feat(rappels): getRotationReminders - alerte rotation de famille"
```

---

### Task 2: cas limites (exclusions et statut)

**Files:**
- Modify: `src/services/reminderService.test.ts`

- [ ] **Step 1: Write the failing tests**

Ajouter dans le `describe('getRotationReminders', ...)` existant :

```ts
  it('exclut la famille autres meme si elle revient deux annees de suite', () => {
    const crops: Crop[] = [
      { id: 10, name: 'Radis 2025', status: 'termine', parcelId: 1, catalogId: 4, plantingDate: '2025-04-01' },
      { id: 11, name: 'Radis 2026', status: 'prevu', parcelId: 1, catalogId: 4, plantingDate: '2026-04-01' },
    ]
    const result = getRotationReminders(parcels, crops, catalog, '2026-06-27')
    expect(result).toHaveLength(0)
  })

  it('ignore un crop sans sowingDate ni plantingDate', () => {
    const crops: Crop[] = [
      { id: 10, name: 'Tomate 2025', status: 'termine', parcelId: 1, catalogId: 1, plantingDate: '2025-04-01' },
      { id: 11, name: 'Poivron sans date', status: 'prevu', parcelId: 1, catalogId: 2 },
    ]
    const result = getRotationReminders(parcels, crops, catalog, '2026-06-27')
    expect(result).toHaveLength(0)
  })

  it('ignore un crop sans catalogId', () => {
    const crops: Crop[] = [
      { id: 10, name: 'Tomate 2025', status: 'termine', parcelId: 1, catalogId: 1, plantingDate: '2025-04-01' },
      { id: 11, name: 'Sans catalogue', status: 'prevu', parcelId: 1, plantingDate: '2026-04-01' },
    ]
    const result = getRotationReminders(parcels, crops, catalog, '2026-06-27')
    expect(result).toHaveLength(0)
  })

  it('pas d alerte si la meme famille est sur des parcelles differentes', () => {
    const crops: Crop[] = [
      { id: 10, name: 'Tomate 2025', status: 'termine', parcelId: 1, catalogId: 1, plantingDate: '2025-04-01' },
      { id: 11, name: 'Poivron 2026', status: 'prevu', parcelId: 2, catalogId: 2, plantingDate: '2026-04-01' },
    ]
    const result = getRotationReminders(parcels, crops, catalog, '2026-06-27')
    expect(result).toHaveLength(0)
  })

  it('alerte meme si le crop de cette annee est seulement prevu', () => {
    const crops: Crop[] = [
      { id: 10, name: 'Tomate 2025', status: 'termine', parcelId: 1, catalogId: 1, plantingDate: '2025-04-01' },
      { id: 11, name: 'Poivron 2026', status: 'prevu', parcelId: 1, catalogId: 2, sowingDate: '2026-03-01' },
    ]
    const result = getRotationReminders(parcels, crops, catalog, '2026-06-27')
    expect(result).toHaveLength(1)
  })
```

- [ ] **Step 2: Run tests to verify they fail or pass**

Run: `npx vitest run src/services/reminderService.test.ts -t "getRotationReminders"`
Expected: toutes les nouvelles assertions passent déjà avec l'implémentation du Task 1 (cas limites déjà couverts par la logique). Si une seule échoue, corriger l'implémentation dans `src/services/reminderService.ts` avant de continuer.

- [ ] **Step 3: Commit**

```bash
git add src/services/reminderService.test.ts
git commit -m "test(rappels): cas limites getRotationReminders"
```

---

### Task 3: brancher dans GardenPage

**Files:**
- Modify: `src/pages/GardenPage.tsx`

- [ ] **Step 1: Ajouter le label des familles et l'import**

Dans `src/pages/GardenPage.tsx`, remplacer la ligne d'import des services :

```ts
import { getInactiveParcels, getHarvestReminders } from '../services/reminderService'
```

par :

```ts
import { getInactiveParcels, getHarvestReminders, getRotationReminders } from '../services/reminderService'
import type { VegetableFamily } from '../data/model'
```

Ajouter juste après les fonctions `todayISO`/`formatPrice` existantes (avant `CropPrice`) :

```ts
const FAMILY_LABELS: Record<VegetableFamily, string> = {
  solanacees: 'solanacées',
  cucurbitacees: 'cucurbitacées',
  fabacees: 'fabacées',
  brassicacees: 'brassicacées',
  alliacees: 'alliacées',
  apiacees: 'apiacées',
  asteracees: 'astéracées',
  chenopodiacees: 'chénopodiacées',
  autres: 'autres',
}
```

- [ ] **Step 2: Calculer la liste et l'inclure dans hasReminders**

Remplacer :

```ts
  const today = todayISO()
  const inactiveParcels = getInactiveParcels(parcels, log, today)
  const harvestReminders = getHarvestReminders(crops, catalog, log, today)
  const hasReminders = inactiveParcels.length > 0 || harvestReminders.length > 0
```

par :

```ts
  const today = todayISO()
  const inactiveParcels = getInactiveParcels(parcels, log, today)
  const harvestReminders = getHarvestReminders(crops, catalog, log, today)
  const rotationReminders = getRotationReminders(parcels, crops, catalog, today)
  const hasReminders =
    inactiveParcels.length > 0 || harvestReminders.length > 0 || rotationReminders.length > 0
```

- [ ] **Step 3: Afficher la liste dans la section Rappels**

Dans la `<ul>` de la section Rappels, après le `.map` de `harvestReminders` et avant `</ul>`, ajouter :

```tsx
            {rotationReminders.map((r) => (
              <li key={`rotation-${r.crop.id}`} className="rounded bg-amber-50 px-3 py-2 text-sm">
                {r.parcel.name} : {FAMILY_LABELS[r.family]} déjà cultivées ici l'an dernier, attention à
                la rotation
              </li>
            ))}
```

- [ ] **Step 4: Run the full test suite and the type checker**

Run: `npx vitest run`
Expected: tous les tests passent (les nouveaux + les 242 existants).

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add src/pages/GardenPage.tsx
git commit -m "feat(rappels): section rotation de famille sur la page Jardin"
```

---

### Task 4: vérification visuelle en navigateur

**Files:** aucun fichier modifié, vérification seulement.

- [ ] **Step 1: Démarrer le serveur de dev**

Run: `npm run dev` (laisser tourner en arrière-plan)

- [ ] **Step 2: Créer des données de test manuelles**

Dans la console du navigateur, sur la page de l'app (avec Dexie déjà initialisé) :

```js
const db = (await import('/src/data/db.ts')).db
const parcelId = await db.parcels.add({ name: 'Carré test rotation' })
const catalogId = await db.catalog.add({ vegetable: 'Tomate', family: 'solanacees' })
await db.crops.add({ name: 'Tomate 2025', status: 'termine', parcelId, catalogId, plantingDate: '2025-04-01' })
await db.crops.add({ name: 'Tomate 2026', status: 'prevu', parcelId, catalogId, plantingDate: '2026-04-01' })
```

- [ ] **Step 3: Vérifier l'affichage**

Recharger `/jardin`. Vérifier que la section "Rappels" affiche bien :
"Carré test rotation : solanacées déjà cultivées ici l'an dernier, attention à la rotation"

- [ ] **Step 4: Nettoyer les données de test**

```js
await db.crops.where({ parcelId }).delete()
await db.catalog.delete(catalogId)
await db.parcels.delete(parcelId)
```

---

## Self-Review (effectuée avant remise du plan)

- Couverture spec : règles d'exclusion `'autres'`, dérivation d'année, statuts inclus, comparaison par parcelle, une entrée par crop : toutes couvertes par Task 1 + Task 2. Affichage couvert par Task 3. Hors périmètre (historique problèmes, champ `year`) explicitement non traité, conforme à la spec.
- Pas de placeholder : tout le code est complet dans chaque step.
- Cohérence des types : `RotationReminder`, `getRotationReminders`, `FAMILY_LABELS` utilisés de façon identique entre Task 1 et Task 3.
