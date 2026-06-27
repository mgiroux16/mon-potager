# Synchro Dexie ↔ Firestore (Phase C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchroniser les données Dexie de Mathieu entre ses appareils via Firestore, en quasi temps réel, sans jamais bloquer l'usage hors ligne.

**Architecture:** Migration Dexie v8 ajoute `updatedAt`/`deletedAt` sur les 12 tables. Des hooks Dexie natifs (`creating`/`updating`/`reading`) stampent et filtrent automatiquement sans toucher aux call sites existants. Un `softDelete()` remplace les 3 `.delete()` directs. Un `syncService` pousse vers `users/{uid}/{table}/{id}` et tire via `onSnapshot`, avec merge dernier-écrit-gagne sur `updatedAt`.

**Tech Stack:** Dexie 4, `firebase/firestore` (déjà dans la dépendance `firebase` existante), Vitest, React.

---

Spec de référence : `docs/superpowers/specs/2026-06-27-sync-firestore-phase-c-design.md`

## Task 1: Migration Dexie v8 — `updatedAt`/`deletedAt`

**Files:**
- Modify: `src/data/db.ts`
- Test: `src/data/db.migration.test.ts`

- [ ] **Step 1: Write the failing test**

Ajouter à la fin de `src/data/db.migration.test.ts` :

```ts
describe('migration v8 (ajout updatedAt/deletedAt)', () => {
  it('donne un updatedAt aux lignes existantes qui n\'en ont pas', async () => {
    const legacy = new LegacyDB()
    await legacy.open()
    const parcelId = await legacy.table('parcels').add({ name: 'Planche tomates', areaM2: 25 })
    legacy.close()

    const upgraded = new PotagerDB()
    await upgraded.open()
    const parcel = await upgraded.parcels.get(
      (await upgraded.parcels.toArray())[0].id as string,
    )
    expect(parcel?.updatedAt).toBeTypeOf('number')
    upgraded.close()
    void parcelId
  })

  it('peut filtrer/indexer par updatedAt sans erreur', async () => {
    const upgraded = new PotagerDB()
    await upgraded.open()
    const rows = await upgraded.parcels.where('updatedAt').above(0).toArray()
    expect(rows).toEqual([])
    upgraded.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/db.migration.test.ts -t "migration v8"`
Expected: FAIL — `parcel?.updatedAt` est `undefined`, et `where('updatedAt')` lève une erreur (index absent du schema v7).

- [ ] **Step 3: Implement migration v8**

Dans `src/data/db.ts`, ajouter un index `updatedAt` à chaque entrée de `FINAL_STORES` (modifier la constante existante) :

```ts
const FINAL_STORES: Record<string, string> = {
  log: 'id, type, date, parcelId, cropId, oyaId, treeId, varietyId, updatedAt',
  parcels: 'id, name, updatedAt',
  crops: 'id, name, parcelId, catalogId, status, varietyId, updatedAt',
  oyas: 'id, name, parcelId, updatedAt',
  trees: 'id, name, parcelId, updatedAt',
  tanks: 'id, name, updatedAt',
  catalog: 'id, vegetable, family, updatedAt',
  expenses: 'id, date, amortization, parcelId, cropId, updatedAt',
  soil: 'id, date, parcelId, updatedAt',
  settings: 'id, updatedAt',
  varieties: 'id, name, vegetable, catalogId, updatedAt',
  seasonNotes: 'id, year, cropId, parcelId, updatedAt',
}
```

Puis, dans le constructeur de `PotagerDB`, juste après le bloc `this.version(7).stores(...)` existant et avant la fermeture du constructeur, ajouter :

```ts
this.version(8)
  .stores(Object.fromEntries(TABLE_NAMES.map((name) => [name, FINAL_STORES[name]])))
  .upgrade(async (tx) => {
    for (const name of TABLE_NAMES) {
      const rows = await tx.table(name).toArray()
      for (const row of rows) {
        if (typeof row.updatedAt !== 'number') {
          await tx.table(name).update(row.id, {
            updatedAt: typeof row.createdAt === 'number' ? row.createdAt : Date.now(),
          })
        }
      }
    }
  })
```

Note : `FINAL_STORES` est déjà utilisé par la version 6 (`this.version(6).stores(...)`). Comme c'est la
même constante référencée, son nouvel index `updatedAt` s'applique aussi rétroactivement à la version 6
dans la chaîne de migration — c'est le comportement voulu et sans danger : Dexie rejoue les versions en
séquence depuis la version détectée sur le disque jusqu'à la dernière déclarée.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/db.migration.test.ts`
Expected: PASS — tous les tests, y compris ceux de la migration v3→v4 déjà existants.

