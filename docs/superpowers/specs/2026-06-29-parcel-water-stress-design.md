# Indicateur de stress hydrique par parcelle

## Contexte

Le journal affiche déjà les entrées `arrosage` (aucun changement nécessaire). Ce qui manque : un
indicateur visuel par parcelle ("depuis combien de temps elle a soif") tenant compte de
l'évapotranspiration, de la pluie, du paillage et du besoin en eau de la culture.

Dans ce jardin, chaque parcelle correspond à une seule culture (mapping 1:1), donc le `waterNeed`
de la culture s'applique directement à sa parcelle.

## Calcul du score de déficit hydrique

Nouveau service `src/services/parcelWaterStressService.ts`.

Pour une parcelle, sur la fenêtre `[dernier arrosage logué, aujourd'hui]` (plafonnée à 21 jours si
jamais arrosée ou arrosage trop ancien) :

```
deficitMm = somme_jour( ET0_jour x mulchFactor x waterNeedFactor ) - pluieCumuleeMm
```

- `ET0_jour` : champ `et0_fao_evapotranspiration` d'Open-Meteo (mm/jour), à ajouter à
  `fetchDailyHistory` dans [weatherService.ts](../../../src/services/weatherService.ts) (nouveau
  champ optionnel sur `DailyWeather`, rétrocompatible).
- `mulchFactor` : `0.7` si `parcel.mulch` est une chaîne non vide, sinon `1.0`. Paillage = moins
  d'évaporation du sol.
- `waterNeedFactor` : culture liée à la parcelle (1ère culture active trouvée, pas de soft-delete) →
  `faible` = `0.6`, `moyen` = `1.0`, `eleve` = `1.4`, pas de culture/waterNeed connu = `1.0`.
- `pluieCumuleeMm` : même source que [wateringComparisonService.ts](../../../src/services/wateringComparisonService.ts)
  (relevés manuels `releve_pluie` prioritaires, sinon historique météo).
- Cas jamais arrosé : `deficitMm` forcé à une valeur au-dessus du seuil rouge (état rouge garanti),
  sans avoir besoin de calculer sur 21 jours dans le vide.

## Seuils et couleurs

| deficitMm | État | Couleur |
|---|---|---|
| < 15 | OK | vert |
| 15 à 35 | À surveiller | jaune/orange |
| > 35 (ou jamais arrosé) | Stress | rouge |

Fonction exportée `parcelWaterStress(entries, parcels, crops, history, refDate): ParcelWaterStress[]`
avec `{ parcelId, deficitMm, level: 'ok' | 'surveiller' | 'stress', daysSinceWatering: number | null }`.

## Intégration UI

**GardenMapPage** : la bordure (ou un point coloré en coin) de chaque bloc parcelle reprend la
couleur du niveau. Remplace l'usage actuel de `colorFor(id)` qui sert à distinguer visuellement les
zones sans lien avec l'arrosage — on garde le remplissage existant et on ajoute juste la bordure/le
badge de stress, pas de refonte visuelle.

**WaterPage** : une pastille de couleur ajoutée devant le nom de parcelle dans le tableau
"Arrosage vs pluie par parcelle", calculée par le même service.

Les deux pages appellent `parcelWaterStress(...)` avec les données déjà chargées (`db.log`,
`db.parcels`, `db.crops`, `fetchDailyHistory`) — pas de nouvelle requête réseau créée pour cette
fonctionnalité, on réutilise l'historique météo déjà récupéré ailleurs (ou on le récupère une fois
par page comme le fait déjà JournalPage).

## Tests

- `parcelWaterStressService.test.ts` : cas vert/jaune/rouge, jamais arrosé, paillage présent/absent,
  waterNeed faible/moyen/eleve, relevé pluie manuel vs historique météo.
- Mise à jour de `weatherService.test.ts` pour le nouveau champ ET0.
- Pas de nouveau test E2E requis ; vérification visuelle manuelle sur GardenMapPage et WaterPage
  suffit pour l'intégration UI (composants déjà couverts par leurs tests existants).

## Hors scope

- Pas de notification/rappel automatique (existe déjà via `reminderService.ts`, non touché ici).
- Pas de calcul d'évapotranspiration "maison" : on utilise directement le champ Open-Meteo.
- Pas de gestion du cas où une parcelle a plusieurs cultures actives avec des `waterNeed`
  différents au-delà du choix "1ère culture trouvée" (n'arrive pas dans ce jardin).
