# Plan d'implémentation : Migration cloud-first (option B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (exécution inline préférée sur ce projet, voir mémoire `feedback-execution-inline`). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Firestore devient la source de vérité unique (lectures via `onSnapshot`, écritures via `setDoc`), la couche de synchro maison (`syncService`/`syncHooks`/`syncMerge`/tombstones/curseurs) est démontée table par table, journal d'abord.

**Architecture :** chaque lot bascule un groupe de tables : lectures `useLiveQuery(db...)` remplacées par `useCollection`/`useDoc` (déjà écrits dans `src/data/firestoreHooks.ts`), écritures Dexie remplacées par un nouveau module `src/data/firestoreWrites.ts` (avec `updatedAt: serverTimestamp()`, convention figée dans `firebase.ts`). Une table basculée est retirée de la sync maison. Le hors-ligne est assuré nativement par `persistentLocalCache` (déjà actif). À la fin, Dexie ne garde que `auditLog` (local par design).

**Tech stack :** React 19, Vite, Firestore web SDK (cache persistant multi-onglets), Vitest + fake-indexeddb, oxlint.

**Contexte quota (impératif) :** plan Spark gratuit, 50 k lectures / 20 k écritures / jour, reset ~9h heure française. Le backlog de mutations qui brûlait le quota a été purgé le 05/07 au soir (suppression IndexedDB `firestore/[DEFAULT]/potager-764af/main`, hors-ligne). Chaque lot se termine par une vérification quota (compteurs console Firebase quasi plats à l'ouverture).

**Règles projet :** un lot = un commit minimum, validation de Mathieu entre les lots. `npm test` et `npm run lint` verts à chaque fin de tâche. Pas de tiret em dans le code ni les docs. Français.

**Décision de conception clé (hors-ligne) :** avec le cache persistant, la promesse de `setDoc` ne se résout qu'à l'ack serveur. Les fonctions de `firestoreWrites.ts` ne sont donc **jamais awaitées jusqu'au serveur** : elles appliquent localement (instantané) et renvoient tout de suite. L'UI se met à jour via `onSnapshot` (cache). Ne jamais faire dépendre une navigation ou un spinner de l'ack serveur.

---

## Lot 0 : protections immédiates (avant toute migration)

### Task 1 : ne plus empiler de mutations hors-ligne dans la sync maison

Tant que la couche maison vit, chaque `setDoc` émis hors-ligne (ou quota épuisé) s'empile dans la file persistante du SDK et rejoue plus tard. C'est le mécanisme qui a créé le backlog de 10 k écritures. On coupe l'empilement : hors-ligne, on ne pousse pas ; `runInitialSync` re-dérivera les écarts (curseurs `updatedAt`) au prochain démarrage en ligne. Aucune perte : Dexie reste la source de vérité de la couche maison.

**Files:**
- Modify: `src/data/firestoreClient.ts:19-26` (pushRecord) et `:30-55` (pushRecords)
- Test: `src/data/firestoreClient.test.ts` (nouveau)

- [ ] **Step 1 : écrire le test qui échoue**

```ts
// src/data/firestoreClient.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const setDocMock = vi.fn()
const batchSetMock = vi.fn()
const batchCommitMock = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({})),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(() => ({ set: batchSetMock, commit: batchCommitMock })),
}))
vi.mock('./firebase', () => ({ firestore: {} }))

import { pushRecord, pushRecords } from './firestoreClient'

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

describe('garde hors-ligne des pushes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setOnLine(true)
  })

  it('pushRecord ne fait rien hors-ligne (pas de mutation empilée)', async () => {
    setOnLine(false)
    await pushRecord('uid1', 'log', 'e1', { id: 'e1' })
    expect(setDocMock).not.toHaveBeenCalled()
  })

  it('pushRecord pousse normalement en ligne', async () => {
    await pushRecord('uid1', 'log', 'e1', { id: 'e1' })
    expect(setDocMock).toHaveBeenCalledTimes(1)
  })

  it('pushRecords ne fait rien hors-ligne', async () => {
    setOnLine(false)
    await pushRecords('uid1', 'log', [{ id: 'e1', data: { id: 'e1' } }])
    expect(batchCommitMock).not.toHaveBeenCalled()
    expect(setDocMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run src/data/firestoreClient.test.ts`
Attendu : FAIL sur les deux tests « hors-ligne » (les mocks sont appelés).

- [ ] **Step 3 : implémentation minimale**

Dans `src/data/firestoreClient.ts`, ajouter en tête de fichier (après les imports) :

```ts
// Hors-ligne, un setDoc s'empile dans la file persistante du SDK et rejoue au
// prochain demarrage (backlog du 04/07 : ~10 k mutations rejouees a l'ouverture,
// quota brule). On ne pousse qu'en ligne : runInitialSync re-derive les ecarts
// depuis les curseurs updatedAt au prochain lancement connecte, rien n'est perdu.
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
```

Puis première ligne de `pushRecord` : `if (isOffline()) return`
Et première ligne de `pushRecords` (avant le `if (items.length === 0)`) : `if (isOffline()) return`

- [ ] **Step 4 : vérifier le vert**

Run: `npx vitest run src/data/firestoreClient.test.ts` puis `npm test` et `npm run lint`
Attendu : PASS partout.

- [ ] **Step 5 : commit**

```bash
git add src/data/firestoreClient.ts src/data/firestoreClient.test.ts
git commit -m "fix(sync): ne plus empiler de mutations Firestore hors-ligne (cause du backlog quota)"
```

### Task 2 : désactiver le bouton « Fusionner les doublons » (temporaire)

`dedupeGardenData` fait un `db.log.update` par entrée de journal remappée : potentiellement des milliers de pushes en un clic. Il reviendra en version cloud batchée au Lot 3. En attendant, on retire le bouton pour éviter un accident de quota.

**Files:**
- Modify: `src/pages/GardenPage.tsx` (import ligne 9, handler ~ligne 88-91, bouton JSX associé)

- [ ] **Step 1 :** dans `GardenPage.tsx`, supprimer l'import `dedupeGardenData` (ligne 9), le handler qui l'appelle (bloc autour des lignes 88-91, avec le `window.confirm('Fusionner les parcelles...')`) et le bouton JSX qui déclenche ce handler. Laisser `src/services/dedupeService.ts` et son test intacts (le service sera réécrit au Lot 3).
- [ ] **Step 2 :** Run: `npm test` et `npm run lint`. Attendu : PASS (aucun test existant ne couvre le bouton ; si un test de `GardenPage.test.tsx` casse sur ce bouton, supprimer ce cas de test précis).
- [ ] **Step 3 : commit**

```bash
git add src/pages/GardenPage.tsx
git commit -m "chore(dedupe): retire le bouton fusion doublons (reviendra en version cloud batchee)"
```

---

## Lot 1 : socle d'écriture cloud + bascule du journal (`log`)

### Task 3 : module d'écriture `firestoreWrites.ts`

**Files:**
- Create: `src/data/firestoreWrites.ts`
- Test: `src/data/firestoreWrites.test.ts`

- [ ] **Step 1 : test qui échoue**

```ts
// src/data/firestoreWrites.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const setDocMock = vi.fn(() => Promise.resolve())
const deleteDocMock = vi.fn(() => Promise.resolve())
const SERVER_TS = { __serverTimestamp: true }

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, path: string, id: string) => ({ path: `${path}/${id}` })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  serverTimestamp: () => SERVER_TS,
}))
vi.mock('./firebase', () => ({
  firestore: {},
  auth: { currentUser: { uid: 'uid-test' } },
}))

import { cloudPut, cloudDelete } from './firestoreWrites'

describe('firestoreWrites', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cloudPut ecrit en merge avec updatedAt serverTimestamp sous users/<uid>/<table>', () => {
    cloudPut('log', 'e1', { type: 'note' })
    expect(setDocMock).toHaveBeenCalledWith(
      { path: 'users/uid-test/log/e1' },
      { type: 'note', updatedAt: SERVER_TS },
      { merge: true },
    )
  })

  it('cloudDelete supprime le document (vraie suppression, pas de tombstone)', () => {
    cloudDelete('log', 'e1')
    expect(deleteDocMock).toHaveBeenCalledWith({ path: 'users/uid-test/log/e1' })
  })

  it('cloudPut ne jette pas si deconnecte (no-op signale en console)', () => {
    // remplace l'uid par null pour ce cas
  })
})
```

- [ ] **Step 2 :** Run: `npx vitest run src/data/firestoreWrites.test.ts`. Attendu : FAIL (module inexistant).

- [ ] **Step 3 : implémentation**

```ts
// src/data/firestoreWrites.ts
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, firestore } from './firebase'
import type { TableName } from './syncHooks'

// Ecritures cloud-first. Convention de timestamps (voir firebase.ts) :
//   updatedAt -> serverTimestamp() (horloge serveur, base du last-write-wins natif)
//   createdAt/date -> Date.now() ou saisie utilisateur, poses par l'appelant.
//
// IMPORTANT : ne jamais await le setDoc jusqu'au serveur. Avec le cache persistant,
// la promesse ne se resout qu'a l'ack serveur : hors-ligne, elle pendrait pour
// toujours et gelerait l'UI. L'ecriture est appliquee au cache local immediatement
// et l'ecran se met a jour via onSnapshot. On log seulement l'erreur eventuelle.

function uidOrNull(): string | null {
  return auth.currentUser?.uid ?? null
}

function ref(uid: string, table: TableName, id: string) {
  return doc(firestore, `users/${uid}/${table}`, id)
}

/** Cree ou met a jour partiellement un document (merge). */
export function cloudPut(table: TableName, id: string, data: Record<string, unknown>): void {
  const uid = uidOrNull()
  if (uid === null) {
    console.error(`[cloud] ecriture ignoree (deconnecte) ${table}/${id}`)
    return
  }
  void setDoc(ref(uid, table, id), { ...data, updatedAt: serverTimestamp() }, { merge: true }).catch(
    (err: unknown) => console.error(`[cloud] echec setDoc ${table}/${id}`, err),
  )
}

/** Cree un document avec un id genere, le renvoie immediatement. */
export function cloudAdd(table: TableName, data: Record<string, unknown>): string {
  const id = crypto.randomUUID()
  cloudPut(table, id, { ...data, id })
  return id
}

/** Vraie suppression (plus de tombstone cote cloud-first). */
export function cloudDelete(table: TableName, id: string): void {
  const uid = uidOrNull()
  if (uid === null) {
    console.error(`[cloud] suppression ignoree (deconnecte) ${table}/${id}`)
    return
  }
  void deleteDoc(ref(uid, table, id)).catch((err: unknown) =>
    console.error(`[cloud] echec deleteDoc ${table}/${id}`, err),
  )
}
```

Compléter le 3e test (déconnecté) : re-mocker `./firebase` avec `auth: { currentUser: null }` dans un fichier de test séparé ou via `vi.spyOn` ; vérifier que `setDocMock` n'est pas appelé et que rien ne jette.

- [ ] **Step 4 :** Run: `npx vitest run src/data/firestoreWrites.test.ts` puis `npm test` + `npm run lint`. Attendu : PASS.
- [ ] **Step 5 : commit** `feat(cloud): module d'ecriture Firestore direct (serverTimestamp, non bloquant hors-ligne)`

### Task 4 : `logService` version cloud

**Files:**
- Modify: `src/services/logService.ts`
- Modify: `src/services/logService.test.ts` (réécrire les cas add/update ; garder/adapter les cas de tri)

- [ ] **Step 1 :** réécrire `logService.ts` :

```ts
import type { GardenLogEntry, LogEntryType } from '../data/model'
import { cloudPut } from '../data/firestoreWrites'

// Entrée à créer : tout sauf id et createdAt (générés ici).
export type NewLogEntry = Omit<GardenLogEntry, 'id' | 'createdAt'> & {
  createdAt?: number
}

export function addLogEntry(entry: NewLogEntry): string {
  const id = crypto.randomUUID()
  cloudPut('log', id, {
    ...entry,
    id,
    status: entry.status ?? 'valide',
    createdAt: entry.createdAt ?? Date.now(),
  })
  return id
}

// Mise a jour partielle (setDoc merge) : ne touche que les champs fournis.
export function updateLogEntry(id: string, entry: NewLogEntry): void {
  cloudPut('log', id, entry)
}

// Tri du journal, du plus récent au plus ancien (date puis createdAt).
// Pur : s'applique au tableau renvoye par useCollection('log').
export function sortLog(entries: GardenLogEntry[]): GardenLogEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return b.createdAt - a.createdAt
  })
}

export function filterLogByType(entries: GardenLogEntry[], type: LogEntryType): GardenLogEntry[] {
  return sortLog(entries).filter((e) => e.type === type)
}
```

`listLog`/`listLogByType` disparaissent ; les appelants passent à `useCollection('log')` + `sortLog` (Task 5). Les signatures restent compatibles avec les `await` existants (`await` sur une valeur simple est légal), ne pas modifier les appelants de `addLogEntry`/`updateLogEntry` (`QuickAddPage.tsx:202-204`, `VoiceReviewPage.tsx:69`).

- [ ] **Step 2 :** adapter `logService.test.ts` : mocker `../data/firestoreWrites` (`vi.mock` avec `cloudPut: vi.fn()`), tester que `addLogEntry` pose `status: 'valide'` et `createdAt` par défaut et renvoie l'id, que `updateLogEntry` transmet tel quel, et que `sortLog`/`filterLogByType` trient comme l'ancien `listLog` (reprendre les jeux de données du test existant).
- [ ] **Step 3 :** Run: `npm test` + `npm run lint`. Attendu : PASS (adapter aussi tout test de page qui importait `listLog`, voir Task 5).
- [ ] **Step 4 : commit** `feat(cloud): logService ecrit directement dans Firestore`

### Task 5 : bascule des lectures du journal + suppression cloud

Sites de lecture `log` à basculer (inventaire exact, tous remplacent `useLiveQuery(() => db.log.toArray(), [], [])` ou `listLog()`) :

| Fichier | Ligne actuelle |
|---|---|
| `src/pages/JournalPage.tsx` | 140 (`listLog()`) + suppression ligne 212 (`softDelete('log', ...)`) |
| `src/pages/DashboardPage.tsx` | 177 |
| `src/pages/HarvestPage.tsx` | 34 |
| `src/pages/WaterPage.tsx` | 47 |
| `src/pages/ArgentPage.tsx` | 55 |
| `src/pages/AssistantPage.tsx` | 33 |
| `src/pages/DiagnosticsPage.tsx` | 100 |
| `src/pages/SeasonSummaryPage.tsx` | 156 |
| `src/pages/GardenPage.tsx` | 78 |
| `src/components/TreeCard.tsx` | 22 |

(`src/services/exportService.ts:76,100` et `dedupeService.ts:64,138` restent sur Dexie jusqu'aux Lots 3-4.)

- [ ] **Step 1 : helper de test partagé**

```ts
// src/test/firestoreHooksMock.ts
// A utiliser via vi.mock('../data/firestoreHooks', ...) dans les tests de pages :
// les pages migrees lisent Firestore, pas Dexie. Les tests alimentent ce store.
import { vi } from 'vitest'

const store = new Map<string, Record<string, unknown>[]>()

export function setCollectionData(table: string, rows: Record<string, unknown>[]): void {
  store.set(table, rows)
}

export function clearCollectionData(): void {
  store.clear()
}

export const firestoreHooksMock = {
  useCollection: vi.fn((table: string) => ({
    data: store.get(table) ?? [],
    loading: false,
    error: null,
    fromCache: false,
  })),
  useDoc: vi.fn((table: string, id: string | null | undefined) => ({
    data: (store.get(table) ?? []).find((r) => r.id === id) ?? null,
    loading: false,
    error: null,
    fromCache: false,
  })),
}
```

- [ ] **Step 2 :** basculer chaque site du tableau. Pattern :

```tsx
// avant
import { useLiveQuery } from 'dexie-react-hooks'
const log = useLiveQuery(() => db.log.toArray(), [], [])

// après
import { useCollection } from '../data/firestoreHooks'
import type { GardenLogEntry } from '../data/model'
const { data: log } = useCollection<GardenLogEntry>('log')
```

Cas particuliers :
- `JournalPage.tsx:140` : `const { data: rawLog } = useCollection<GardenLogEntry>('log')` puis `const entries = useMemo(() => sortLog(rawLog), [rawLog])`.
- `JournalPage.tsx:212` : remplacer `await softDelete('log', entry.id as string)` par `cloudDelete('log', entry.id as string)` (import depuis `../data/firestoreWrites`). Retirer l'import `softDelete` de la ligne 6.
- Ne PAS toucher aux autres `useLiveQuery` de ces pages (parcels, crops... restent Dexie jusqu'aux lots suivants).

- [ ] **Step 3 :** adapter les tests de pages concernés (`JournalPage.test.tsx`, `DashboardPage` s'il existe, `HarvestPage.test.tsx`, `WaterPage.test.tsx`, `ArgentPage.test.tsx`, `DiagnosticsPage.test.tsx`, `SeasonSummaryPage.test.tsx`, `GardenPage.test.tsx`, `QuickAddPage.test.tsx`, `VoiceReviewPage.test.tsx`) : `vi.mock('../data/firestoreHooks', () => firestoreHooksMock)` + `setCollectionData('log', [...])` à la place des insertions Dexie `db.log`. Les données de test existantes sont réutilisées telles quelles.
- [ ] **Step 4 :** Run: `npm test` + `npm run lint`. Attendu : PASS.
- [ ] **Step 5 : commit** `feat(cloud): lectures et suppression du journal via Firestore (useCollection)`

### Task 6 : sortir `log` de la synchro maison

**Files:**
- Modify: `src/services/syncService.ts:13-26` (TABLE_NAMES : retirer `'log'`)
- Modify: `src/data/syncHooks.ts:4-18` (TABLE_NAMES : retirer `'log'` ; les hooks Dexie de `log` disparaissent, plus aucun push depuis Dexie log)
- Modify: `src/data/reconciliation.ts:16-30` (SYNCED_TABLES : retirer `'log'`, sinon la page dev repousserait la copie Dexie devenue morte)
- Modify: `src/services/syncService.test.ts` et `src/data/syncHooks.test.ts` si des cas ciblent `log` (les faire porter sur une autre table, ex. `parcels`)

- [ ] **Step 1 :** faire les trois retraits. La copie Dexie de `log` reste en place comme sauvegarde passive jusqu'au Lot 5 (personne ne la lit ni ne l'écrit, sauf `exportService`/`dedupeService` migrés aux Lots 3-4).
- [ ] **Step 2 :** Run: `npm test` + `npm run lint`. Attendu : PASS.
- [ ] **Step 3 : commit** `feat(cloud): la table log quitte la synchro maison (Firestore source de verite)`

### Vérification de fin de Lot 1 (app lancée, quota frais)

- [ ] Ouvrir l'app : le journal s'affiche (données venues de Firestore, qui contient déjà tout grâce à la réconciliation étape 2).
- [ ] Ajouter une entrée via QuickAdd : visible immédiatement dans le journal, ET sur le téléphone.
- [ ] Mode avion : ajouter une entrée, elle s'affiche ; retour en ligne : elle apparaît sur l'autre appareil.
- [ ] Console Firebase : écritures du jour proportionnelles aux actions (unités, pas de centaines), pas de montée verticale à l'ouverture.

---

## Lots 2 à 5 : même recette, groupe par groupe

Chaque lot suit exactement le déroulé du Lot 1 : (1) écritures du service/composant vers `cloudPut`/`cloudAdd`/`cloudDelete`, (2) lectures vers `useCollection`/`useDoc` + mock de test, (3) `softDelete(table, ...)` remplacé par `cloudDelete(table, ...)`, (4) retrait de la table de `syncService.TABLE_NAMES`, `syncHooks.TABLE_NAMES`, `reconciliation.SYNCED_TABLES`, (5) tests + lint verts, (6) un commit, (7) vérification quota + multi-appareils, (8) validation de Mathieu.

### Lot 2 : `settings` + référentiel simple (`tanks`, `catalog`, `varieties`, `trees`, `oyas`)

Inventaire des sites à basculer :
- `settings` : `settingsService.ts:21-27` (`getSettings` devient `useSettings()` basé sur `useDoc('settings', 'settings')` avec repli sur `DEFAULT_SETTINGS` ; `saveSettings` → `cloudPut('settings', 'settings', settings)`). Appelants de `getSettings` (tous en `useLiveQuery`) : `DashboardPage.tsx`, `JournalPage.tsx`, `WaterPage.tsx`, `AssistantPage.tsx`, `QuickAddPage.tsx`, `SeasonSummaryPage.tsx`, `SettingsPage.tsx`, `VoiceCapture.tsx`.
- `tanks` : lecture `WaterPage.tsx`, écriture `WaterPage.tsx:23`.
- `trees` : lectures `GardenPage.tsx`, `TreeCard.tsx` ; écritures `TreeCard.tsx:46-79` (5 updates + softDelete), `GardenPage.tsx:261`.
- `catalog`/`varieties` : lectures `GardenPage`, `QuickAddPage`, `AssistantPage`, `SeasonSummaryPage`, `CalendarPage` ; écriture `varietyService.ts:8`.
- `oyas` : lectures `JournalPage`, `DashboardPage`, `QuickAddPage`, `WaterPage` ; écritures : aucune trouvée hors seed.

### Lot 3 : `parcels` + `crops` + dédoublonnage cloud one-shot

- `parcels` : écritures `ParcelCard.tsx:33-92` (+ softDelete :79), `GardenPage.tsx:171`, `GardenMapPage.tsx:109-222` (+ softDelete :141) ; lectures partout (mêmes pages que le journal).
- `crops` : écritures `GardenPage.tsx:42,220` ; lectures multiples.
- Réécrire `dedupeService.ts` en version cloud : même logique `planMerge` (pure, tests conservés), mais les remaps et suppressions passent par `writeBatch` Firestore (lots de 500), et les entrées de journal sont lues via `getDocs` une fois. Ajouter un garde-fou : afficher le nombre d'écritures prévues et demander confirmation si > 500. Réintroduire le bouton dans `GardenPage`, l'utiliser UNE fois pour nettoyer les doublons réels (« Buttes courges ×3 », etc.), puis décider de garder ou retirer le bouton.

### Lot 4 : `expenses`, `soil`, `seasonNotes`, `diagnostics` + `exportService`

- `expenses` : `ExpenseForm.tsx:68`, `expenseService.ts`, `ArgentPage.tsx`.
- `seasonNotes` : `seasonNotesService.ts:28-36` (softDelete + add/update).
- `diagnostics` : `diagnosticService.ts:143,164`, `DiagnosticsPage.tsx`.
- `soil` : lectures seules trouvées ; vérifier au moment du lot.
- `exportService.ts` : export lit Firestore via `getDocs` (action manuelle, coût borné = taille de la base) ; import écrit via `writeBatch` par lots de 500. `db.log`/`bulkPut` disparaissent de ce service.

### Lot 5 : démontage de la couche maison

- `AuthGate.tsx` : supprimer `purgeOldTombstones`/`runInitialSync`/`startRealtimeSync`/`setSyncUid` ; ne garder que l'état d'auth.
- Supprimer : `src/services/syncService.ts`, `src/services/syncMerge.ts`, `src/data/syncHooks.ts` (déplacer le type `TableName` vers `src/data/model.ts`), `src/data/firestoreClient.ts`, `src/data/reconciliation.ts`, la page `/dev/reconciliation`, `src/data/seed.ts` (les données vivent dans Firestore ; `DEFAULT_SETTINGS` migre vers `settingsService`), et leurs tests.
- `db.ts` : Dexie réduit à `auditLog` (+ garder les définitions de version pour ne pas casser les bases existantes, ou `db.delete()` des tables mortes ; trancher au moment du lot).
- Script one-shot (page dev) : purger les tombstones restants côté serveur (`deletedAt != null`) via `writeBatch`, coût borné et affiché avant exécution.
- Retirer `sync:lastAt:*` de localStorage au premier lancement post-démontage.
- Mettre à jour `CLAUDE.md` (architecture : Firestore source de vérité, Dexie = auditLog seulement) et `docs/audit/`.
- SettingsPage : retirer le bouton « Resynchroniser tout » et `resetSyncCursors`.

---

## Critères d'acceptation globaux (fin de migration)

- Tout marche hors-ligne (mode avion : lecture + écriture + retour en ligne = convergence), via le cache natif uniquement.
- Écritures Firestore quotidiennes proportionnelles aux actions utilisateur (dizaines, pas milliers).
- Plus aucun code de synchro maison, plus de tombstones custom, plus de curseurs.
- `npm test` et `npm run lint` verts ; couverture conservée (les tests Dexie remplacés par des tests sur mocks Firestore, pas supprimés).
- Doublons parcelles/cultures nettoyés (dedupe cloud one-shot exécuté).