- [ ] **Step 5: Commit**

```bash
git add src/data/db.ts src/data/db.migration.test.ts
git commit -m "feat(sync): migration Dexie v8 - ajout updatedAt indexe sur les 12 tables"
```

## Task 2: Champs `updatedAt`/`deletedAt` dans `model.ts`

**Files:**
- Modify: `src/data/model.ts`

- [ ] **Step 1: Ajouter les champs à chaque interface concernée**

Dans `src/data/model.ts`, ajouter `updatedAt?: number` et `deletedAt?: number` à la fin de chacune des
interfaces suivantes : `GardenLogEntry`, `Parcel`, `Crop`, `Variety`, `Oya`, `FruitTree`, `WaterTank`,
`CatalogItem`, `Expense`, `SoilNote`, `AppSettings`, `SeasonNote`.

Exemple pour `Parcel` (ligne 66-82 actuelle) :

```ts
export interface Parcel {
  id?: string
  name: string
  areaM2?: number
  exposure?: Exposure
  soil?: string
  mulch?: string
  notes?: string
  photoUrl?: string
  polygon?: { x: number; y: number }[]
  mapX?: number
  mapY?: number
  mapWidth?: number
  mapHeight?: number
  mapRotation?: 0 | 90 | 180 | 270
  updatedAt?: number // epoch ms, mis a jour automatiquement par les hooks Dexie
  deletedAt?: number // epoch ms, presence = supprime logiquement (tombstone)
}
```

Répéter le même ajout des deux champs en fin de chacune des 11 autres interfaces listées ci-dessus.

- [ ] **Step 2: Vérifier que le typecheck passe**

