# Palier 2 : Modèle unifié + Dexie + données réelles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doter le socle existant d'un modèle de données unifié (journal = source unique de vérité), d'un stockage IndexedDB via Dexie, et de charger le vrai jardin de Champniers + un catalogue de légumes, le tout visible dans l'app.

**Architecture:** Couche `data/` (types + schéma Dexie + données de démo), couche `services/` (logique pure et testable au-dessus de Dexie), wiring minimal dans une page existante via `dexie-react-hooks`. Aucune logique métier dans les composants. Le journal (`GardenLogEntry`) est l'unique registre ; arrosages, pluie, récoltes sont des vues filtrées.

**Tech Stack:** TypeScript, Dexie 4, dexie-react-hooks, Vitest, fake-indexeddb, @testing-library/react. Le socle est déjà en Vite 8 + React 19 + react-router-dom 7 + Tailwind 4 + vite-plugin-pwa + lucide-react + oxlint.

---

## File Structure

Fichiers créés ou modifiés dans ce palier :

- Create `vitest.config.ts` : config de test (jsdom + setup).
- Create `src/test/setup.ts` : branche fake-indexeddb et les matchers jest-dom.
- Create `src/data/model.ts` : tous les types du domaine. Une seule responsabilité : décrire la forme des données.
- Create `src/data/db.ts` : la base Dexie (schéma, stores, version). Dépend de `model.ts`.
- Create `src/services/logService.ts` : opérations sur le journal (ajout, listes, vues filtrées). Dépend de `db.ts`.
- Create `src/services/settingsService.ts` : lecture/écriture des réglages (singleton). Dépend de `db.ts`.
- Create `src/data/seed.ts` : données réelles du jardin + catalogue + `seedDatabase()` idempotent. Dépend de `model.ts` et `db.ts`.
- Modify `src/main.tsx` : appel de `seedDatabase()` au démarrage.
- Modify `src/pages/GardenPage.tsx` : afficher parcelles, cultures et arbres chargés (preuve de bout en bout).
- Modify `package.json`, `tsconfig.app.json` : scripts et types de test.

---

## Task 1 : Outillage (git + Vitest + fake-indexeddb)

**Files:**
- Init: dépôt git
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/smoke.test.ts`
- Modify: `package.json` (devDependencies + script `test`)
- Modify: `tsconfig.app.json` (types de test)

- [ ] **Step 1 : Initialiser git (le projet n'est pas encore versionné)**

Run :
```bash
cd ~/PROJETS-IA/mon-potager
git init
git add -A
git commit -m "chore: socle existant (palier 1) sous version control"
```
Expected : un premier commit créé.

- [ ] **Step 2 : Installer les dépendances de test et Dexie**

Run :
```bash
cd ~/PROJETS-IA/mon-potager
npm install dexie@^4 dexie-react-hooks@^4
npm install -D vitest@^3 jsdom@^25 fake-indexeddb@^6 @testing-library/react@^16 @testing-library/dom@^10 @testing-library/jest-dom@^6 @testing-library/user-event@^14
```
Expected : installation sans erreur. `dexie` et `dexie-react-hooks` en dependencies, le reste en devDependencies.

- [ ] **Step 3 : Ajouter le script de test dans `package.json`**

Dans `package.json`, bloc `scripts`, ajouter la ligne `test` :
```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 4 : Créer la config Vitest**

Create `vitest.config.ts` :
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
```

- [ ] **Step 5 : Créer le fichier de setup des tests**

Create `src/test/setup.ts` :
```ts
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 6 : Déclarer les types de test pour TypeScript**

Dans `tsconfig.app.json`, ajouter `"vitest/globals"` n'est PAS nécessaire (on importe explicitement). Mais ajouter les fichiers de test à l'inclusion et les types jest-dom. Vérifier que `compilerOptions.types` contient au moins :
```json
    "types": ["vite/client", "@testing-library/jest-dom"]
```
Si la clé `types` n'existe pas, l'ajouter dans `compilerOptions`. Garder l'`include` existant (`"src"`) qui couvre déjà les tests.

- [ ] **Step 7 : Écrire un test de fumée**

