# Spec de conception : Palier 4D-1 — Arrosage chiffré (durée + cumul litres)

Date : 2026-06-26
Auteur : Mathieu Giroux (conception assistée)
Statut : validé, prêt pour plan d'implémentation
Périmètre : premier sous-palier de 4D (arrosage chiffré), lui-même un sous-ensemble du palier
"Eau" de la spec globale [2026-06-24-mon-potager-design.md](2026-06-24-mon-potager-design.md).
Couvre uniquement la durée informative et le cumul de litres par parcelle. Ne couvre pas :
le niveau des cuves/autonomie (4D-2 initialement prévu, renommé en 4D-3 ci-dessous), la
comparaison arrosage/météo (4D-4), et surtout pas la carte photo cliquable du jardin (4D-2,
spec séparée, dépend de cette spec).

## 1. Objectif

Savoir, par parcelle : combien de litres versés sur les 7/14/30 derniers jours et sur l'année en
cours. Pouvoir noter en plus la durée d'un arrosage (information de confort, sans calcul
automatique associé).

## 2. Contexte et décisions issues du brainstorming

- L'arrosage peut se faire au goutte-à-goutte (goutteurs ~2 L/h), à l'oya (déjà un type d'entrée
  séparé `remplissage_oya`), ou à l'arrosoir. Quelle que soit la méthode, **les litres sont
  toujours saisis directement par Mathieu** : pas de calcul automatique à partir d'un nombre de
  goutteurs ou d'un débit. La durée est une note informative, jamais une variable de calcul.
- Le cumul porte sur la **parcelle**, pas sur la culture : aujourd'hui une entrée `arrosage` ne
  lie qu'une parcelle (`parcelId`), jamais une culture (`cropId`). Ça reste ainsi pour ce palier.
  Le cumul par culture est explicitement hors périmètre (voir §6).

## 3. Modèle de données (changement)

Ajouter un champ optionnel à `GardenLogEntry` ([model.ts:40](../../src/data/model.ts)) :

```ts
export interface GardenLogEntry {
  // ... champs existants inchangés
  durationMinutes?: number // durée d'arrosage en minutes, informatif, jamais utilisé pour un calcul
}
```

- Champ optionnel, aucune migration Dexie nécessaire (pas d'index dessus).
- S'applique uniquement aux entrées `type === 'arrosage'` (mais le champ reste générique sur
  `GardenLogEntry`, comme `volumeLiters`, pour rester cohérent avec le reste du modèle).

## 4. Saisie de la durée (UI)

Dans `QuickAddPage.tsx`, la config `{ type: 'arrosage', target: 'parcelle', measure: 'volume',
withTime: true }` ([QuickAddPage.tsx:27](../../src/pages/QuickAddPage.tsx)) gagne un champ
optionnel "Durée (minutes)" à côté du champ litres existant :
- Input numérique, vide par défaut, pas de validation de plage.
- Écrit `entry.durationMinutes = Number(duration)` si renseigné, comme le fait déjà le code pour
  `volumeLiters` ([QuickAddPage.tsx:144](../../src/pages/QuickAddPage.tsx)).
- Aucun calcul croisé avec les litres : les deux champs sont indépendants, l'un ou l'autre ou les
  deux peuvent être renseignés.
- La dictée vocale n'a pas besoin d'être modifiée pour ce palier : si Gemini renvoie une durée
  dans un brouillon vocal, elle sera prise en compte au même titre que les litres dès que le
  formulaire l'affiche ; sinon le champ reste vide et se complète à la main. Pas de changement de
  prompt Gemini nécessaire dans cette spec.

## 5. Calcul (dérivé, jamais stocké)

Nouveau service pur `src/services/waterUsageService.ts` (même esprit que
`weatherSummary.ts` : aucune dépendance React, testable) :

