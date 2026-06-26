# Palier 4D-4 : comparaison arrosage / pluie par parcelle

## Objectif

Comparer, par parcelle, les litres versés à l'arrosage avec les litres de pluie reçus, sur
plusieurs fenêtres glissantes. Objectif : donner à Mathieu une vue chiffrée de ce que chaque
parcelle a réellement reçu (arrosage + pluie), sans alerte ni seuil automatique.

## Données disponibles

- `waterUsageService.summarizeWaterUsage` : litres versés par parcelle sur 7j/14j/30j/année
  (palier 4D-1, déjà en place).
- Pluie : deux sources possibles.
  - Relevés manuels du journal, type `GardenLogEntry.type === 'releve_pluie'`, champ `rainMm`.
  - Historique API Open-Meteo (`weatherService.fetchDailyHistory`), déjà utilisé dans
    `JournalPage` pour le bandeau de contexte météo.
- `Parcel.areaM2` : surface de la parcelle, optionnelle.

## Service : `wateringComparisonService.ts`

Fonction pure, sans dépendance React, testée en isolation (comme les autres services).

```ts
export interface ParcelWateringComparison {
  parcelId: number
  parcelName: string
  liters7: number
  liters14: number
  liters30: number
  rainLiters7: number | null
  rainLiters14: number | null
  rainLiters30: number | null
  totalLiters7: number
  totalLiters14: number
  totalLiters30: number
}

export function compareWateringToRain(
  usage: WaterUsageRow[],
  parcels: Parcel[],
  rainMm7: number,
  rainMm14: number,
  rainMm30: number,
): ParcelWateringComparison[]
```

- La pluie est une mesure **globale au jardin** (un seul pluviomètre / une seule API), pas par
  parcelle. Le même `rainMm` est appliqué à toutes les parcelles, pondéré par leur surface :
  `rainLiters = rainMm × parcel.areaM2`.
- Si `parcel.areaM2` est `undefined`, `rainLiters7/14/30` valent `null` (pas de conversion
  possible). `totalLiters` retombe alors sur `litersGiven` seul.
- `totalLiters = litersGiven + (rainLiters ?? 0)`.

### Calcul de `rainMm7/14/30` (en amont du service, côté page)

Logique de fallback, calculée une fois par fenêtre avant d'appeler `compareWateringToRain` :

1. Sommer les relevés manuels (`releve_pluie`) du journal dans la fenêtre.
2. S'il y a au moins une entrée manuelle dans la fenêtre, utiliser cette somme.
3. Sinon, utiliser la somme de `DailyWeather.rainMm` (historique API) sur la même fenêtre.
4. Si l'historique API n'est pas disponible (hors-ligne) et qu'il n'y a aucune entrée manuelle,
   `rainMm` vaut `0` pour cette fenêtre (pas de pluie connue, pas de blocage de l'affichage).

Cette fonction de fallback est une fonction pure dédiée, testable indépendamment :

```ts
export function resolveRainMm(
  entries: GardenLogEntry[],
  history: DailyWeather[] | null,
  refDate: string,
  windowDays: number,
): number
```

## UI : `WaterPage.tsx`

Nouvelle section, après le bilan litres par parcelle (4D-1) et avant la section cuves/autonomie
(4D-3) : tableau "Arrosage vs pluie par parcelle" avec une colonne par fenêtre (7j / 14j / 30j).
Chaque cellule affiche :
- litres versés
- litres de pluie estimés (ou « surface non renseignée » si `areaM2` absent)
- total

`WaterPage` appelle `fetchDailyHistory` au montage, même pattern que `JournalPage` (résultat
`null` si hors-ligne ou erreur réseau — dans ce cas le fallback API ne produit rien et seules les
entrées manuelles comptent).

## Hors scope

- Pas d'indicateur visuel suffisant/insuffisant (pas de seuil à définir maintenant).
- Pas de calcul automatique litres ↔ durée (règle déjà actée, voir mémoire projet).
- Pas de gestion par culture, uniquement par parcelle.