Create `src/test/smoke.test.ts` :
```ts
import { describe, it, expect } from 'vitest'

describe('outillage de test', () => {
  it('exécute un test trivial', () => {
    expect(1 + 1).toBe(2)
  })

  it('expose indexedDB (fake-indexeddb)', () => {
    expect(typeof indexedDB).not.toBe('undefined')
  })
})
```

- [ ] **Step 8 : Lancer les tests, vérifier qu'ils passent**

Run : `npm test`
Expected : PASS, 2 tests verts.

- [ ] **Step 9 : Commit**

```bash
git add -A
git commit -m "chore: outillage de test (vitest, fake-indexeddb, testing-library) + dexie"
```

---

## Task 2 : Types du domaine (`model.ts`)

**Files:**
- Create: `src/data/model.ts`

- [ ] **Step 1 : Créer le fichier de types**

Create `src/data/model.ts` :
```ts
// Modèle de données unifié de la PWA Mon Potager.
// Règle : le journal (GardenLogEntry) est l'unique registre d'événements.
// Arrosages, pluie, récoltes, dépenses = des vues filtrées de ce journal.

export type ISODate = string // 'YYYY-MM-DD'
export type ISOTime = string // 'HH:mm'
export type WaterNeed = 'faible' | 'moyen' | 'eleve'

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

export interface GardenLogEntry {
  id?: number
  type: LogEntryType
  date: ISODate
  time?: ISOTime
  title?: string
  description?: string
  parcelId?: number
  cropId?: number
  oyaId?: number
  treeId?: number
  volumeLiters?: number
  rainMm?: number
  quantityKg?: number
  expenseId?: number
  photoUrls?: string[]
  createdAt: number // epoch ms, pour trier de façon stable
}

export type Exposure = 'plein_soleil' | 'mi_ombre' | 'ombre'

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

export type CropStatus = 'prevu' | 'en_place' | 'en_recolte' | 'termine'

export interface Crop {
  id?: number
  name: string
  variety?: string
  parcelId?: number
  catalogId?: number
  sowingDate?: ISODate
  plantingDate?: ISODate
  harvestDate?: ISODate
  status: CropStatus
  waterNeed?: WaterNeed
  notes?: string
}

export interface Oya {
  id?: number
  name: string
  parcelId?: number
  capacityLiters: number
  currentLiters?: number
  cropIds?: number[]
}

export interface FruitTree {
  id?: number
  name: string
  variety?: string
  parcelId?: number
  shadeImpact?: string
  waterNeed?: WaterNeed
  notes?: string
}

export interface WaterTank {
  id?: number
  name: string
  capacityLiters: number
  estimatedLiters?: number
}

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

export interface CatalogItem {
  id?: number
  vegetable: string
  family: VegetableFamily
  sowingMonths?: number[] // 1-12
  plantingMonths?: number[]
  harvestMonths?: number[]
  companions?: string[]
  antagonists?: string[]
  notes?: string
}

export type ExpenseAmortization = 'consommable' | 'etale' | 'durable'

export interface Expense {
  id?: number
  label: string
  amountEuros: number
  date: ISODate
  amortization: ExpenseAmortization
  lifespanYears?: number // pour 'durable'
  usagePeriodMonths?: number // pour 'etale'
  category?: string
  parcelId?: number
  cropId?: number
}

export interface SoilNote {
  id?: number
  date: ISODate
  parcelId?: number
  kind: 'apport' | 'brf' | 'paillage' | 'compost' | 'observation'
  description?: string
}

export interface AppSettings {
  id?: number // singleton, toujours id = 1
  locationName: string
  latitude: number
  longitude: number
  frostThresholdC: number
  significantRainMm: number
  heatThresholdC: number
  defaultWateringFlowLh: number
  totalTankCapacityLiters: number
  aiLevel: 'aucune' | 'photo' | 'photo_assistant'
}
```

- [ ] **Step 2 : Vérifier que le projet compile**

Run : `npx tsc -b`
Expected : aucune erreur de type.

- [ ] **Step 3 : Commit**

```bash
git add -A
git commit -m "feat(data): types du domaine unifié (journal source unique)"
```

---