```ts
export interface WaterUsageRow {
  parcelId: number
  parcelName: string
  liters7: number
  liters14: number
  liters30: number
  litersYear: number // somme sur l'année de refDate
}

function summarizeWaterUsage(
  entries: GardenLogEntry[],
  parcels: Parcel[],
  refDate: string,
): WaterUsageRow[]
```

- Filtre les entrées `type === 'arrosage'` avec `volumeLiters` et `parcelId` définis. Les entrées
  sans `volumeLiters` (durée seule renseignée) ne contribuent à aucun cumul : elles ne sont
  comptées dans aucune des sommes, mais ne provoquent pas d'erreur (simplement ignorées par le
  filtre).
- Pour les fenêtres glissantes (7/14/30 jours) : une entrée compte si `entry.date` est compris
  entre `refDate` moins N jours (inclus) et `refDate` (inclus).
- Pour `litersYear` : une entrée compte si son année (4 premiers caractères de `entry.date`) est
  égale à l'année de `refDate`.
- Une parcelle qui n'a **aucune** entrée `arrosage` avec `volumeLiters` défini n'apparaît pas dans
  le résultat (pas de ligne à zéro partout).
- Tri alphabétique par `parcelName` (cohérent avec `harvestService`).
- `durationMinutes` n'entre dans aucun calcul de ce service : il n'est pas agrégé, pas affiché
  dans `WaterUsageRow`. Il reste visible uniquement dans le détail d'une entrée (page Journal),
  comme une note de confort.

## 6. Page `/eau`

`WaterPage.tsx` cesse d'être un `PlaceholderPage` et affiche le bilan :
- Titre "Réserve d'eau" conservé en en-tête (le futur 4D-3 y ajoutera les cuves).
- Une carte par parcelle ayant au moins une entrée d'arrosage chiffrée, listant : "7j : X L · 14j :
  X L · 30j : X L · Année : X L".
- Si aucune parcelle n'a de litres enregistrés : message vide explicite ("Pas encore d'arrosage
  enregistré").
- Pas de graphique pour ce palier (contrairement au bilan récoltes du palier 4C) : uniquement des
  chiffres, cohérent avec la décision prise en brainstorming (YAGNI, le graphique du 4C est un cas
  à part propre aux comparaisons inter-années).

## 7. Hors périmètre (explicitement exclu de cette spec)

- Calcul automatique des litres à partir d'une durée et d'un débit/nombre de goutteurs (écarté en
  brainstorming : Mathieu saisit toujours les litres directement, quelle que soit la méthode
  d'arrosage : goutte-à-goutte, oya, arrosoir).
- Cumul par culture (`cropId`) : l'entrée `arrosage` ne lie qu'une parcelle, pas de changement de
  saisie pour ajouter un sélecteur culture dans ce palier.
- Carte photo cliquable du jardin : c'est le palier suivant, 4D-2, spec séparée qui s'appuiera sur
  `summarizeWaterUsage` et sur le `parcelId` déjà existant pour afficher les chiffres au clic sur
  une zone de la photo.
- Niveau des cuves et projection d'autonomie en jours (4D-3, plus tard).
- Comparaison litres versés / pluie reçue / météo (4D-4, plus tard).
- Aucun changement au prompt ou au parsing de la dictée vocale (Gemini) dans cette spec.

## 8. Tests

- `waterUsageService.test.ts` : cumul sur les 3 fenêtres glissantes (7/14/30j), cumul annuel,
  plusieurs parcelles, parcelle sans aucune entrée absente du résultat, entrées sans
  `volumeLiters` ignorées, entrées sans `parcelId` ignorées, tri alphabétique.
- `WaterPage.test.tsx` : rendu vide ("Pas encore d'arrosage enregistré"), rendu avec données pour
  une ou plusieurs parcelles.
- `QuickAddPage.test.tsx` (existant) : étendre pour couvrir la saisie du champ durée optionnel sur
  une entrée `arrosage` et vérifier que `durationMinutes` est bien écrit sur l'entrée sauvegardée,
  indépendamment du champ litres.
