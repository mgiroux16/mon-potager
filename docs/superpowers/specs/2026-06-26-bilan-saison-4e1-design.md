# Palier 4E-1 : bilan de saison chiffré

Date : 2026-06-26
Statut : cahier des charges validé, prêt pour le plan d'implémentation.

## 1. Contexte

Suite du bloc 4e de `docs/superpowers/specs/2026-06-25-palier-4-carnet-culture-design.md`. Le bloc 4e
complet couvre des bilans chiffrés ET qualitatifs (satisfaction, "à refaire/à changer", météo
marquante en texte). Pour rester focalisé, on découpe :

- **4E-1 (ce document)** : bilan chiffré seulement (dates clés, récolte, rendement, valeur,
  économie nette simple, eau).
- **4E-2 (plus tard)** : qualitatif (satisfaction, notes libres, météo marquante en texte, photos
  importantes).

4E-1 ne couvre pas les arbres fruitiers : le bloc 4g (verger détaillé) leur est dédié et aura ses
propres besoins (alternance, floraison...).

## 2. Décisions tranchées

| # | Décision | Justification |
|---|----------|---------------|
| D1 | Saison = saison de culture (mois début/fin fixes), pas année civile, pas plage libre. | Plus fidèle au rythme réel du jardin. |
| D2 | Les mois de début/fin de saison sont des réglages globaux dans `AppSettings`. | Simple, valable pour toutes les années, modifiable si besoin. |
| D3 | Granularité du bilan : culture **et** variété **et** parcelle, trois vues distinctes. | Permet de comparer deux variétés d'une même culture, et de juger une parcelle dans son ensemble. |
| D4 | Économie nette simple incluse : dépenses dont la date tombe dans la fenêtre de saison et liées au `cropId`/`parcelId`, soustraites de la valeur récoltée. Pas de logique d'amortissement fine (consommable/étalé/durable ignorée). | Donne un chiffre utile sans la complexité de l'amortissement, qui pourra être affiné plus tard si besoin. |
| D5 | Pas de stockage du bilan : recalcul à la demande depuis le journal, comme `harvestService`/`waterUsageService`. | Cohérent avec l'existant, pas de désynchronisation possible. |
| D6 | Deux points d'accès : page dédiée `SeasonSummaryPage` (vue d'ensemble multi-cultures/parcelles) + section "Bilan {année}" sur les fiches culture et parcelle existantes. | Couvre à la fois la vue globale et le réflexe "je consulte la fiche d'une culture précise". |

## 3. Modèle de données

### 3.1 Évolution `AppSettings`
Ajout de deux champs (pas de migration Dexie nécessaire, `AppSettings` est un objet simple sans
version de schéma à incrémenter pour des champs optionnels) :
```
seasonStartMonth: number // 1-12, ex: 3 pour mars
seasonEndMonth: number   // 1-12, ex: 11 pour novembre
```
Valeurs par défaut : `3` (mars) et `11` (novembre), cohérent avec le climat Charente (H2b) déjà
mentionné dans le bloc 4f à venir.

### 3.2 Aucune autre évolution de modèle
`Crop.plantCount`, `Parcel.areaM2`, `Crop.pricePerKg`, `Expense.cropId`/`parcelId` existent déjà et
suffisent.

## 4. Service `seasonSummaryService.ts`

### 4.1 `seasonBounds(year, settings): { start: ISODate, end: ISODate }`
Calcule les dates de début/fin de saison pour une année donnée à partir de
`seasonStartMonth`/`seasonEndMonth`. Toujours dans la même année civile (pas de gestion de saison
à cheval sur deux années).

### 4.2 `summarizeCropSeason(entries, crops, varieties, parcels, expenses, year, settings): CropSeasonRow[]`
Une ligne par couple `(cropId, varietyId | undefined)` ayant au moins une entrée de récolte dans
la fenêtre de saison :
```
CropSeasonRow {
  cropId: number
  cropName: string
  varietyId?: number
  varietyName?: string        // "non précisée" si varietyId absent
  parcelId?: number
  parcelName?: string
  year: number
  firstHarvestDate?: ISODate
  lastHarvestDate?: ISODate
  totalKg: number
  yieldPerPlantKg?: number     // totalKg / Crop.plantCount, undefined si plantCount absent
  yieldPerM2Kg?: number        // totalKg / Parcel.areaM2, undefined si areaM2 absent
  grossValueEuros?: number     // totalKg * Crop.pricePerKg, undefined si pricePerKg absent
  expensesEuros: number        // somme des Expense liées au cropId, date dans la fenêtre
  netEuros?: number            // grossValueEuros - expensesEuros, undefined si grossValueEuros absent
}
```