## Task 3 : Base Dexie (`db.ts`)

**Files:**
- Create: `src/data/db.ts`
- Test: `src/data/db.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Create `src/data/db.test.ts` :
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('PotagerDB', () => {
  it('expose les 10 tables du modèle', () => {
    const names = db.tables.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        'catalog',
        'crops',
        'expenses',
        'log',
        'oyas',
        'parcels',
        'settings',
        'soil',
        'tanks',
        'trees',
      ].sort(),
    )
  })

  it('écrit et relit une entrée de journal', async () => {
    const id = await db.log.add({
      type: 'arrosage',
      date: '2026-06-24',
      volumeLiters: 30,
      createdAt: Date.now(),
    })
    const back = await db.log.get(id)
    expect(back?.type).toBe('arrosage')
    expect(back?.volumeLiters).toBe(30)
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run : `npx vitest run src/data/db.test.ts`
Expected : FAIL, le module `./db` n'existe pas.

- [ ] **Step 3 : Implémenter la base Dexie**

Create `src/data/db.ts` :
```ts
import Dexie, { type Table } from 'dexie'
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
} from './model'

export class PotagerDB extends Dexie {
  log!: Table<GardenLogEntry, number>
  parcels!: Table<Parcel, number>
  crops!: Table<Crop, number>
  oyas!: Table<Oya, number>
  trees!: Table<FruitTree, number>
  tanks!: Table<WaterTank, number>
  catalog!: Table<CatalogItem, number>
  expenses!: Table<Expense, number>
  soil!: Table<SoilNote, number>
  settings!: Table<AppSettings, number>

  constructor() {
    super('mon-potager')
    this.version(1).stores({
      log: '++id, type, date, parcelId, cropId, oyaId, treeId',
      parcels: '++id, name',
      crops: '++id, name, parcelId, catalogId, status',
      oyas: '++id, name, parcelId',
      trees: '++id, name, parcelId',
      tanks: '++id, name',
      catalog: '++id, vegetable, family',
      expenses: '++id, date, amortization, parcelId, cropId',
      soil: '++id, date, parcelId',
      settings: '++id',
    })
  }
}

export const db = new PotagerDB()
```

- [ ] **Step 4 : Lancer le test, vérifier qu'il passe**

Run : `npx vitest run src/data/db.test.ts`
Expected : PASS, 2 tests verts.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "feat(data): base Dexie PotagerDB (10 stores, schéma v1)"
```

---

## Task 4 : Service journal (`logService.ts`)

**Files:**
- Create: `src/services/logService.ts`
- Test: `src/services/logService.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Create `src/services/logService.test.ts` :
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { addLogEntry, listLog, listLogByType } from './logService'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('logService', () => {
  it('ajoute une entrée et renvoie son id', async () => {
    const id = await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    expect(typeof id).toBe('number')
    const all = await listLog()
    expect(all).toHaveLength(1)
    expect(all[0].quantityKg).toBe(2)
  })

  it('renseigne createdAt automatiquement si absent', async () => {
    const before = Date.now()
    await addLogEntry({ type: 'note', date: '2026-06-24', title: 'test' })
    const [entry] = await listLog()
    expect(entry.createdAt).toBeGreaterThanOrEqual(before)
  })

  it('liste le journal du plus récent au plus ancien', async () => {
    await addLogEntry({ type: 'note', date: '2026-06-01', title: 'vieux' })
    await addLogEntry({ type: 'note', date: '2026-06-24', title: 'recent' })
    const all = await listLog()
    expect(all[0].title).toBe('recent')
    expect(all[1].title).toBe('vieux')
  })

  it('filtre par type (vue dérivée)', async () => {
    await addLogEntry({ type: 'arrosage', date: '2026-06-24', volumeLiters: 30 })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 1 })
    await addLogEntry({ type: 'arrosage', date: '2026-06-23', volumeLiters: 20 })
    const arrosages = await listLogByType('arrosage')
    expect(arrosages).toHaveLength(2)
    expect(arrosages.every((e) => e.type === 'arrosage')).toBe(true)
  })
})
```

- [ ] **Step 2 : Lancer les tests, vérifier qu'ils échouent**