Run: `npx tsc --noEmit`
Expected: aucune erreur (les champs sont optionnels, rien d'existant ne casse).

- [ ] **Step 3: Commit**

```bash
git add src/data/model.ts
git commit -m "feat(sync): ajout des champs updatedAt/deletedAt au modele de donnees"
```

## Task 3: Hooks Dexie centralisés (`syncHooks.ts`)

**Files:**
- Create: `src/data/syncHooks.ts`
- Test: `src/data/syncHooks.test.ts`
- Modify: `src/data/db.ts` (appel d'initialisation des hooks)

- [ ] **Step 1: Write the failing test**

Créer `src/data/syncHooks.test.ts` :

```ts
import Dexie from 'dexie'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { db, newId } from './db'
import { softDelete } from './syncHooks'

const DB_NAME = 'mon-potager'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  db.close()
  await Dexie.delete(DB_NAME)
})

describe('hooks Dexie de synchro', () => {
  it('injecte updatedAt a la creation', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Test' })
    const row = await db.parcels.get(id)
    expect(row?.updatedAt).toBeTypeOf('number')
  })

  it('rafraichit updatedAt a chaque update', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Test' })
    const before = (await db.parcels.get(id))?.updatedAt as number
    await new Promise((r) => setTimeout(r, 5))
    await db.parcels.update(id, { name: 'Test modifie' })
    const after = (await db.parcels.get(id))?.updatedAt as number
    expect(after).toBeGreaterThan(before)
  })

  it('filtre les lignes avec deletedAt a la lecture', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Test' })
    await db.parcels.update(id, { deletedAt: Date.now() })
    const rows = await db.parcels.toArray()
    expect(rows).toHaveLength(0)
    const direct = await db.parcels.get(id)
    expect(direct).toBeUndefined()
  })

  it('softDelete marque deletedAt sans supprimer la ligne', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Test' })
    await softDelete('parcels', id)
    const rows = await db.parcels.toArray()
    expect(rows).toHaveLength(0)
    // la ligne existe toujours physiquement (verifie via une requete brute hors hook)
    const rawCount = await db.table('parcels').count()
    expect(rawCount).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/syncHooks.test.ts`
Expected: FAIL — `./syncHooks` n'existe pas encore.

- [ ] **Step 3: Implement `syncHooks.ts`**

Créer `src/data/syncHooks.ts` :

```ts
import { db } from './db'

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
] as const

export type TableName = (typeof TABLE_NAMES)[number]

let installed = false

export function installSyncHooks(): void {
  if (installed) return
  installed = true

  for (const name of TABLE_NAMES) {
    const table = db.table(name)

    table.hook('creating', (_primKey, obj) => {
      if (typeof (obj as Record<string, unknown>).updatedAt !== 'number') {
        ;(obj as Record<string, unknown>).updatedAt = Date.now()
      }
    })

    table.hook('updating', (modifications) => {
      const mods = modifications as Record<string, unknown>
      if (typeof mods.updatedAt !== 'number') {
        return { ...mods, updatedAt: Date.now() }
      }
      return modifications
    })

    table.hook('reading', (obj) => {
      const row = obj as Record<string, unknown>
      return typeof row.deletedAt === 'number' ? undefined : obj
    })
  }
}

export async function softDelete(table: TableName, id: string): Promise<void> {
  await db.table(table).update(id, { deletedAt: Date.now() })
}
```

Dans `src/data/db.ts`, à la fin du fichier, après `export const db = new PotagerDB()`, ajouter
l'appel d'installation des hooks (avant l'export de `newId`) :

```ts
export const db = new PotagerDB()

installSyncHooks()

export const newId = (): string => crypto.randomUUID()
```

Et ajouter l'import en haut du fichier : `import { installSyncHooks } from './syncHooks'`.

Attention : `syncHooks.ts` importe `db` depuis `./db`, et `db.ts` importe `installSyncHooks` depuis
`./syncHooks` — c'est une dépendance circulaire au niveau module, mais sans risque ici car
`installSyncHooks` n'utilise `db` qu'à l'intérieur de la fonction (pas au moment du `import`), donc
au moment où `installSyncHooks()` est réellement appelé, `db` est déjà initialisé dans le module `db.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/syncHooks.test.ts`
Expected: PASS, les 4 tests.

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS, tous les tests (notamment ceux qui font des `toArray()`/`get()` sur les tables
existantes ne doivent pas être affectés puisqu'aucune ligne n'a `deletedAt` par défaut).

- [ ] **Step 6: Commit**

```bash
git add src/data/syncHooks.ts src/data/syncHooks.test.ts src/data/db.ts
git commit -m "feat(sync): hooks Dexie pour updatedAt automatique et tombstones"
```

## Task 4: Remplacer les 3 `.delete()` directs par `softDelete()`

**Files:**
- Modify: `src/components/ParcelCard.tsx:78`
- Modify: `src/pages/GardenMapPage.tsx:118`
- Modify: `src/services/seasonNotesService.ts:23`

- [ ] **Step 1: `ParcelCard.tsx`**

Ajouter l'import en haut du fichier (avec les autres imports de `../data/db`) :

```ts
import { softDelete } from '../data/syncHooks'
```

Remplacer (ligne 78) :

```ts
      await db.parcels.delete(parcel.id)
```

par :

```ts
      await softDelete('parcels', parcel.id)
```

- [ ] **Step 2: `GardenMapPage.tsx`**

Ajouter le même import `import { softDelete } from '../data/syncHooks'`.

Remplacer (ligne 118) :

```ts
      await db.parcels.delete(parcel.id)
```

par :

```ts
      await softDelete('parcels', parcel.id)
```

- [ ] **Step 3: `seasonNotesService.ts`**

Ajouter l'import : `import { softDelete } from '../data/syncHooks'`.

Remplacer (ligne 23) :

```ts
      await db.seasonNotes.delete(existing.id as string)
```

par :

```ts
      await softDelete('seasonNotes', existing.id as string)
```

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, en particulier les tests existants de `ParcelCard`, `GardenMapPage` et
`seasonNotesService` qui couvrent la suppression.

- [ ] **Step 5: Commit**

```bash
git add src/components/ParcelCard.tsx src/pages/GardenMapPage.tsx src/services/seasonNotesService.ts
git commit -m "refactor(sync): remplacer les suppressions directes par softDelete (tombstone)"
```

## Task 5: Logique de merge LWW (fonction pure testée isolément)

**Files:**
- Create: `src/services/syncMerge.ts`
- Test: `src/services/syncMerge.test.ts`

- [ ] **Step 1: Write the failing test**

Créer `src/services/syncMerge.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { resolveMerge } from './syncMerge'

describe('resolveMerge (dernier ecrit gagne)', () => {
  it('garde la version locale si elle est plus recente', () => {
    const local = { id: 'a', name: 'local', updatedAt: 200 }
    const remote = { id: 'a', name: 'remote', updatedAt: 100 }
    expect(resolveMerge(local, remote)).toBe(local)
  })

  it('garde la version distante si elle est plus recente', () => {
    const local = { id: 'a', name: 'local', updatedAt: 100 }
    const remote = { id: 'a', name: 'remote', updatedAt: 200 }
    expect(resolveMerge(local, remote)).toBe(remote)
  })

  it('en cas d\'egalite de timestamp, garde la version locale (no-op)', () => {
    const local = { id: 'a', name: 'local', updatedAt: 100 }
    const remote = { id: 'a', name: 'remote', updatedAt: 100 }
    expect(resolveMerge(local, remote)).toBe(local)
  })

  it('si local absent, le distant gagne', () => {
    const remote = { id: 'a', name: 'remote', updatedAt: 100 }
    expect(resolveMerge(undefined, remote)).toBe(remote)
  })

  it('si distant absent, le local gagne', () => {
    const local = { id: 'a', name: 'local', updatedAt: 100 }
    expect(resolveMerge(local, undefined)).toBe(local)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/syncMerge.test.ts`
Expected: FAIL — `./syncMerge` n'existe pas.

- [ ] **Step 3: Implement `syncMerge.ts`**

Créer `src/services/syncMerge.ts` :

```ts
interface Syncable {
  updatedAt?: number
}

export function resolveMerge<T extends Syncable>(
  local: T | undefined,
  remote: T | undefined,
): T | undefined {
  if (local === undefined) return remote
  if (remote === undefined) return local
  const localTime = local.updatedAt ?? 0
  const remoteTime = remote.updatedAt ?? 0
  return remoteTime > localTime ? remote : local
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/syncMerge.test.ts`
Expected: PASS, les 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/syncMerge.ts src/services/syncMerge.test.ts
git commit -m "feat(sync): fonction pure de resolution de conflit LWW"
```

## Task 6: Client Firestore (`firestoreClient.ts`)

**Files:**
- Create: `src/data/firestoreClient.ts`
- Modify: `src/data/firebase.ts`

- [ ] **Step 1: Activer Firestore dans `firebase.ts`**

Modifier `src/data/firebase.ts` pour exporter aussi l'instance Firestore avec persistance offline :

```ts
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const googleProvider = new GoogleAuthProvider()
export const firestore = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache(),
})
```

- [ ] **Step 2: Créer `firestoreClient.ts`**

Cette fine couche isole les imports `firebase/firestore` du reste de l'app (testabilité : un seul
fichier à mocker dans les tests de `syncService`).

```ts
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  getDocs,
  type Unsubscribe,
} from 'firebase/firestore'
import { firestore } from './firebase'
import type { TableName } from './syncHooks'

