# Spec : synchro Dexie ↔ Firestore (Phase C)

Date : 2026-06-27
Phase : C (synchro multi-appareils), après Phase B (auth Google/Firebase). Reste ensuite la Phase D
(sécurité + bascule finale).

## Contexte

L'app tourne en local sur Dexie (IndexedDB), un appareil = une base isolée. La Phase B a branché
l'authentification Google via Firebase Auth, mais aucune donnée ne circule encore entre appareils.
Mathieu utilise l'app sur plusieurs appareils, parfois en même temps (ex: note une récolte sur le
téléphone pendant que l'app est ouverte sur l'ordinateur) : il faut que les deux convergent.

Les ids sont déjà des UUID string (migration v4-v7 de `db.ts`), précisément pour préparer cette
synchro : pas de collision possible entre appareils.

## Objectif

Toute écriture faite sur un appareil (connecté) doit apparaître sur les autres appareils du même
compte, en quasi temps réel, sans action manuelle de Mathieu. L'app doit rester pleinement utilisable
hors ligne (le jardin n'a pas toujours de réseau) : les écritures locales ne sont jamais bloquées par
l'état de la connexion.

## Hors scope

- Partage entre plusieurs utilisateurs (chaque compte Google a son propre espace de données isolé).
- Résolution de conflit champ par champ (on assume dernier-écrit-gagne, cf. décision ci-dessous).
- Historique des versions / undo au-delà de ce qu'offre déjà le journal d'événements.

## Décisions validées avec Mathieu

- **Conflits** : dernier écrit gagne (LWW), comparaison sur `updatedAt`. Pas de fusion champ par champ.
- **Déclencheur de synchro** : temps réel. Push immédiat à chaque écriture locale (si en ligne), pull
  continu via listeners Firestore, plus une synchro complète à l'ouverture de l'app.
- **Suppressions** : tombstone (`deletedAt`), pas de suppression physique immédiate. Nettoyage différé.

## Architecture

### Structure Firestore

```
users/{uid}/log/{id}
users/{uid}/parcels/{id}
users/{uid}/crops/{id}
users/{uid}/oyas/{id}
users/{uid}/trees/{id}
users/{uid}/tanks/{id}
users/{uid}/catalog/{id}
users/{uid}/expenses/{id}
users/{uid}/soil/{id}
users/{uid}/settings/{id}
users/{uid}/varieties/{id}
users/{uid}/seasonNotes/{id}
```

Miroir direct des 12 tables Dexie, scopé par `uid` (le champ `users/{uid}` isole déjà chaque compte
Google : pas de règle de sécurité supplémentaire à inventer pour le cloisonnement des données, juste à
vérifier en Phase D que les règles Firestore imposent `request.auth.uid == uid`).

### Modèle de données : champs ajoutés

Tous les types de `model.ts` qui ont un `id?: string` gagnent deux champs optionnels :

```ts
updatedAt?: number // epoch ms, mis à jour à chaque écriture (auto, via hook Dexie)
deletedAt?: number // epoch ms, présent = supprimé logiquement (tombstone)
```

`GardenLogEntry` garde aussi son `createdAt` existant (tri stable), qui ne change jamais après
création. `updatedAt` lui est nouveau et change à chaque modification, y compris la création initiale
(où `updatedAt === createdAt`).

### Migration Dexie v8

`db.ts` passe de version 7 à version 8 : ajout de l'index `updatedAt` sur les 12 tables (nécessaire
pour requêter "qu'est-ce qui a changé depuis ma dernière sync"). Pas de réécriture de données
existantes : un `upgrade()` qui boucle sur chaque table et set `updatedAt = row.createdAt ??
Date.now()` pour les lignes qui n'en ont pas (rétro-compatibilité avec les données déjà en place).

### Hooks Dexie centralisés (`src/data/syncHooks.ts`, nouveau fichier)

Plutôt que de modifier les 8 fichiers qui écrivent directement sur `db.table`, on utilise les hooks
natifs de Dexie (`creating`, `updating`) enregistrés une fois sur chaque table au démarrage :

- `creating` : injecte `updatedAt = Date.now()` si absent.
- `updating` : injecte `updatedAt = Date.now()` dans les `modifications` à chaque `.update()` ou
  `.put()`.

Ces deux hooks couvrent tous les call sites existants sans y toucher.

### Suppression douce (`softDelete`, nouvelle fonction exportée depuis `syncHooks.ts`)

```ts
export async function softDelete(tableName: TableName, id: string): Promise<void>
```

Fait un `update(id, { deletedAt: Date.now() })` au lieu d'un `.delete()`. Les 3 call sites identifiés
(`ParcelCard.tsx`, `GardenMapPage.tsx`, `seasonNotesService.ts`) sont mis à jour pour appeler
`softDelete('parcels', id)` / `softDelete('seasonNotes', id)` à la place de `db.<table>.delete(id)`.

