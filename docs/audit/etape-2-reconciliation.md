# Étape 2 : réconciliation locale vers Firestore

Objectif : garantir que 100 % des données locales (Dexie) sont présentes dans Firestore
avant de faire confiance au cloud comme source de vérité. Prérequis à l'étape 3 (bascule
des lectures du journal).

## Pourquoi

La synchro maison pousse en fire-and-forget (`void pushRecord(...)`, voir
[syncHooks.ts](../../src/data/syncHooks.ts)) : une écriture hors ligne ou pendant que
l'app est en arrière-plan peut ne jamais atteindre Firestore, sans erreur visible. Chaque
appareil peut donc avoir des entrées locales orphelines, jamais montées côté serveur, et
ces orphelines sont potentiellement différentes d'un appareil à l'autre.

## Ce que fait l'outil

[`src/data/reconciliation.ts`](../../src/data/reconciliation.ts), pour chaque table
synchronisée :

1. Lit les lignes locales (Dexie, tombstones inclus via `withMaintenanceMode`) et les
   documents serveur (Firestore).
2. Compare les **ensembles d'ID** (pas seulement les comptes : deux comptes égaux peuvent
   cacher des documents différents).
3. Pousse vers Firestore les lignes locales absentes du serveur, telles quelles (un
   tombstone local reste un tombstone poussé, jamais ressuscité).
4. Reproduit le rapport après push : compte local actif, compte serveur (actif/total),
   ID encore en écart dans un sens ou l'autre.

Aucune lecture d'écran n'est basculée : le reste de l'application continue de lire Dexie
normalement.

## Comment le lancer

L'outil vit dans une page dev, **non liée à la navigation**, sans déclenchement
automatique. Se connecter dans l'app puis naviguer manuellement vers :

```
#/dev/reconciliation
```

Cliquer sur « Lancer la réconciliation ». Le rapport par table s'affiche, les tables avec
un écart restant (avant ou après push) sont surlignées.

## Important : à lancer sur CHAQUE appareil

Chaque appareil (téléphone, ordinateur) peut avoir des entrées orphelines différentes,
créées localement et jamais montées. Lancer l'outil sur un seul appareil ne garantit rien
pour les autres. Ordre recommandé :

1. Téléphone (ou l'appareil suspecté d'avoir l'entrée manquante du diagnostic initial).
2. Ordinateur.
3. Tout autre appareil détenant des données.

Un `serverOnlyIds` non vide après passage sur tous les appareils est normal (documents
créés directement côté serveur, ou par un autre appareil pas encore réconcilié). Un
`localOnlyIds` non vide **après** le passage sur l'appareil concerné indique un échec de
push à investiguer (le rapport final est recalculé après le push, donc un écart restant
est un signal réel, pas un état transitoire).