export function tableCollectionPath(uid: string, table: TableName): string {
  return `users/${uid}/${table}`
}

export async function pushRecord(
  uid: string,
  table: TableName,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  await setDoc(doc(firestore, tableCollectionPath(uid, table), id), data, { merge: true })
}

export async function fetchAllRecords(
  uid: string,
  table: TableName,
): Promise<Record<string, unknown>[]> {
  const snapshot = await getDocs(collection(firestore, tableCollectionPath(uid, table)))
  return snapshot.docs.map((d) => ({ ...d.data(), id: d.id }))
}

export function watchTable(
  uid: string,
  table: TableName,
  onChange: (records: Record<string, unknown>[]) => void,
): Unsubscribe {
  return onSnapshot(collection(firestore, tableCollectionPath(uid, table)), (snapshot) => {
    onChange(snapshot.docs.map((d) => ({ ...d.data(), id: d.id })))
  })
}
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/data/firebase.ts src/data/firestoreClient.ts
git commit -m "feat(sync): client Firestore (push, fetch, listener par table)"
```

## Task 7: `syncService.ts` — orchestration push/pull/sync initiale

**Files:**
- Create: `src/services/syncService.ts`
- Test: `src/services/syncService.test.ts`

- [ ] **Step 1: Write the failing test**

Créer `src/services/syncService.test.ts`. On mocke `firestoreClient` entièrement (pas de SDK
Firestore réel, conformément à la spec qui n'a pas d'émulateur configuré) :

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Dexie from 'dexie'
import { db, newId } from '../data/db'
import { runInitialSync, getSyncStatus } from './syncService'
import * as firestoreClient from '../data/firestoreClient'

const DB_NAME = 'mon-potager'

beforeEach(async () => {
  await db.open()
})

afterEach(async () => {
  db.close()
  await Dexie.delete(DB_NAME)
  vi.restoreAllMocks()
})

describe('runInitialSync', () => {
  it('pousse les lignes locales absentes de Firestore', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Locale uniquement' })

    vi.spyOn(firestoreClient, 'fetchAllRecords').mockResolvedValue([])
    const pushSpy = vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()

    await runInitialSync('uid-test')

    expect(pushSpy).toHaveBeenCalledWith('uid-test', 'parcels', id, expect.objectContaining({ name: 'Locale uniquement' }))
  })

  it('tire les lignes distantes plus recentes vers Dexie', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Ancienne', updatedAt: 100 })

    vi.spyOn(firestoreClient, 'fetchAllRecords').mockImplementation(async (_uid, table) =>
      table === 'parcels' ? [{ id, name: 'Nouvelle', updatedAt: 200 }] : [],
    )
    vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()

    await runInitialSync('uid-test')

    const row = await db.table('parcels').get(id)
    expect(row?.name).toBe('Nouvelle')
  })

  it('garde la version locale si elle est plus recente que le distant', async () => {
    const id = newId()
    await db.parcels.add({ id, name: 'Locale recente', updatedAt: 300 })

    vi.spyOn(firestoreClient, 'fetchAllRecords').mockImplementation(async (_uid, table) =>
      table === 'parcels' ? [{ id, name: 'Distante ancienne', updatedAt: 100 }] : [],
    )
    const pushSpy = vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()

    await runInitialSync('uid-test')

    const row = await db.table('parcels').get(id)
    expect(row?.name).toBe('Locale recente')
    expect(pushSpy).toHaveBeenCalledWith('uid-test', 'parcels', id, expect.objectContaining({ name: 'Locale recente' }))
  })
})

describe('getSyncStatus', () => {
  it('retourne "offline" par defaut avant toute sync', () => {
    expect(getSyncStatus()).toBe('offline')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/syncService.test.ts`