Run : `npx vitest run src/services/logService.test.ts`
Expected : FAIL, module `./logService` introuvable.

- [ ] **Step 3 : Implémenter le service**

Create `src/services/logService.ts` :
```ts
import { db } from '../data/db'
import type { GardenLogEntry, LogEntryType } from '../data/model'

// Entrée à créer : tout sauf id et createdAt (générés ici).
export type NewLogEntry = Omit<GardenLogEntry, 'id' | 'createdAt'> & {
  createdAt?: number
}

export async function addLogEntry(entry: NewLogEntry): Promise<number> {
  return db.log.add({
    ...entry,
    createdAt: entry.createdAt ?? Date.now(),
  })
}

// Journal complet, du plus récent au plus ancien (date puis createdAt).
export async function listLog(): Promise<GardenLogEntry[]> {
  const all = await db.log.toArray()
  return all.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return b.createdAt - a.createdAt
  })
}

// Vue dérivée : le journal filtré sur un type (arrosages, pluie, récoltes...).
export async function listLogByType(type: LogEntryType): Promise<GardenLogEntry[]> {
  const all = await listLog()
  return all.filter((e) => e.type === type)
}
```

- [ ] **Step 4 : Lancer les tests, vérifier qu'ils passent**

Run : `npx vitest run src/services/logService.test.ts`
Expected : PASS, 4 tests verts.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "feat(services): logService (ajout, liste triée, vues filtrées)"
```

---

## Task 5 : Service réglages (`settingsService.ts`)

**Files:**
- Create: `src/services/settingsService.ts`
- Test: `src/services/settingsService.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Create `src/services/settingsService.test.ts` :
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { getSettings, saveSettings, DEFAULT_SETTINGS } from './settingsService'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('settingsService', () => {
  it('renvoie les réglages par défaut si la base est vide', async () => {
    const s = await getSettings()
    expect(s.locationName).toBe(DEFAULT_SETTINGS.locationName)
    expect(s.id).toBe(1)
  })

  it('persiste et relit les réglages (singleton id=1)', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, frostThresholdC: -2 })
    const s = await getSettings()
    expect(s.frostThresholdC).toBe(-2)
    expect(await db.settings.count()).toBe(1)
  })

  it('ne crée jamais de second enregistrement', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, heatThresholdC: 32 })
    await saveSettings({ ...DEFAULT_SETTINGS, heatThresholdC: 33 })
    expect(await db.settings.count()).toBe(1)
    const s = await getSettings()
    expect(s.heatThresholdC).toBe(33)
  })
})
```

- [ ] **Step 2 : Lancer les tests, vérifier qu'ils échouent**

Run : `npx vitest run src/services/settingsService.test.ts`
Expected : FAIL, module `./settingsService` introuvable.

- [ ] **Step 3 : Implémenter le service**

Create `src/services/settingsService.ts` :
```ts
import { db } from '../data/db'
import type { AppSettings } from '../data/model'

const SETTINGS_ID = 1

export const DEFAULT_SETTINGS: AppSettings = {
  id: SETTINGS_ID,
  locationName: 'Champniers (16430)',
  latitude: 45.72,
  longitude: 0.19,
  frostThresholdC: 0,
  significantRainMm: 5,
  heatThresholdC: 30,
  defaultWateringFlowLh: 100,
  totalTankCapacityLiters: 2500,
  aiLevel: 'photo_assistant',
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await db.settings.get(SETTINGS_ID)
  return stored ?? DEFAULT_SETTINGS
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put({ ...settings, id: SETTINGS_ID })
}
```

- [ ] **Step 4 : Lancer les tests, vérifier qu'ils passent**

Run : `npx vitest run src/services/settingsService.test.ts`
Expected : PASS, 3 tests verts.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "feat(services): settingsService (singleton id=1 + valeurs Champniers)"
```

---

## Task 6 : Données réelles + catalogue + amorçage (`seed.ts`)

**Files:**
- Create: `src/data/seed.ts`
- Test: `src/data/seed.test.ts`

