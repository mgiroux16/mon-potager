# Étape 0 : vérification des règles Firestore

Objectif : prouver que `users/{uid}/**` est lisible et écrivable **uniquement** par son
propriétaire, et qu'un autre uid (ou un appel non authentifié) est refusé.

Les règles sont dans [`firestore.rules`](../../firestore.rules). En `rules_version '2'`,
tout chemin non explicitement autorisé est refusé par défaut, donc le refus d'un autre
uid est structurel, pas conditionnel.

## Vérification automatisée (émulateur Firestore)

Nécessite Java (pour l'émulateur) et la CLI Firebase. Rien de tout ça n'est ajouté aux
dépendances du projet : c'est un outil de vérification ponctuel, hors `npm test`.

```bash
# 1. Outils (une fois)
npm i -g firebase-tools
npm i -D @firebase/rules-unit-testing

# 2. Lancer le test de règles dans l'émulateur
firebase emulators:exec --only firestore "node scripts/verif-regles.mjs"
```

`scripts/verif-regles.mjs` (à créer au moment de la vérification, hors périmètre du
commit Étape 0 qui ne touche que `firebase.ts` + règles) :

```js
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const testEnv = await initializeTestEnvironment({
  projectId: 'potager-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8') },
})

const alice = testEnv.authenticatedContext('alice').firestore()
const bob = testEnv.authenticatedContext('bob').firestore()
const anon = testEnv.unauthenticatedContext().firestore()

// Le propriétaire lit et écrit son sous-arbre : OK
await assertSucceeds(setDoc(doc(alice, 'users/alice/log/e1'), { type: 'note' }))
await assertSucceeds(getDoc(doc(alice, 'users/alice/log/e1')))

// Un autre uid est refusé en lecture ET en écriture
await assertFails(getDoc(doc(bob, 'users/alice/log/e1')))
await assertFails(setDoc(doc(bob, 'users/alice/log/e2'), { type: 'note' }))

// Non authentifié : refusé
await assertFails(getDoc(doc(anon, 'users/alice/log/e1')))

await testEnv.cleanup()
console.log('OK : autre uid et anonyme refusés, propriétaire autorisé.')
```

## Vérification manuelle rapide (sans émulateur)

Dans la console Firebase → Firestore → Règles → *Rules Playground* :

- Emplacement `/users/alice/log/e1`, opération `get`, authentifié `uid = alice` → **Allow**.
- Même emplacement, authentifié `uid = bob` → **Deny**.
- Même emplacement, non authentifié → **Deny**.
- Opération `create` sur `/users/alice/log/e2`, `uid = bob` → **Deny**.