Toutes les requêtes de lecture existantes (`toArray()`, `where(...)`, etc.) doivent désormais filtrer
les lignes avec `deletedAt` défini. Plutôt que d'auditer chaque lecture dans l'app, on ajoute un hook
Dexie `reading` (disponible depuis Dexie 3) qui retire silencieusement les objets avec `deletedAt` du
résultat — un seul point de filtrage, aucune lecture existante à modifier.

### Moteur de synchro (`src/services/syncService.ts`, nouveau fichier)

**Démarrage** (appelé une fois après login réussi, depuis `AuthGate`) :

1. Pour chaque table, pull initial : lire `users/{uid}/{table}`, comparer avec Dexie local ligne par
   ligne sur `updatedAt`, garder le plus récent (LWW), écrire le résultat fusionné dans Dexie.
2. Pour chaque ligne locale absente côté Firestore (cas : données créées hors-ligne avant le tout
   premier login), push vers Firestore.
3. Une fois la sync initiale terminée, ouverture des listeners temps réel (étape suivante).

**Pull continu** : un `onSnapshot` par table, scopé à `users/{uid}/{table}`, avec
`includeMetadataChanges: false`. À chaque changement distant reçu : comparaison `updatedAt` avec la
ligne Dexie locale, écriture si le distant est plus récent (ou absent localement). Les changements
qui viennent de notre propre push (écho Firestore) sont sans risque : même `updatedAt`, donc no-op.

**Push** : déclenché par les hooks Dexie (`creating`/`updating`, y compris les soft-deletes qui passent
par `updating`). Si l'app est en ligne, `setDoc(doc(users/{uid}/{table}/{id}), data, { merge: true })`
immédiatement. Si hors ligne, la persistance offline native du SDK Firestore (`enableIndexedDbPersistence`
ou équivalent moderne `persistentLocalCache`) absorbe l'écriture et la rejoue automatiquement au retour
réseau : pas de file d'attente maison à construire.

**Nettoyage des tombstones** : au démarrage de l'app (avant ou après la sync initiale, peu importe
l'ordre), purge des lignes avec `deletedAt` > 30 jours, en local (Dexie) et à distance (Firestore),
dans les deux sens à la fois pour éviter qu'une ligne nettoyée d'un côté ressuscite depuis l'autre.

### Statut de connexion

Le service expose un état simple (`'synced' | 'syncing' | 'offline' | 'error'`) consommé par un
indicateur discret dans l'UI (Réglages, ou un point de couleur dans l'en-tête). Pas de blocage de
l'interface dans aucun état : l'app reste utilisable hors ligne dans tous les cas, c'est juste un
indicateur informatif.

## Hors-ligne et reconnexion

Aucune action différente requise de l'app : Dexie écrit toujours localement en premier
(immédiatement, jamais d'attente réseau), et le SDK Firestore gère lui-même la mise en file et le
rejouement des écritures en attente dès que la connexion revient. Le pull continu (listeners) se
reconnecte aussi automatiquement (comportement natif du SDK).

## Erreurs

- Échec de push (ex: réseau qui tombe en plein milieu) : le SDK Firestore retente automatiquement,
  rien à coder côté app.
- Conflit de permission Firestore (règles de sécurité, Phase D) : log console + statut `'error'`
  affiché, pas de blocage de l'écriture locale.
- Documents orphelins (référence à un `parcelId` qui n'existe plus après sync) : déjà le comportement
  actuel de l'app avec des FK optionnelles, pas un problème introduit par cette phase.

## Tests

- Migration Dexie v8 : vérifie que les lignes existantes reçoivent un `updatedAt` après upgrade.
- Hooks `creating`/`updating` : vérifie que `updatedAt` est bien injecté sur add/update/put.
- Hook `reading` : vérifie qu'une ligne avec `deletedAt` n'apparaît plus dans un `toArray()`.
- `softDelete()` : vérifie qu'elle set `deletedAt` sans supprimer physiquement la ligne.
- Logique de merge LWW (fonction pure, extraite et testée isolément) : local plus récent gagne, distant
  plus récent gagne, égalité de timestamp = no-op, absence d'un côté = l'autre gagne.
- Pas de test d'intégration réel contre Firestore (pas d'émulateur configuré dans le projet) : le SDK
  Firestore est mocké dans les tests de `syncService.ts`, seule la logique de merge/décision est
  testée en profondeur.

## Dépendances à ajouter

`firebase/firestore` (déjà inclus dans le package `firebase` déjà présent pour l'auth, pas de nouvelle
dépendance npm).