Note de données : les parcelles sont des données de démo plausibles (éditables ensuite dans l'app). Les cultures, arbres, cuves et le catalogue de départ reprennent le vrai jardin documenté (spec §11). Les ids sont explicites pour câbler les relations de façon déterministe. Le catalogue de départ couvre les légumes réellement cultivés ; les autres entrées « Potabook » s'ajouteront par saisie dans l'app (palier suivant), ce n'est pas du code.

- [ ] **Step 1 : Écrire les tests qui échouent**

Create `src/data/seed.test.ts` :
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { seedDatabase, seedParcels, seedCrops } from './seed'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('seedDatabase', () => {
  it('charge le jardin réel dans une base vide', async () => {
    await seedDatabase(db)
    expect(await db.parcels.count()).toBe(seedParcels.length)
    expect(await db.crops.count()).toBe(seedCrops.length)
    expect(await db.trees.count()).toBeGreaterThan(0)
    expect(await db.tanks.count()).toBe(5)
    expect(await db.catalog.count()).toBeGreaterThan(0)
    expect(await db.settings.count()).toBe(1)
  })

  it('est idempotent (un second appel ne duplique rien)', async () => {
    await seedDatabase(db)
    await seedDatabase(db)
    expect(await db.parcels.count()).toBe(seedParcels.length)
    expect(await db.crops.count()).toBe(seedCrops.length)
  })

  it('câble les cultures à des parcelles existantes', async () => {
    await seedDatabase(db)
    const crops = await db.crops.toArray()
    const parcelIds = new Set((await db.parcels.toArray()).map((p) => p.id))
    for (const crop of crops) {
      if (crop.parcelId !== undefined) {
        expect(parcelIds.has(crop.parcelId)).toBe(true)
      }
    }
  })
})
```

- [ ] **Step 2 : Lancer les tests, vérifier qu'ils échouent**

Run : `npx vitest run src/data/seed.test.ts`
Expected : FAIL, module `./seed` introuvable.

- [ ] **Step 3 : Implémenter les données et l'amorçage**

Create `src/data/seed.ts` :
```ts
import { db, type PotagerDB } from './db'
import { DEFAULT_SETTINGS } from '../services/settingsService'
import type {
  Parcel,
  Crop,
  FruitTree,
  WaterTank,
  Oya,
  CatalogItem,
} from './model'

export const seedParcels: Parcel[] = [
  { id: 1, name: 'Planche tomates', areaM2: 25, exposure: 'plein_soleil', soil: 'argilo-calcaire', mulch: 'BRF + paille' },
  { id: 2, name: 'Rang pommes de terre', areaM2: 20, exposure: 'plein_soleil', soil: 'argilo-calcaire', mulch: 'paille' },
  { id: 3, name: 'Buttes courges et courgettes', areaM2: 30, exposure: 'plein_soleil', soil: 'argilo-calcaire', mulch: 'BRF' },
  { id: 4, name: 'Aromatiques et alliacées', areaM2: 15, exposure: 'mi_ombre', soil: 'argilo-calcaire', mulch: 'paille' },
]

export const seedTanks: WaterTank[] = [
  { id: 1, name: 'Cuve 1', capacityLiters: 500, estimatedLiters: 300 },
  { id: 2, name: 'Cuve 2', capacityLiters: 500, estimatedLiters: 300 },
  { id: 3, name: 'Cuve 3', capacityLiters: 500, estimatedLiters: 250 },
  { id: 4, name: 'Cuve 4', capacityLiters: 500, estimatedLiters: 200 },
  { id: 5, name: 'Cuve 5', capacityLiters: 500, estimatedLiters: 200 },
]

export const seedCatalog: CatalogItem[] = [
  { id: 1, vegetable: 'Tomate', family: 'solanacees', sowingMonths: [3, 4], plantingMonths: [5], harvestMonths: [7, 8, 9, 10], companions: ['Basilic', 'Oeillet d\'Inde', 'Carotte'], antagonists: ['Pomme de terre', 'Fenouil'] },
  { id: 2, vegetable: 'Pomme de terre', family: 'solanacees', plantingMonths: [3, 4], harvestMonths: [7, 8], companions: ['Haricot', 'Chou'], antagonists: ['Tomate', 'Courge'] },
  { id: 3, vegetable: 'Courgette', family: 'cucurbitacees', sowingMonths: [4, 5], plantingMonths: [5, 6], harvestMonths: [6, 7, 8, 9], companions: ['Haricot', 'Mais'], antagonists: ['Pomme de terre'] },
  { id: 4, vegetable: 'Courge', family: 'cucurbitacees', sowingMonths: [4, 5], plantingMonths: [5, 6], harvestMonths: [9, 10], companions: ['Mais', 'Haricot'], antagonists: ['Pomme de terre'] },
  { id: 5, vegetable: 'Patisson', family: 'cucurbitacees', sowingMonths: [4, 5], plantingMonths: [5, 6], harvestMonths: [8, 9, 10], companions: ['Mais', 'Haricot'], antagonists: ['Pomme de terre'] },
  { id: 6, vegetable: 'Haricot à rames', family: 'fabacees', sowingMonths: [5, 6], harvestMonths: [7, 8, 9], companions: ['Mais', 'Courgette'], antagonists: ['Ail', 'Oignon'] },
  { id: 7, vegetable: 'Oignon', family: 'alliacees', plantingMonths: [3, 4], harvestMonths: [7, 8], companions: ['Carotte', 'Betterave'], antagonists: ['Haricot', 'Pois'] },
  { id: 8, vegetable: 'Ail', family: 'alliacees', plantingMonths: [10, 11], harvestMonths: [6, 7], companions: ['Tomate', 'Carotte'], antagonists: ['Haricot', 'Pois'] },
  { id: 9, vegetable: 'Échalote', family: 'alliacees', plantingMonths: [2, 3], harvestMonths: [6, 7], companions: ['Carotte'], antagonists: ['Haricot', 'Pois'] },
  { id: 10, vegetable: 'Patate douce', family: 'autres', plantingMonths: [5, 6], harvestMonths: [10], companions: [], antagonists: [] },
]

export const seedCrops: Crop[] = [
  { id: 1, name: 'Tomates', parcelId: 1, catalogId: 1, status: 'en_place', waterNeed: 'eleve', notes: '~100 pieds, dont 30 aux oyas' },
  { id: 2, name: 'Pommes de terre Agata', variety: 'Agata', parcelId: 2, catalogId: 2, status: 'en_place', waterNeed: 'moyen', notes: '20 m linéaires' },
  { id: 3, name: 'Courgettes', parcelId: 3, catalogId: 3, status: 'en_place', waterNeed: 'eleve' },
  { id: 4, name: 'Courges', parcelId: 3, catalogId: 4, status: 'en_place', waterNeed: 'moyen' },
  { id: 5, name: 'Patisson', parcelId: 3, catalogId: 5, status: 'en_place', waterNeed: 'moyen' },
  { id: 6, name: 'Haricots à rames', parcelId: 3, catalogId: 6, status: 'en_place', waterNeed: 'moyen' },
  { id: 7, name: 'Oignons', parcelId: 4, catalogId: 7, status: 'en_place', waterNeed: 'faible' },
  { id: 8, name: 'Ail', parcelId: 4, catalogId: 8, status: 'en_place', waterNeed: 'faible' },
  { id: 9, name: 'Échalotes', parcelId: 4, catalogId: 9, status: 'en_place', waterNeed: 'faible' },
  { id: 10, name: 'Patate douce', parcelId: 3, catalogId: 10, status: 'en_place', waterNeed: 'moyen' },
]

export const seedTrees: FruitTree[] = [
  { id: 1, name: 'Pommier Belchard', variety: 'Belchard', waterNeed: 'moyen' },
  { id: 2, name: 'Pommier Red Delicious', variety: 'Red Delicious', waterNeed: 'moyen' },
  { id: 3, name: 'Pêcher plat (1)', variety: 'pêche plate', waterNeed: 'moyen' },
  { id: 4, name: 'Pêcher plat (2)', variety: 'pêche plate', waterNeed: 'moyen' },
  { id: 5, name: 'Prunabricotier hybride', variety: 'hybride prune-abricot', waterNeed: 'moyen' },
  { id: 6, name: 'Poirier Williams', variety: 'Williams', waterNeed: 'moyen' },
  { id: 7, name: 'Poirier portugais', variety: 'portugais', waterNeed: 'moyen' },
  { id: 8, name: 'Nectarinier portugais', variety: 'portugais', waterNeed: 'moyen' },
]

export const seedOyas: Oya[] = [
  { id: 1, name: 'Oyas tomates A', parcelId: 1, capacityLiters: 10, currentLiters: 6, cropIds: [1] },
  { id: 2, name: 'Oyas tomates B', parcelId: 1, capacityLiters: 10, currentLiters: 4, cropIds: [1] },
]

// Idempotent : ne fait rien si des données existent déjà.
export async function seedDatabase(database: PotagerDB = db): Promise<void> {
  const already = await database.parcels.count()
  if (already > 0) return

  await database.transaction(
    'rw',
    [
      database.settings,
      database.tanks,
      database.parcels,
      database.catalog,
      database.crops,
      database.trees,
      database.oyas,
    ],
    async () => {
      await database.settings.put(DEFAULT_SETTINGS)
      await database.tanks.bulkPut(seedTanks)
      await database.parcels.bulkPut(seedParcels)
      await database.catalog.bulkPut(seedCatalog)
      await database.crops.bulkPut(seedCrops)
      await database.trees.bulkPut(seedTrees)
      await database.oyas.bulkPut(seedOyas)
    },
  )
}
```

- [ ] **Step 4 : Lancer les tests, vérifier qu'ils passent**

Run : `npx vitest run src/data/seed.test.ts`
Expected : PASS, 3 tests verts.

- [ ] **Step 5 : Lancer toute la suite + le typecheck**

Run : `npm test && npx tsc -b`
Expected : tous les tests verts, aucune erreur de type.

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "feat(data): données réelles du jardin + catalogue + seedDatabase idempotent"
```

---

## Task 7 : Amorçage au démarrage (`main.tsx`)

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1 : Brancher l'amorçage au lancement de l'app**

Dans `src/main.tsx`, ajouter l'import et l'appel `seedDatabase()` avant `createRoot`. Le fichier actuel commence par les imports puis le bloc de purge du service worker en dev. Insérer l'import en haut avec les autres :
```ts
import { seedDatabase } from './data/seed'
```
Puis, juste avant l'appel à `createRoot(...)`, ajouter (l'amorçage est asynchrone et non bloquant : l'UI s'affiche, les données apparaissent dès que le seed est terminé) :
```ts
// Charge le vrai jardin au premier lancement (idempotent : sans effet si déjà présent).
void seedDatabase()
```