Expected: FAIL — `./syncService` n'existe pas.

- [ ] **Step 3: Implement `syncService.ts`**

```ts
import { db } from '../data/db'
import type { TableName } from '../data/syncHooks'
import { fetchAllRecords, pushRecord, watchTable } from '../data/firestoreClient'
import { resolveMerge } from './syncMerge'

const TABLE_NAMES: TableName[] = [
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
]

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error'

let status: SyncStatus = 'offline'

export function getSyncStatus(): SyncStatus {
  return status
}

async function syncTable(uid: string, table: TableName): Promise<void> {
  const remoteRows = await fetchAllRecords(uid, table)
  const remoteById = new Map(remoteRows.map((r) => [r.id as string, r]))
  const localRows = await db.table(table).toArray()
  const localById = new Map(localRows.map((r) => [r.id as string, r]))

  const allIds = new Set([...remoteById.keys(), ...localById.keys()])

  for (const id of allIds) {
    const local = localById.get(id) as Record<string, unknown> | undefined
    const remote = remoteById.get(id)
    const winner = resolveMerge(local, remote)
    if (winner === undefined) continue

    if (winner === remote && winner !== local) {
      await db.table(table).put(winner)
    }
    if (winner === local && winner !== remote) {
      await pushRecord(uid, table, id, winner as Record<string, unknown>)
    }
  }
}

export async function runInitialSync(uid: string): Promise<void> {
  status = 'syncing'
  try {
    for (const table of TABLE_NAMES) {
      await syncTable(uid, table)
    }
    status = 'synced'
  } catch (err) {
    status = 'error'
    throw err
  }
}

const unsubscribers: Array<() => void> = []

export function startRealtimeSync(uid: string): void {
  stopRealtimeSync()
  for (const table of TABLE_NAMES) {
    const unsubscribe = watchTable(uid, table, (records) => {
      void Promise.all(
        records.map(async (remote) => {
          const id = remote.id as string
          const local = (await db.table(table).get(id)) as Record<string, unknown> | undefined
          const winner = resolveMerge(local, remote)
          if (winner === remote && winner !== local) {
            await db.table(table).put(winner)
          }
        }),
      )
    })
    unsubscribers.push(unsubscribe)
  }
}

export function stopRealtimeSync(): void {
  while (unsubscribers.length > 0) {
    unsubscribers.pop()?.()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/syncService.test.ts`
Expected: PASS, les 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/syncService.ts src/services/syncService.test.ts
git commit -m "feat(sync): syncService - sync initiale et listeners temps reel"
```

## Task 8: Push automatique sur écriture locale (branchement des hooks au syncService)

**Files:**
- Modify: `src/data/syncHooks.ts`
- Modify: `src/data/syncHooks.test.ts`

Les hooks `creating`/`updating` stampent déjà `updatedAt`, mais ne poussent pas encore vers
Firestore. On ajoute le push après écriture, sans bloquer l'écriture locale (le hook Dexie doit rester
synchrone et rapide).

- [ ] **Step 1: Write the failing test**

Ajouter à `src/data/syncHooks.test.ts` :

```ts
import { setSyncUid } from './syncHooks'
import * as firestoreClient from './firestoreClient'

