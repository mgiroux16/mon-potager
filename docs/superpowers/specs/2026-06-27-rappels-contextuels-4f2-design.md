# Design : 4f-2 - Rappels contextuels (inactivité parcelle + récolte possible)

## Contexte

Le palier 4f (`docs/superpowers/specs/2026-06-25-palier-4-carnet-culture-design.md`) regroupe
calendrier, rappels contextuels, alerte rotation et aide associations. 4f-1 (calendrier mensuel du
catalogue) est fait. Ce sous-palier 4f-2 couvre deux des trois mécanismes de rappel évoqués dans la
roadmap initiale :

- inactivité parcelle (« rien noté sur cette parcelle depuis 3 semaines »)
- récolte possible (« radis semés il y a 28 j, récolte possible »)

Le troisième mécanisme (« mildiou fin juillet l'an dernier », rappel basé sur l'historique de
problèmes l'année précédente) est hors périmètre de 4f-2, reporté à un palier ultérieur.

## Décisions

- **Seuil d'inactivité** : 21 jours (3 semaines), valeur fixe, pas de réglage dans `AppSettings`.
- **Référence pour le calcul des jours avant récolte** : depuis le semis si le légume a
  `sowingMonths` dans le catalogue (donc en pratique une entrée `semis` loguée pour la culture),
  sinon depuis la plantation (entrée `plantation`).
- **Nouvelle donnée catalogue** : `daysToHarvest?: number` ajouté à `CatalogItem`. Champ optionnel,
  pas de migration Dexie nécessaire (Dexie ne valide pas les propriétés non indexées). Valeurs
  pré-remplies pour les 10 légumes du seed, validées par Mathieu :

  | Légume | daysToHarvest | Référence |
  |---|---|---|
  | Tomate | 70 | plantation |
  | Pomme de terre | 100 | plantation |
  | Courgette | 50 | plantation |
  | Courge | 100 | plantation |
  | Patisson | 70 | plantation |
  | Haricot à rames | 70 | semis |
  | Oignon | 120 | plantation |
  | Ail | 240 | plantation |
  | Échalote | 130 | plantation |
  | Patate douce | 120 | plantation |

- **Emplacement** : nouvelle section "Rappels" en haut de `GardenPage.tsx` (au-dessus de
  "Parcelles"), pas sur le Dashboard qui reste un placeholder vide réservé aux paliers 5/7.
- **État vide** : si aucun rappel actif, la section ne s'affiche pas du tout (pas de message
  "tout va bien", pour rester discret).
- **Un rappel récolte par culture, pas par catalogue** : si plusieurs `Crop` partagent le même
  `catalogId` (ex. deux plantations de tomates à des dates différentes), chacune est évaluée
  indépendamment avec sa propre date de semis/plantation.
- **Pas de répétition pour une culture déjà récoltée** : si une entrée `recolte` existe déjà pour
  le `cropId`, le rappel "récolte possible" ne s'affiche plus pour cette culture (on suppose que
  Mathieu a déjà commencé à récolter et n'a plus besoin du rappel).

## Architecture

### `src/data/model.ts`

Ajout d'un champ optionnel à `CatalogItem` :

```ts
export interface CatalogItem {
  id?: number
  vegetable: string
  family: VegetableFamily
  sowingMonths?: number[]
  plantingMonths?: number[]
  harvestMonths?: number[]
  daysToHarvest?: number // jours depuis semis (si sowingMonths) ou plantation, jusqu'a recolte possible
  companions?: string[]
  antagonists?: string[]
  notes?: string
}
```

### `src/data/seed.ts`

Mise à jour de `seedCatalog` avec les 10 valeurs `daysToHarvest` du tableau ci-dessus.

### `src/services/reminderService.ts`

Deux fonctions pures, sans accès Dexie direct (la page charge les données et les passe en
argument, comme `calendarService.getMonthPlan`) :