Résultat attendu de `src/main.tsx` (forme finale) :
```ts
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { seedDatabase } from './data/seed'

// En dev, purger tout service worker laissé par une session précédente :
// un SW de dev peut servir une coquille vide et provoquer une page blanche.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (regs.length > 0) {
      Promise.all(regs.map((r) => r.unregister()))
        .then(() => caches?.keys?.())
        .then((keys) => Promise.all((keys ?? []).map((k) => caches.delete(k))))
        .then(() => window.location.reload())
    }
  })
}

// Charge le vrai jardin au premier lancement (idempotent : sans effet si déjà présent).
void seedDatabase()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 2 : Vérifier le typecheck**

Run : `npx tsc -b`
Expected : aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add -A
git commit -m "feat: amorçage du jardin au démarrage de l'app"
```

---

## Task 8 : Affichage du jardin chargé (`GardenPage.tsx`)

**Files:**
- Modify: `src/pages/GardenPage.tsx`
- Test: `src/pages/GardenPage.test.tsx`

But : prouver que le modèle, le stockage et les données fonctionnent de bout en bout en affichant le jardin réel sur la page Jardin, via `useLiveQuery` (réactif aux changements de la base).

- [ ] **Step 1 : Écrire le test qui échoue**

Create `src/pages/GardenPage.test.tsx` :
```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { seedDatabase } from '../data/seed'
import { GardenPage } from './GardenPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await seedDatabase(db)
})

describe('GardenPage', () => {
  it('affiche les parcelles chargées', async () => {
    render(<GardenPage />)
    await waitFor(() => {
      expect(screen.getByText('Planche tomates')).toBeInTheDocument()
    })
  })

  it('affiche une culture et un arbre du vrai jardin', async () => {
    render(<GardenPage />)
    await waitFor(() => {
      expect(screen.getByText('Pommes de terre Agata')).toBeInTheDocument()
      expect(screen.getByText('Pommier Belchard')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run : `npx vitest run src/pages/GardenPage.test.tsx`
Expected : FAIL (la page actuelle est un placeholder, les textes n'existent pas).

- [ ] **Step 3 : Réécrire la page Jardin**

Remplacer tout le contenu de `src/pages/GardenPage.tsx` par :
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { Sprout, Trees, MapPin } from 'lucide-react'
import { db } from '../data/db'

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
            <li key={c.id} className="rounded bg-green-50 px-3 py-2">
              {c.name}
            </li>
          ))}
        </ul>
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

Note : si l'export existant de `GardenPage` est un export par défaut, vérifier `App.tsx` (il importe `{ GardenPage }`, un export nommé). Garder l'export nommé `export function GardenPage`. Ne pas changer `App.tsx`.

- [ ] **Step 4 : Lancer le test, vérifier qu'il passe**

Run : `npx vitest run src/pages/GardenPage.test.tsx`
Expected : PASS, 2 tests verts.

- [ ] **Step 5 : Vérifier toute la suite, le lint et le build**

Run : `npm test && npm run lint && npm run build`
Expected : tous les tests verts, lint sans erreur, build qui réussit.

- [ ] **Step 6 : Vérification visuelle**

Run : `npm run dev`
Ouvrir l'URL locale, aller sur l'onglet Jardin (`/jardin`). Vérifier que les parcelles, cultures et arbres réels s'affichent. Ouvrir les outils de dev > Application > IndexedDB > `mon-potager` : vérifier la présence des stores remplis.

- [ ] **Step 7 : Commit**

```bash
git add -A
git commit -m "feat(ui): page Jardin affiche le vrai jardin chargé depuis Dexie"
```

---

## Self-Review (auteur du plan)

**Couverture de la spec (palier 2 = « Modèle unifié + Dexie + catalogue Champniers + le vrai jardin chargé »)**
- Modèle unifié, journal source unique : Task 2 (types) + Task 4 (vues filtrées par type). ✓
- Stockage IndexedDB via Dexie, couche isolée : Task 3. ✓
- Services métier purs, hors composants : Task 4 et Task 5. ✓
- Catalogue Champniers : Task 6 (`seedCatalog`, légumes réellement cultivés ; le reste du Potabook = saisie ultérieure, pas du code). ✓
- Le vrai jardin chargé (parcelles, cultures, verger, cuves, oyas, réglages) : Task 6 + Task 7. ✓
- Preuve de bout en bout visible : Task 8. ✓
- Réglages Champniers + niveau IA choisi (`photo_assistant`, option 3) : Task 5 (`DEFAULT_SETTINGS`). ✓
- Ne pas réinitialiser le socle : aucune tâche ne recrée le projet ; on ajoute des fichiers et on ne modifie que `main.tsx` et `GardenPage.tsx`. ✓

**Scan placeholders** : aucun TODO/TBD ; chaque étape de code contient le code complet ; les données « Potabook » non couvertes sont explicitement une saisie utilisateur, pas un trou dans le code.

**Cohérence des types** : `GardenLogEntry`, `NewLogEntry` (Omit id+createdAt), `addLogEntry/listLog/listLogByType`, `AppSettings` (singleton id=1), `seedDatabase(database = db)`, exports nommés `seedParcels/seedCrops/seedCatalog/seedTrees/seedTanks/seedOyas` : noms identiques entre définition (Tasks 2-6) et usage (tests + Task 8). ✓

**Hors périmètre palier 2 (rappel)** : saisie rapide et journal filtrable (palier 3), eau/météo/ET0 (palier 4), calendrier idéal vs réel et copilote (palier 5), IA visuelle et assistant (palier 6), pilotage chiffré (palier 7), déploiement Tailscale (palier 8). Chacun aura son propre plan.
