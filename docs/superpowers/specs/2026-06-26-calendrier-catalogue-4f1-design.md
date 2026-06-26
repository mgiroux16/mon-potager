# Design : 4f-1 - Calendrier mensuel du catalogue

## Contexte

Le palier 4f de la roadmap (`docs/superpowers/specs/2026-06-25-palier-4-carnet-culture-design.md`)
regroupe quatre fonctions distinctes : calendrier mensuel, rappels contextuels basés sur
l'historique, alerte rotation, aide associations compagnons/antagonistes. Comme pour le palier 4D,
il est découpé en mini-paliers. 4f-1 couvre uniquement le calendrier mensuel.

Le modèle `CatalogItem` (déjà présent depuis le palier 1, table Dexie `catalog`, peuplée par
`seedCatalog` dans `src/data/seed.ts`) contient déjà `sowingMonths`, `plantingMonths`,
`harvestMonths` (tableaux de mois 1-12). Aucune migration Dexie n'est nécessaire pour 4f-1.

## Objectif

Une page calendrier qui répond à "qu'est-ce que je peux semer / planter / récolter ce mois-ci ?",
en se basant sur le catalogue complet, indépendamment des cultures réellement en cours.

## Hors périmètre (renvoyé à 4f-2 / 4f-3)

- Rappels contextuels basés sur l'historique du journal (ex : "radis semés il y a 28 j, récolte
  possible", "rien noté sur cette parcelle depuis 3 semaines").
- Alerte rotation (solanacées deux ans de suite sur une même parcelle).
- Aide associations (`companions`/`antagonists` du catalogue) : les champs existent déjà dans
  `CatalogItem` mais ne sont pas affichés dans 4f-1.

## Décisions

- **Navigation** : mois par mois avec boutons précédent/suivant (pas seulement le mois courant),
  même pattern que le sélecteur d'année de `SeasonSummaryPage`.
- **Regroupement** : par action (3 sections "À semer", "À planter", "À récolter"), chacune listant
  les légumes concernés ce mois-ci. Pas de regroupement par légume.
- **Filtrage** : tout le catalogue est affiché, sans distinction avec les `Crop` réellement en
  cours cette année. Le calendrier est un aide-mémoire général, utile aussi pour décider de
  nouvelles cultures.
- **Emplacement** : nouvelle page dédiée, route `/calendrier`, avec entrée de navigation, suivant le
  pattern des pages existantes (`WaterPage`, `SeasonSummaryPage`).

## Architecture

### `src/services/calendarService.ts`

Fonction pure, sans accès Dexie direct (testable sans mock de la base) :

```ts
export interface MonthPlan {
  toSow: CatalogItem[]
  toPlant: CatalogItem[]
  toHarvest: CatalogItem[]
}

export function getMonthPlan(catalog: CatalogItem[], month: number): MonthPlan
```

- `month` : 1-12.
- Filtre `catalog` sur `sowingMonths?.includes(month)`, `plantingMonths?.includes(month)`,
  `harvestMonths?.includes(month)` respectivement.
- Chaque tableau de résultat est trié alphabétiquement par `vegetable` (locale `'fr'`).
- Un même `CatalogItem` peut apparaître dans plusieurs sections le même mois (ex : tomate semée et
  plantée à des mois différents, mais un légume avec semis et récolte le même mois apparaîtrait
  dans les deux sections correspondantes).

### `src/pages/CalendarPage.tsx`

- State local : `month` (number, 1-12), initialisé sur le mois courant (`new Date().getMonth() + 1`).
- Chargement du catalogue via `db.catalog.toArray()` au montage (pattern `useEffect` déjà utilisé
  sur les autres pages comme `SeasonSummaryPage`).
- Boutons ◀ / ▶ pour changer de mois (modulo 12, pas de notion d'année puisque le catalogue est
  annuel et récurrent).
- Affiche le nom du mois en français (ex : "Juillet").
- Trois sections "À semer", "À planter", "À récolter", chacune listant `vegetable` des
  `CatalogItem` retournés par `getMonthPlan`.
- Si une section est vide : message "Rien à semer / planter / récolter ce mois-ci."

### Routage et navigation

- Nouvelle route `/calendrier` ajoutée au routeur (même registre que `/bilan`).
- Lien de navigation ajouté au même endroit que les autres pages (menu/nav principal).

## Tests

- `calendarService.test.ts` : couvre le filtrage par mois pour chaque section, le tri
  alphabétique, le cas d'un légume présent dans plusieurs sections, et le cas d'un mois sans aucune
  correspondance (sections vides).
- Pas de test Dexie nécessaire (le service est pur), un test de montage minimal sur `CalendarPage`
  peut vérifier l'affichage du mois courant et la navigation ◀ / ▶ si jugé utile à l'implémentation.