```ts
export interface InactiveParcelReminder {
  parcel: Parcel
  daysSinceLastEntry: number | null // null si aucune entree jamais loguee pour cette parcelle
}

export function getInactiveParcels(
  parcels: Parcel[],
  log: GardenLogEntry[],
  today: ISODate,
  thresholdDays = 21,
): InactiveParcelReminder[]

export interface HarvestReminder {
  crop: Crop
  vegetable: string
  daysSinceReference: number
}

export function getHarvestReminders(
  crops: Crop[],
  catalog: CatalogItem[],
  log: GardenLogEntry[],
  today: ISODate,
): HarvestReminder[]
```

**`getInactiveParcels`** :
- Pour chaque `Parcel`, trouve la date max parmi les entrées `log` dont `parcelId` correspond.
- Si aucune entrée : `daysSinceLastEntry: null`, rappel toujours inclus (parcelle jamais touchée).
- Si la date max est à plus de `thresholdDays` jours de `today` : inclus avec le nombre de jours
  écoulés.
- Sinon : exclu du résultat.

**`getHarvestReminders`** :
- Pour chaque `Crop` avec `status` `'en_place'` ou `'en_recolte'` et un `catalogId` défini :
  - Cherche le `CatalogItem` correspondant. Si `daysToHarvest` est absent : ignoré.
  - Si le catalogue a `sowingMonths` non vide : cherche la date de l'entrée `semis` la plus
    ancienne pour ce `cropId` dans `log` ; sinon cherche l'entrée `plantation` la plus ancienne.
  - Si aucune date de référence trouvée : ignoré (rien à calculer).
  - Si une entrée `recolte` existe déjà pour ce `cropId` : ignoré (déjà en cours de récolte).
  - Calcule `daysSinceReference = today - dateReference` en jours. Si
    `daysSinceReference >= daysToHarvest` : inclus dans le résultat.

### `src/pages/GardenPage.tsx`

- Au montage, charge en plus `db.log.toArray()` et `db.catalog.toArray()` (les parcelles et
  cultures sont déjà chargées).
- Calcule `getInactiveParcels(parcels, log, todayIso())` et
  `getHarvestReminders(crops, catalog, log, todayIso())`.
- Si les deux listes sont vides : aucune section affichée.
- Sinon, section "Rappels" en haut de page, avant "Parcelles" :
  - Pour chaque `InactiveParcelReminder` : "{parcel.name} : rien noté depuis {daysSinceLastEntry} j"
    (ou "jamais" si `daysSinceLastEntry` est `null`).
  - Pour chaque `HarvestReminder` : "{vegetable} : semé(e)/planté(e) il y a {daysSinceReference} j,
    récolte possible" (le service ne distingue pas le verbe ; la page choisit "semé(e)" si la
    référence venait du semis, "planté(e)" sinon — `HarvestReminder` doit donc exposer la nature de
    la référence, voir ajustement ci-dessous).

**Ajustement de l'interface** pour exposer la nature de la référence à l'affichage :

```ts
export interface HarvestReminder {
  crop: Crop
  vegetable: string
  daysSinceReference: number
  referenceKind: 'semis' | 'plantation'
}
```

## Tests

- `reminderService.test.ts` :
  - `getInactiveParcels` : parcelle avec entrée récente (exclue), parcelle avec entrée ancienne
    (incluse avec le bon nombre de jours), parcelle sans aucune entrée (incluse, `null`), seuil
    personnalisé.
  - `getHarvestReminders` : culture avec semis ancien dépassant `daysToHarvest` (incluse), culture
    avec semis récent (exclue), culture sans `catalogId` ou sans `daysToHarvest` (exclue), culture
    déjà récoltée (exclue, malgré un semis ancien), culture utilisant la plantation comme référence
    quand le catalogue n'a pas de `sowingMonths`.
- `GardenPage.test.tsx` (existant, à étendre) : affichage de la section "Rappels" quand des
  rappels existent, absence totale de la section quand aucun rappel n'est actif.