### 4.3 `summarizeParcelSeason(entries, parcels, crops, expenses, waterSettings, year, settings): ParcelSeasonRow[]`
Une ligne par parcelle ayant au moins une entrée dans la fenêtre de saison :
```
ParcelSeasonRow {
  parcelId: number
  parcelName: string
  year: number
  totalKg: number              // toutes cultures confondues sur la parcelle
  yieldPerM2Kg?: number
  grossValueEuros?: number
  expensesEuros: number        // dépenses liées au parcelId, date dans la fenêtre
  netEuros?: number
  totalWaterLiters: number     // réutilise summarizeWaterUsage filtré sur la fenêtre
  totalRainLiters?: number     // réutilise resolveRainMm/compareWateringToRain
}
```

### 4.4 Réutilisation
Aucune logique de récolte/eau/pluie n'est redupliquée : `summarizeCropSeason`/
`summarizeParcelSeason` filtrent les entrées sur la fenêtre de saison puis appellent les fonctions
existantes (`summarizeWaterUsage`, `resolveRainMm`, `compareWateringToRain`) sur ce sous-ensemble.

## 5. Écrans

### 5.1 Nouvelle page `SeasonSummaryPage.tsx`
- Sélecteur d'année (liste des années présentes dans le journal, année courante par défaut).
- Deux tableaux : "Par culture/variété" et "Par parcelle", utilisant les lignes calculées.
- Si aucune entrée pour l'année choisie : message "Rien à montrer pour {année}", pas d'erreur.
- Ajout au routeur/navigation au même niveau que `HarvestPage`/`WaterPage`.

### 5.2 Section "Bilan {année}" sur les fiches existantes
- Sur `GardenPage` (fiche culture) : section repliable affichant la `CropSeasonRow` de l'année en
  cours pour cette culture (toutes variétés si plusieurs, ou la ligne unique sinon).
- Sur la fiche parcelle (si elle existe déjà sous cette forme dans `GardenPage` ou équivalent) :
  section similaire avec la `ParcelSeasonRow`.
- Si la fiche parcelle n'existe pas encore comme vue séparée, cette section est ajoutée à l'endroit
  le plus proche existant (à confirmer pendant le plan d'implémentation en regardant le code actuel
  de `GardenPage.tsx`).

### 5.3 Réglages
Ajout de deux champs "Mois de début de saison" / "Mois de fin de saison" (sélecteurs 1-12) dans
`SettingsPage.tsx`, avec les valeurs par défaut 3/11.

## 6. Cas limites

- `plantCount` ou `areaM2` absent → champ dérivé `undefined`, non affiché (pas de division par
  zéro/valeur manquante traitée comme 0).
- Culture sans `varietyId` → regroupée sous une ligne unique "variété non précisée" par culture.
- Dépense sans `cropId` ni `parcelId` → ignorée dans tous les agrégats (dépenses générales non
  attribuées, hors scope 4E-1).
- Dépense avec `cropId` mais culture sans récolte dans la fenêtre → la ligne existe quand même
  (dépense seule, `totalKg = 0`, `netEuros` négatif).
- Aucune entrée du tout pour l'année choisie → page/section affiche un état vide, pas d'erreur.
- Bornes de saison toujours à l'intérieur d'une même année civile.

## 7. Tests

- `seasonSummaryService.test.ts` : `seasonBounds` (bornes correctes selon réglages), 
  `summarizeCropSeason` (avec/sans plantCount, avec/sans areaM2, dépenses dans/hors fenêtre,
  variété manquante, dépense sans récolte), `summarizeParcelSeason` (agrégation multi-cultures,
  eau + pluie réutilisées correctement).
- `SeasonSummaryPage.test.tsx` : sélection d'année, affichage des deux tableaux, état vide.
- Tests de composant sur les sections ajoutées aux fiches existantes (`GardenPage.test.tsx` étendu).

## 8. Risques

- **Confusion fiche parcelle** : il faut vérifier pendant le plan où ajouter la section bilan côté
  parcelle, la structure actuelle de `GardenPage.tsx` n'a pas été auditée en détail dans ce
  brainstorming.
- **Double comptage culture/parcelle** : une parcelle avec plusieurs cultures ne doit pas confondre
  le rendement/m² de la parcelle (toutes cultures) avec celui d'une culture individuelle sur la
  même surface ; les deux métriques restent distinctes et clairement labellisées dans l'UI.