describe('push automatique apres ecriture', () => {
  it('pousse vers Firestore apres un add, si un uid est actif', async () => {
    const pushSpy = vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()
    setSyncUid('uid-test')

    const id = newId()
    await db.parcels.add({ id, name: 'A pousser' })
    await new Promise((r) => setTimeout(r, 0))

    expect(pushSpy).toHaveBeenCalledWith('uid-test', 'parcels', id, expect.objectContaining({ name: 'A pousser' }))
    setSyncUid(null)
  })

  it('ne pousse rien si aucun uid actif (utilisateur deconnecte)', async () => {
    const pushSpy = vi.spyOn(firestoreClient, 'pushRecord').mockResolvedValue()
    setSyncUid(null)

    const id = newId()
    await db.parcels.add({ id, name: 'Hors ligne sans compte' })
    await new Promise((r) => setTimeout(r, 0))

    expect(pushSpy).not.toHaveBeenCalled()
  })
})
```

Ajouter l'import `vi` depuis `vitest` en haut du fichier de test s'il n'y est pas déjà, et
`import { newId } from './db'` s'il n'y est pas déjà (il y est déjà d'après la Task 3).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/syncHooks.test.ts -t "push automatique"`
Expected: FAIL — `setSyncUid` n'existe pas.

- [ ] **Step 3: Implement le push dans `syncHooks.ts`**

Modifier `src/data/syncHooks.ts` pour ajouter l'état `uid` et le push après écriture (import différé
de `firestoreClient` pour éviter tout cycle avec `firebase.ts`) :

```ts
import { db } from './db'
import { pushRecord } from './firestoreClient'

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
] as const

export type TableName = (typeof TABLE_NAMES)[number]

let installed = false
let activeUid: string | null = null

export function setSyncUid(uid: string | null): void {
  activeUid = uid
}

export function installSyncHooks(): void {
  if (installed) return
  installed = true

  for (const name of TABLE_NAMES) {
    const table = db.table(name)

    table.hook('creating', (_primKey, obj) => {
      if (typeof (obj as Record<string, unknown>).updatedAt !== 'number') {
        ;(obj as Record<string, unknown>).updatedAt = Date.now()
      }
    })

    table.hook('updating', (modifications) => {
      const mods = modifications as Record<string, unknown>
      if (typeof mods.updatedAt !== 'number') {
        return { ...mods, updatedAt: Date.now() }
      }
      return modifications
    })

    table.hook('reading', (obj) => {
      const row = obj as Record<string, unknown>
      return typeof row.deletedAt === 'number' ? undefined : obj
    })

    table.hook('creating').subscribe(function (this: { onsuccess?: (id: unknown) => void }) {
      this.onsuccess = (id: unknown) => {
        if (activeUid === null) return
        void table.get(id).then((row) => {
          if (row) void pushRecord(activeUid as string, name, id as string, row as Record<string, unknown>)
        })
      }
    })

    table.hook('updating').subscribe(function (
      this: { onsuccess?: (id: unknown) => void },
      _modifications: unknown,
      primKey: unknown,
    ) {
      this.onsuccess = () => {
        if (activeUid === null) return
        void table.get(primKey).then((row) => {
          if (row) void pushRecord(activeUid as string, name, primKey as string, row as Record<string, unknown>)
        })
      }
    })
  }
}

export async function softDelete(table: TableName, id: string): Promise<void> {
  await db.table(table).update(id, { deletedAt: Date.now() })
}
```

Note technique : Dexie expose `this.onsuccess` dans les hooks `creating`/`updating` comme callback
appelé une fois la transaction validée avec succès — c'est le point correct pour déclencher un push
réseau (on ne veut pas pousser si la transaction Dexie échoue derrière).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/syncHooks.test.ts`
Expected: PASS, tous les tests du fichier (les 4 de la Task 3 + les 2 nouveaux).

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS, aucune régression.

- [ ] **Step 6: Commit**

```bash
git add src/data/syncHooks.ts src/data/syncHooks.test.ts
git commit -m "feat(sync): push automatique vers Firestore apres chaque ecriture locale"
```

## Task 9: Branchement dans `AuthGate` (démarrage/arrêt de la synchro)

**Files:**
- Modify: `src/components/AuthGate.tsx`
- Modify: `src/components/AuthGate.test.tsx`

- [ ] **Step 1: Lire le test existant pour suivre le style**

Lire `src/components/AuthGate.test.tsx` pour repérer comment `onAuthChange` est mocké actuellement
(probablement via `vi.mock('../services/authService')`), afin de réutiliser le même pattern de mock.

- [ ] **Step 2: Write the failing test**

Ajouter à `src/components/AuthGate.test.tsx` un test qui vérifie que `setSyncUid` et
`runInitialSync`/`startRealtimeSync` sont appelés à la connexion, et `setSyncUid(null)` /
`stopRealtimeSync` à la déconnexion. Exemple (à adapter aux mocks déjà en place dans le fichier) :

```ts
import { setSyncUid } from '../data/syncHooks'
import { runInitialSync, startRealtimeSync, stopRealtimeSync } from '../services/syncService'

