# Palier 4a : fondation du modèle (variété, statut, météo, export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser les fondations du carnet de culture : la variété comme entité de plein droit, les
champs d'entrée (statut, phrase d'origine, snapshot météo réservé pour 4b), le nombre de plants,
et un export JSON de secours pour sécuriser les migrations à venir.

**Architecture:** Évolution incrémentale de la base Dexie (passage `version(1)` → `version(2)`,
aucune table jetée). Nouvelle entité `Variety` reliée au catalogue, accessible via un service
dédié. Le formulaire de saisie existant (`EntryForm` dans `QuickAddPage`) gagne un sélecteur de
variété avec création à la volée. Aucune dépendance réseau dans ce palier : la météo n'est qu'un
champ réservé, rempli au palier 4b.

**Tech Stack:** TypeScript, React 19, Dexie 4 (+ dexie-react-hooks), Vitest + fake-indexeddb +
Testing Library, Tailwind 4, oxlint.

**Conventions du dépôt (à respecter) :** pas de point-virgule, guillemets simples, indentation
2 espaces. Tests : `beforeEach` qui vide toutes les tables via `db.tables.map((t) => t.clear())`.
Vérification complète = `npm test` ET `npm run build` (le build fait le type-check `tsc -b`, que
les tests ne font pas) ET `npm run lint`.

**Hors périmètre 4a (ne pas faire ici) :** les nouveaux types d'actions culturales (repiquage,
fertilisation, tuteurage…) viennent au palier 4d ; le remplissage réel du snapshot météo vient au
palier 4b ; l'import/restauration vient au palier 4h. Ici on ne pose que les fondations.

---

## File Structure

- `src/data/model.ts` (modifier) : nouveaux types `Variety`, `WeatherSnapshot`, `EntryStatus` ;
  nouveaux champs sur `Crop` et `GardenLogEntry`.
- `src/data/db.ts` (modifier) : store `varieties`, index `varietyId`, passage en `version(2)`.
- `src/services/varietyService.ts` (créer) : CRUD des variétés.
- `src/services/varietyService.test.ts` (créer) : tests du service.
- `src/data/seed.ts` (modifier) : variétés réelles connues + lien vers la culture concernée.
- `src/data/seed.test.ts` (modifier) : vérifier le seed des variétés.
- `src/services/logService.ts` (modifier) : statut par défaut `valide` à la création.
- `src/services/logService.test.ts` (modifier) : vérifier statut + champs variété/phrase.
- `src/pages/QuickAddPage.tsx` (modifier) : sélecteur de variété + création à la volée dans
  `EntryForm`, transport de `varietyId`, `status`, `sourcePhrase`.
- `src/pages/QuickAddPage.test.tsx` (modifier, APPEND : ne pas écraser les tests existants).
- `src/services/exportService.ts` (créer) : export JSON de toutes les tables.
- `src/services/exportService.test.ts` (créer) : tests de l'export.
- `src/components/ExportButton.tsx` (créer) : bouton de téléchargement autonome.
- `src/pages/SettingsPage.tsx` (modifier) : monter `<ExportButton />`.

---

## Task 1 : Types du modèle

**Files:**
- Modify: `src/data/model.ts`

- [ ] **Step 1 : Ajouter les nouveaux types et champs**

Dans `src/data/model.ts`, ajouter après le type `WaterNeed` (vers la ligne 7) :

```ts
export type EntryStatus = 'brouillon' | 'valide'

export interface WeatherSnapshot {
  capturedAt: number // epoch ms
  tempC?: number
  tempMinC?: number
  tempMaxC?: number
  rainMm?: number
  source: 'open-meteo' | 'manuel'
}
```

Dans l'interface `GardenLogEntry`, ajouter ces champs (après `treeId?`) :

```ts
  varietyId?: number
  status?: EntryStatus
  sourcePhrase?: string // la phrase naturelle d'origine, si saisie vocale/IA
  weather?: WeatherSnapshot // snapshot figé, rempli au palier 4b
```

Dans l'interface `Crop`, ajouter (après `catalogId?`) :

```ts
  varietyId?: number
  plantCount?: number
```

Ajouter la nouvelle entité, après l'interface `Crop` :

```ts
export interface Variety {
  id?: number
  name: string // ex : 'Saint-Pierre'
  vegetable: string // ex : 'Tomate' (lien logique vers le catalogue)
  catalogId?: number // lien dur vers CatalogItem si présent
  source?: string // semencier, échange, ferme...
  notes?: string
}
```

- [ ] **Step 2 : Vérifier la compilation**

Run: `npm run build`
Expected: PASS (aucune erreur de type ; les champs sont optionnels donc rien ne casse).

- [ ] **Step 3 : Commit**

```bash
git add src/data/model.ts
git commit -m "feat(modele): types Variety, WeatherSnapshot, statut et champs varietyId"
```

---

## Task 2 : Migration Dexie version(2)

**Files:**
- Modify: `src/data/db.ts`

- [ ] **Step 1 : Écrire le test de la migration**

Créer/compléter `src/data/db.test.ts` en ajoutant ce test (garder les tests existants) :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('migration version 2', () => {
  it('expose le store varieties', async () => {
    const id = await db.varieties.add({ name: 'Saint-Pierre', vegetable: 'Tomate' })
    const stored = await db.varieties.get(id)
    expect(stored?.name).toBe('Saint-Pierre')
  })

  it('permet de filtrer le journal par varietyId', async () => {
    await db.log.add({ type: 'recolte', date: '2026-06-25', varietyId: 7, createdAt: 1 })
    await db.log.add({ type: 'recolte', date: '2026-06-25', varietyId: 9, createdAt: 2 })
    const found = await db.log.where('varietyId').equals(7).toArray()
    expect(found).toHaveLength(1)
  })
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npm test -- src/data/db.test.ts`
Expected: FAIL (`db.varieties` indéfini, index `varietyId` inconnu).

- [ ] **Step 3 : Implémenter la migration**

Dans `src/data/db.ts` : importer `Variety`, déclarer la table, ajouter `version(2)`.

Ajouter `Variety` à l'import de types et la propriété de table dans la classe :

```ts
  varieties!: Table<Variety, number>
```

Dans le constructeur, **garder** le bloc `this.version(1).stores({...})` intact et **ajouter à la
suite** :

```ts
    this.version(2).stores({
      log: '++id, type, date, parcelId, cropId, oyaId, treeId, varietyId',
      crops: '++id, name, parcelId, catalogId, status, varietyId',
      varieties: '++id, name, vegetable, catalogId',
    })
```

(Dexie hérite des stores non redéclarés ; on ne redéclare que ceux qui gagnent un index, plus le
nouveau store.)

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npm test -- src/data/db.test.ts`
Expected: PASS.

- [ ] **Step 5 : Vérifier le build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/data/db.ts src/data/db.test.ts
git commit -m "feat(db): migration v2, store varieties et index varietyId"
```

---

## Task 3 : varietyService (CRUD)

**Files:**
- Create: `src/services/varietyService.ts`
- Create: `src/services/varietyService.test.ts`

- [ ] **Step 1 : Écrire le test**

Créer `src/services/varietyService.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { addVariety, listVarieties, findOrCreateVariety } from './varietyService'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('varietyService', () => {
  it('ajoute une variété et renvoie son id', async () => {
    const id = await addVariety({ name: 'Saint-Pierre', vegetable: 'Tomate' })
    expect(typeof id).toBe('number')
    const all = await listVarieties()
    expect(all).toHaveLength(1)
    expect(all[0].name).toBe('Saint-Pierre')
  })

  it('liste les variétés par ordre alphabétique', async () => {
    await addVariety({ name: 'Roma', vegetable: 'Tomate' })
    await addVariety({ name: 'Cornue des Andes', vegetable: 'Tomate' })
    const all = await listVarieties()
    expect(all.map((v) => v.name)).toEqual(['Cornue des Andes', 'Roma'])
  })

  it('findOrCreateVariety réutilise une variété existante (même nom + légume)', async () => {
    const first = await findOrCreateVariety('Agata', 'Pomme de terre')
    const second = await findOrCreateVariety('agata', 'Pomme de terre')
    expect(second).toBe(first)
    expect(await listVarieties()).toHaveLength(1)
  })

  it('findOrCreateVariety crée si le nom diffère', async () => {
    await findOrCreateVariety('Agata', 'Pomme de terre')
    await findOrCreateVariety('Charlotte', 'Pomme de terre')
    expect(await listVarieties()).toHaveLength(2)
  })
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npm test -- src/services/varietyService.test.ts`
Expected: FAIL (`varietyService` introuvable).

- [ ] **Step 3 : Implémenter le service**

Créer `src/services/varietyService.ts` :

```ts
import { db } from '../data/db'
import type { Variety } from '../data/model'

export type NewVariety = Omit<Variety, 'id'>

export async function addVariety(variety: NewVariety): Promise<number> {
  return db.varieties.add(variety)
}

export async function listVarieties(): Promise<Variety[]> {
  const all = await db.varieties.toArray()
  return all.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

// Réutilise une variété existante (comparaison insensible à la casse sur nom + légume),
// sinon la crée. Renvoie l'id dans les deux cas.
export async function findOrCreateVariety(name: string, vegetable: string): Promise<number> {
  const norm = (s: string) => s.trim().toLowerCase()
  const all = await db.varieties.toArray()
  const existing = all.find(
    (v) => norm(v.name) === norm(name) && norm(v.vegetable) === norm(vegetable),
  )
  if (existing?.id != null) return existing.id
  return db.varieties.add({ name: name.trim(), vegetable: vegetable.trim() })
}
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npm test -- src/services/varietyService.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/services/varietyService.ts src/services/varietyService.test.ts
git commit -m "feat(varietes): varietyService CRUD et findOrCreateVariety"
```

---

## Task 4 : Seed des variétés connues

**Files:**
- Modify: `src/data/seed.ts`
- Modify: `src/data/seed.test.ts`

- [ ] **Step 1 : Écrire le test**

Dans `src/data/seed.test.ts`, ajouter ce test (garder l'existant) :

```ts
import { seedVarieties } from './seed'

it('seede au moins la variété Agata reliée à la pomme de terre', async () => {
  const { seedDatabase } = await import('./seed')
  const { db } = await import('./db')
  await seedDatabase(db)
  const all = await db.varieties.toArray()
  expect(all.some((v) => v.name === 'Agata')).toBe(true)
  expect(seedVarieties.length).toBeGreaterThan(0)
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npm test -- src/data/seed.test.ts`
Expected: FAIL (`seedVarieties` non exporté ; store non rempli).

- [ ] **Step 3 : Implémenter le seed**

Dans `src/data/seed.ts` : ajouter `Variety` à l'import de types, exporter `seedVarieties`, relier
la culture pommes de terre, et inclure le store dans la transaction du seed.

Ajout du tableau (après `seedCatalog` ou `seedCrops`) :

```ts
export const seedVarieties: Variety[] = [
  { id: 1, name: 'Agata', vegetable: 'Pomme de terre', catalogId: 2 },
]
```

Relier la culture concernée : dans `seedCrops`, sur l'entrée `id: 2` (Pommes de terre Agata),
ajouter `varietyId: 1` :

```ts
  { id: 2, name: 'Pommes de terre Agata', variety: 'Agata', varietyId: 1, parcelId: 2, catalogId: 2, status: 'en_place', waterNeed: 'moyen', notes: '20 m linéaires' },
```

Dans `seedDatabase`, ajouter `database.varieties` à la liste des tables de la transaction et au
corps :

```ts
      await database.varieties.bulkPut(seedVarieties)
```

(Ajouter `database.varieties` au tableau des stores passés à `database.transaction('rw', [...])`.)

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npm test -- src/data/seed.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/data/seed.ts src/data/seed.test.ts
git commit -m "feat(seed): variete Agata reliee a la culture pommes de terre"
```

---

## Task 5 : Statut par défaut à la création d'entrée

**Files:**
- Modify: `src/services/logService.ts`
- Modify: `src/services/logService.test.ts`

- [ ] **Step 1 : Écrire le test**

Dans `src/services/logService.test.ts`, ajouter dans le `describe('logService', ...)` :

```ts
  it('met le statut à "valide" par défaut et conserve les champs variété/phrase', async () => {
    await addLogEntry({
      type: 'recolte',
      date: '2026-06-25',
      quantityKg: 2.4,
      varietyId: 1,
      sourcePhrase: 'Aujourd hui 2,4 kg de courgettes',
    })
    const [entry] = await listLog()
    expect(entry.status).toBe('valide')
    expect(entry.varietyId).toBe(1)
    expect(entry.sourcePhrase).toBe('Aujourd hui 2,4 kg de courgettes')
  })

  it('respecte un statut explicite', async () => {
    await addLogEntry({ type: 'note', date: '2026-06-25', status: 'brouillon' })
    const [entry] = await listLog()
    expect(entry.status).toBe('brouillon')
  })
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npm test -- src/services/logService.test.ts`
Expected: FAIL (`status` indéfini sur l'entrée).

- [ ] **Step 3 : Implémenter**

Dans `src/services/logService.ts`, modifier `addLogEntry` pour poser le statut par défaut :

```ts
export async function addLogEntry(entry: NewLogEntry): Promise<number> {
  return db.log.add({
    ...entry,
    status: entry.status ?? 'valide',
    createdAt: entry.createdAt ?? Date.now(),
  })
}
```

(`NewLogEntry` est `Omit<GardenLogEntry, 'id' | 'createdAt'>` : `status`, `varietyId`,
`sourcePhrase` et `weather` sont déjà acceptés automatiquement grâce à Task 1.)

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npm test -- src/services/logService.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/services/logService.ts src/services/logService.test.ts
git commit -m "feat(journal): statut valide par defaut a la creation d entree"
```

---

## Task 6 : Sélecteur de variété dans le formulaire (avec création à la volée)

**Files:**
- Modify: `src/pages/QuickAddPage.tsx`
- Modify: `src/pages/QuickAddPage.test.tsx` (APPEND, ne pas écraser)

Objectif : quand une culture est choisie dans `EntryForm`, afficher un sélecteur de variété listant
les variétés du légume de cette culture, plus une option « + Nouvelle variété… » qui révèle un
champ texte. À la validation, on enregistre `varietyId` (créé à la volée si besoin via
`findOrCreateVariety`) et on transporte `sourcePhrase`/`status` venant d'un brouillon vocal.

- [ ] **Step 1 : Écrire le test**

Dans `src/pages/QuickAddPage.test.tsx`, **ajouter** (après les tests existants, sans toucher au
reste) :

```ts
import { findOrCreateVariety } from '../services/varietyService'

it('enregistre la varietyId choisie sur une récolte', async () => {
  const { db } = await import('../data/db')
  await db.catalog.add({ id: 3, vegetable: 'Courgette', family: 'cucurbitacees' })
  await db.crops.add({ id: 1, name: 'Courgettes', catalogId: 3, status: 'en_place' })
  await db.parcels.add({ id: 1, name: 'Buttes' })
  await findOrCreateVariety('Ronde de Nice', 'Courgette')

  renderQuickAdd() // helper déjà présent dans le fichier ; sinon : render(<MemoryRouter>...)

  // ouvrir la récolte, choisir culture puis variété, saisir le poids, valider
  // (adapter aux helpers/queries déjà utilisés dans ce fichier de test)
})
```

Note d'implémentation du test : ce fichier a déjà une façon de rendre `QuickAddPage` (router +
queries Testing Library). Réutiliser EXACTEMENT le même style que les tests voisins (mêmes
`screen.getByRole`/`getByLabelText`, même routeur). Le test doit : sélectionner la culture
« Courgettes » (`getByLabelText('Culture')`), sélectionner la variété « Ronde de Nice »
(`getByLabelText('Variété')`), remplir « Quantité (kg) » avec `1.5`, cliquer « Valider », puis
vérifier `await db.log.toArray()` : une entrée avec `varietyId` non nul et `quantityKg === 1.5`.

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npm test -- src/pages/QuickAddPage.test.tsx`
Expected: FAIL (pas de sélecteur « Variété »).

- [ ] **Step 3 : Implémenter le sélecteur dans `EntryForm`**

Dans `src/pages/QuickAddPage.tsx`, ajouter en tête de fichier l'import :

```ts
import { findOrCreateVariety } from '../services/varietyService'
```

Dans `EntryForm`, ajouter la lecture des variétés et du catalogue, et l'état local (à côté des
autres `useLiveQuery`/`useState`) :

```ts
  const varieties = useLiveQuery(() => db.varieties.toArray(), [], [])
  const catalog = useLiveQuery(() => db.catalog.toArray(), [], [])
  const [varietyId, setVarietyId] = useState(initial?.varietyId != null ? String(initial.varietyId) : '')
  const [newVarietyName, setNewVarietyName] = useState('')
```

Déterminer le légume de la culture sélectionnée (le légume vit sur le `CatalogItem` lié, pas sur
`Crop` ; on retombe sur le nom de la culture si pas de lien catalogue) :

```ts
  const selectedCrop = crops.find((c) => String(c.id) === cropId)
  const cropCatalog = catalog.find((c) => c.id === selectedCrop?.catalogId)
  const cropVegetable = cropCatalog?.vegetable ?? selectedCrop?.name ?? ''
  const cropVarieties = varieties.filter(
    (v) => cropVegetable && v.vegetable.toLowerCase() === cropVegetable.toLowerCase(),
  )
```

Ajouter le bloc d'interface juste APRÈS le sélecteur « Culture » (visible seulement si une culture
est choisie) :

```tsx
      {!useLegacyElement && visible.has('culture') && cropId && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Variété
          <select
            aria-label="Variété"
            value={varietyId}
            onChange={(e) => setVarietyId(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucune)</option>
            {cropVarieties.map((v) => (
              <option key={v.id} value={String(v.id)}>{v.name}</option>
            ))}
            <option value="__new">+ Nouvelle variété…</option>
          </select>
        </label>
      )}

      {varietyId === '__new' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Nom de la nouvelle variété
          <input
            aria-label="Nom de la nouvelle variété"
            type="text"
            value={newVarietyName}
            onChange={(e) => setNewVarietyName(e.target.value)}
            className={fieldClass}
          />
        </label>
      )}
```

Dans `handleSubmit`, AVANT `await addLogEntry(entry)`, résoudre la variété et transporter
phrase/statut. Remplacer la fin de la fonction par :

```ts
    if (photos.length) entry.photoUrls = photos

    // Variété : id existant, ou création à la volée si « + Nouvelle variété… »
    if (entry.cropId != null) {
      if (varietyId === '__new' && newVarietyName.trim()) {
        entry.varietyId = await findOrCreateVariety(newVarietyName, cropVegetable || 'Inconnu')
      } else if (varietyId && varietyId !== '__new') {
        entry.varietyId = Number(varietyId)
      }
    }

    // Transport depuis un brouillon vocal (phrase d'origine), si présent.
    if (initial?.sourcePhrase) entry.sourcePhrase = initial.sourcePhrase

    await addLogEntry(entry)
    onSaved()
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npm test -- src/pages/QuickAddPage.test.tsx`
Expected: PASS (tests existants + nouveau).

- [ ] **Step 5 : Vérifier build + lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/pages/QuickAddPage.tsx src/pages/QuickAddPage.test.tsx
git commit -m "feat(saisie): selecteur de variete avec creation a la volee"
```

---

## Task 7 : Export JSON de secours

**Files:**
- Create: `src/services/exportService.ts`
- Create: `src/services/exportService.test.ts`
- Create: `src/components/ExportButton.tsx`
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1 : Écrire le test du service**

Créer `src/services/exportService.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../data/db'
import { exportAll } from './exportService'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('exportService', () => {
  it('exporte toutes les tables avec un en-tête de version', async () => {
    await db.log.add({ type: 'note', date: '2026-06-25', title: 'test', createdAt: 1 })
    await db.varieties.add({ name: 'Agata', vegetable: 'Pomme de terre' })
    const dump = await exportAll()
    expect(dump.version).toBe(2)
    expect(typeof dump.exportedAt).toBe('number')
    expect(dump.tables.log).toHaveLength(1)
    expect(dump.tables.varieties).toHaveLength(1)
    // toutes les tables de la base sont présentes
    expect(Object.keys(dump.tables).sort()).toEqual(db.tables.map((t) => t.name).sort())
  })
})
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run: `npm test -- src/services/exportService.test.ts`
Expected: FAIL (`exportService` introuvable).

- [ ] **Step 3 : Implémenter le service**

Créer `src/services/exportService.ts` :

```ts
import { db } from '../data/db'

export interface PotagerExport {
  version: number
  exportedAt: number
  tables: Record<string, unknown[]>
}

export async function exportAll(): Promise<PotagerExport> {
  const tables: Record<string, unknown[]> = {}
  for (const table of db.tables) {
    tables[table.name] = await table.toArray()
  }
  return { version: db.verno, exportedAt: Date.now(), tables }
}
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run: `npm test -- src/services/exportService.test.ts`
Expected: PASS.

- [ ] **Step 5 : Créer le bouton autonome**

Créer `src/components/ExportButton.tsx` :

```tsx
import { useState } from 'react'
import { Download } from 'lucide-react'
import { exportAll } from '../services/exportService'

export function ExportButton() {
  const [busy, setBusy] = useState(false)

  async function handleExport() {
    setBusy(true)
    try {
      const dump = await exportAll()
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mon-potager-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={busy}
      className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
    >
      <Download className="size-4" />
      {busy ? 'Export en cours…' : 'Exporter mes données (JSON)'}
    </button>
  )
}
```

- [ ] **Step 6 : Monter le bouton dans les réglages**

Lire d'abord `src/pages/SettingsPage.tsx` pour repérer le bas du contenu rendu. Importer le
composant en tête :

```ts
import { ExportButton } from '../components/ExportButton'
```

Puis insérer, à la fin de la section principale rendue (avant la fermeture du conteneur racine),
un petit bloc « Sauvegarde » :

```tsx
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-green-900">Sauvegarde</h2>
        <ExportButton />
      </section>
```

(Adapter la balise englobante au style déjà présent dans `SettingsPage` ; ne casser aucun champ
de réglage existant.)

- [ ] **Step 7 : Vérifier l'ensemble**

Run: `npm test && npm run build && npm run lint`
Expected: PASS partout.

- [ ] **Step 8 : Commit**

```bash
git add src/services/exportService.ts src/services/exportService.test.ts src/components/ExportButton.tsx src/pages/SettingsPage.tsx
git commit -m "feat(sauvegarde): export JSON complet depuis les reglages"
```

---

## Task 8 : Vérification finale et clôture de branche

- [ ] **Step 1 : Suite complète**

Run: `npm test && npm run build && npm run lint`
Expected: tous les tests verts, build OK (type-check inclus), lint sans erreur.

- [ ] **Step 2 : Preuve navigateur**

Démarrer le serveur de dev et vérifier le parcours réel :
1. Saisie rapide → Récolte → choisir une culture → le sélecteur « Variété » apparaît.
2. Choisir « + Nouvelle variété… », saisir un nom, mettre un poids, Valider.
3. Vérifier dans le journal que l'entrée est créée ; vérifier (DevTools → IndexedDB) qu'une
   variété a été créée et que l'entrée porte `varietyId` et `status: 'valide'`.
4. Réglages → « Exporter mes données (JSON) » → un fichier `.json` se télécharge et contient les
   tables, dont `varieties`.

Aucune erreur console.

- [ ] **Step 3 : Clôturer la branche**

REQUIRED SUB-SKILL : utiliser superpowers:finishing-a-development-branch (merge sur `main`,
nettoyage de la branche de travail), comme pour les paliers précédents.

---

## Self-review (couverture du cahier des charges 4a)

- D1 hiérarchie Parcelle → Culture → Variété + nombre de plants : `Crop.varietyId` + `plantCount`
  (Task 1), variété reliée (Task 3/4), sélecteur dans la saisie (Task 6). `plantCount` est posé
  comme champ ; son édition fine arrive avec la gestion de culture (palier ultérieur).
- D2 variété entité reliée au catalogue : `Variety.catalogId` (Task 1), service (Task 3), seed
  relié (Task 4).
- D4 snapshot météo réservé : champ `weather` posé (Task 1), rempli au 4b. Pas d'UI ici (YAGNI).
- D5 statuts minimaux + phrase d'origine : `status`/`sourcePhrase` (Task 1), défaut `valide`
  (Task 5), transport depuis le brouillon vocal (Task 6).
- D6 migration incrémentale : `version(2)` sans table jetée (Task 2).
- Section 7.4 export de secours tiré en avant : Task 7.