vi.mock('../data/syncHooks', () => ({ setSyncUid: vi.fn() }))
vi.mock('../services/syncService', () => ({
  runInitialSync: vi.fn().mockResolvedValue(undefined),
  startRealtimeSync: vi.fn(),
  stopRealtimeSync: vi.fn(),
}))

it('demarre la synchro quand un utilisateur se connecte', async () => {
  // simuler onAuthChange qui renvoie un user avec uid 'abc'
  // ... render AuthGate ...
  expect(setSyncUid).toHaveBeenCalledWith('abc')
  expect(runInitialSync).toHaveBeenCalledWith('abc')
  expect(startRealtimeSync).toHaveBeenCalledWith('abc')
})

it('arrete la synchro quand l\'utilisateur se deconnecte', async () => {
  // ... simuler la transition user -> null ...
  expect(setSyncUid).toHaveBeenCalledWith(null)
  expect(stopRealtimeSync).toHaveBeenCalled()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/AuthGate.test.tsx`
Expected: FAIL — `AuthGate` n'appelle encore aucune de ces fonctions.

- [ ] **Step 4: Implement le branchement dans `AuthGate.tsx`**

```ts
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { onAuthChange } from '../services/authService'
import { setSyncUid } from '../data/syncHooks'
import { runInitialSync, startRealtimeSync, stopRealtimeSync } from '../services/syncService'
import { LoginPage } from '../pages/LoginPage'

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => onAuthChange(setUser), [])

  useEffect(() => {
    if (user == null) {
      setSyncUid(null)
      stopRealtimeSync()
      return
    }
    setSyncUid(user.uid)
    void runInitialSync(user.uid).then(() => startRealtimeSync(user.uid))
    return () => stopRealtimeSync()
  }, [user])

  if (user === undefined) {
    return <div className="flex min-h-screen items-center justify-center bg-green-50" />
  }

  if (user === null) {
    return <LoginPage />
  }

  return children
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/AuthGate.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS, aucune régression sur l'ensemble du projet.

- [ ] **Step 7: Commit**

```bash
git add src/components/AuthGate.tsx src/components/AuthGate.test.tsx
git commit -m "feat(sync): demarrer/arreter la synchro Firestore au login/logout"
```

## Task 10: Nettoyage des tombstones au démarrage

**Files:**
- Modify: `src/services/syncService.ts`
- Modify: `src/services/syncService.test.ts`

- [ ] **Step 1: Write the failing test**

Ajouter à `src/services/syncService.test.ts` :

```ts
describe('purgeOldTombstones', () => {
  it('supprime physiquement les lignes locales avec deletedAt vieux de plus de 30 jours', async () => {
    const id = newId()
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000
    await db.table('parcels').add({ id, name: 'Vieux tombstone', deletedAt: old, updatedAt: old })

    await purgeOldTombstones()

    const raw = await db.table('parcels').get(id)
    expect(raw).toBeUndefined()
  })

  it('garde les tombstones recents', async () => {
    const id = newId()
    const recent = Date.now() - 5 * 24 * 60 * 60 * 1000
    await db.table('parcels').add({ id, name: 'Tombstone recent', deletedAt: recent, updatedAt: recent })

    await purgeOldTombstones()

    const raw = await db.table('parcels').get(id)
    expect(raw).toBeDefined()
  })
})
```

Ajouter `purgeOldTombstones` à l'import en haut du fichier : modifier la ligne existante
`import { runInitialSync, getSyncStatus } from './syncService'` en
`import { runInitialSync, getSyncStatus, purgeOldTombstones } from './syncService'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/syncService.test.ts -t "purgeOldTombstones"`
Expected: FAIL — `purgeOldTombstones` n'est pas exporté.

- [ ] **Step 3: Implement `purgeOldTombstones`**

Le hook `reading` (Task 3) filtre toute ligne avec `deletedAt` défini, y compris pour `.toArray()` et
`.get()`. La purge a justement besoin de voir ces lignes : on ajoute un drapeau de "mode maintenance"
dans `syncHooks.ts` que le hook `reading` consulte, activé uniquement pendant la purge.

Dans `src/data/syncHooks.ts`, ajouter :

```ts
let maintenanceMode = false

export function withMaintenanceMode<T>(fn: () => Promise<T>): Promise<T> {
  maintenanceMode = true
  return fn().finally(() => {
    maintenanceMode = false
  })
}
```

Et modifier le hook `reading` existant pour vérifier ce drapeau :

```ts
table.hook('reading', (obj) => {
  if (maintenanceMode) return obj
  const row = obj as Record<string, unknown>
  return typeof row.deletedAt === 'number' ? undefined : obj
})
```

Puis dans `syncService.ts` :

```ts
import { withMaintenanceMode } from '../data/syncHooks'

export async function purgeOldTombstones(): Promise<void> {
  const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS
  await withMaintenanceMode(async () => {
    for (const table of TABLE_NAMES) {
      const rows = (await db.table(table).toArray()) as Record<string, unknown>[]
      for (const row of rows) {
        if (typeof row.deletedAt === 'number' && row.deletedAt < cutoff) {
          await db.table(table).delete(row.id as string)
        }
      }
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/syncService.test.ts src/data/syncHooks.test.ts`
Expected: PASS, tous les tests des deux fichiers.

- [ ] **Step 5: Brancher la purge au démarrage de l'app**

Dans `src/components/AuthGate.tsx`, dans le `useEffect` ajouté à la Task 9, appeler la purge avant la
sync initiale :

```ts
useEffect(() => {
  if (user == null) {
    setSyncUid(null)
    stopRealtimeSync()
    return
  }
  setSyncUid(user.uid)
  void purgeOldTombstones()
    .then(() => runInitialSync(user.uid))
    .then(() => startRealtimeSync(user.uid))
  return () => stopRealtimeSync()
}, [user])
```

Ajouter l'import `purgeOldTombstones` depuis `'../services/syncService'` dans `AuthGate.tsx`.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS, aucune régression.

- [ ] **Step 7: Commit**

```bash
git add src/data/syncHooks.ts src/services/syncService.ts src/services/syncService.test.ts src/components/AuthGate.tsx
git commit -m "feat(sync): purge des tombstones de plus de 30 jours au demarrage"
```

## Task 11: Indicateur de statut de synchro dans les Réglages

**Files:**
- Modify: `src/pages/SettingsPage.tsx`
- Test: `src/pages/SettingsPage.test.tsx`

- [ ] **Step 1: Lire le fichier existant**

Lire `src/pages/SettingsPage.tsx` et `src/pages/SettingsPage.test.tsx` en entier pour identifier
l'endroit où ajouter l'indicateur (probablement à côté du bouton de déconnexion déjà présent depuis
la Phase B) et le style de test déjà en place.

- [ ] **Step 2: Write the failing test**

Ajouter un test dans `src/pages/SettingsPage.test.tsx` qui mocke `getSyncStatus` depuis
`'../services/syncService'` pour retourner successivement `'synced'`, `'syncing'`, `'offline'`,
`'error'`, et vérifie qu'un texte correspondant apparaît (ex : "Synchronisé", "Synchronisation...",
"Hors ligne", "Erreur de synchronisation"). Adapter le pattern exact de mock au style déjà utilisé
dans ce fichier de test pour les autres dépendances de `SettingsPage`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/pages/SettingsPage.test.tsx`
Expected: FAIL — l'indicateur n'existe pas encore dans le JSX.

- [ ] **Step 4: Implement l'indicateur**

Ajouter dans `SettingsPage.tsx`, à l'endroit identifié à l'étape 1, un petit composant qui lit
`getSyncStatus()` (avec un `useEffect` + `setInterval` léger, ex. toutes les 2 secondes, pour
refléter les changements de statut sans dépendance externe à un store réactif) et affiche le texte
correspondant avec une couleur (vert = synced, jaune = syncing, gris = offline, rouge = error).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/pages/SettingsPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/SettingsPage.tsx src/pages/SettingsPage.test.tsx
git commit -m "feat(sync): indicateur de statut de synchro dans les reglages"
```

## Task 12: Vérification finale

- [ ] **Step 1: Build complet**

Run: `npm run build`
Expected: succès, aucune erreur TypeScript.

- [ ] **Step 2: Suite de tests complète**

Run: `npx vitest run`
Expected: PASS, tous les tests (les ~280 existants + les nouveaux de cette phase).

- [ ] **Step 3: Vérification manuelle dans le navigateur**

Lancer `npm run dev`, se connecter avec un compte Google, créer une parcelle, vérifier dans la
console réseau (ou les logs) qu'un document apparaît dans Firestore (console Firebase) sous
`users/{uid}/parcels/{id}`. Supprimer la parcelle, vérifier que le document Firestore reste présent
mais avec `deletedAt` défini, et que la parcelle disparaît bien de l'UI.

- [ ] **Step 4: Commit final si des ajustements ont été faits pendant la vérification manuelle**

```bash
git add -A
git commit -m "fix(sync): ajustements suite a la verification manuelle"
```
