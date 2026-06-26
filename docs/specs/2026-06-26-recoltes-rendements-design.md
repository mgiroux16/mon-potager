# Spec de conception : Palier 4C — Récoltes / rendements / €

Date : 2026-06-26
Auteur : Mathieu Giroux (conception assistée)
Statut : validé, prêt pour plan d'implémentation
Périmètre : sous-ensemble du palier 7 (pilotage chiffré) de la spec globale
[2026-06-24-mon-potager-design.md](2026-06-24-mon-potager-design.md), anticipé avant le palier 5/6
à la demande de Mathieu. Couvre uniquement les récoltes, pas l'eau (palier 4D, spec séparée) ni
les dépenses amorties (reste du palier 7, plus tard).

## 1. Objectif

Savoir, par légume et par année : combien récolté (kg), et combien ça aurait coûté au magasin (€)
si le prix au kg a été renseigné. Comparer les années entre elles d'un coup d'œil.

## 2. État existant (déjà fait, ne pas retoucher)

La saisie d'une récolte fonctionne déjà intégralement :
- `recolte` est un `LogEntryType` existant ([model.ts:30](../../src/data/model.ts)).
- `GardenLogEntry.quantityKg` existe déjà comme champ optionnel.
- `recolte` est dans `FREQUENT` ([QuickAddPage.tsx:29](../../src/pages/QuickAddPage.tsx)) avec
  `target: 'culture'` et `measure: 'quantite'` : le formulaire demande déjà la culture et la
  quantité en kg, et écrit `entry.quantityKg` ([QuickAddPage.tsx:145](../../src/pages/QuickAddPage.tsx)).
- La dictée vocale route déjà ce type via `configForType('recolte')`.

**Rien à changer côté saisie.** Le travail neuf est : le prix, le calcul, et l'affichage.

## 3. Modèle de données (changement)

Ajouter un champ optionnel à `Crop` ([model.ts:78](../../src/data/model.ts)) :

```ts
export interface Crop {
  // ... champs existants inchangés
  pricePerKg?: number // € au kg, saisi manuellement par Mathieu (marché/magasin)
}
```

- Une culture (`Crop`) correspond à une saison (une nouvelle `Crop` est créée chaque année pour
  le même légume) : le prix vit donc naturellement par année, pas besoin de dater le prix
  séparément.
- Pas de migration de données nécessaire au sens strict (Dexie ajoute un champ optionnel sans
  bump de version de schéma, car aucun index n'est créé sur ce champ).
- Vide par défaut. Tant que `pricePerKg` n'est pas renseigné pour une `Crop`, aucune valorisation
  € n'est calculée pour les récoltes de cette culture (seul le kg s'affiche).

## 4. Édition du prix (UI)

Sur `GardenPage` ([GardenPage.tsx](../../src/pages/GardenPage.tsx)), dans la section Cultures,
chaque ligne de culture devient éditable pour son prix au kg :
- Affichage : `{culture.name} · {prix}€/kg` si renseigné, sinon juste le nom + un bouton/icône
  discret pour ajouter un prix.
- Édition : tap sur la ligne (ou sur l'icône) ouvre un input numérique inline (pas de modal),
  validation au blur ou Enter, écrit `db.crops.update(id, { pricePerKg })`.
- Pas de validation de plage (un prix à 0 ou très élevé est accepté, c'est une donnée perso).

## 5. Calcul (dérivé, jamais stocké)

Nouveau service pur `src/services/harvestService.ts` (aucune dépendance React, testable comme les
autres services) :

```ts
interface HarvestRow {
  cropId: number
  cropName: string
  year: number
  totalKg: number
  pricePerKg?: number
  totalEuros?: number // totalKg * pricePerKg, undefined si pricePerKg absent
}

function summarizeHarvests(entries: GardenLogEntry[], crops: Crop[]): HarvestRow[]
```

- Filtre les `GardenLogEntry` de `type === 'recolte'` avec `quantityKg` défini et `cropId` défini.
- Groupe par `cropId` + année (extraite de `entry.date`, format `YYYY-MM-DD` → `YYYY`).
- Une `Crop` peut recevoir plusieurs entrées de récolte dans la même année (plusieurs cueillettes) :
  elles se somment dans la même `HarvestRow`.
- `cropName` vient de `crops.find(c => c.id === cropId)?.name`, repli sur `'(culture supprimée)'`
  si la culture n'existe plus (entrée orpheline).
- `totalEuros` calculé seulement si la `Crop` correspondante a un `pricePerKg`.

## 6. Page `/recoltes`

Nouvelle page `src/pages/HarvestPage.tsx`, route `recoltes` ajoutée dans `App.tsx` (pas dans la
nav du bas, qui reste à 5 icônes).

**Accès** : un lien/carte dans `GardenPage`, sous la section Cultures, du type
"Voir le bilan des récoltes →".

**Contenu** :
1. Titre "Récoltes et rendements".
2. Liste groupée par légume (= `cropName`), une carte par légume :
   - une ligne par année avec ce légume : `{année} · {totalKg} kg{ · totalEuros €}`.
   - sous la liste d'années, un mini-graphique en barres CSS (une barre par année, hauteur
     proportionnelle au kg max du légume, label année en dessous, valeur kg au survol/au-dessus
     de la barre). Pas de lib externe, divs + Tailwind, même esprit que les autres composants
     visuels de l'app.
3. Si aucune récolte enregistrée : message vide explicite ("Pas encore de récolte enregistrée").
4. Tri des légumes par ordre alphabétique du nom de culture (simple, pas de tri par volume pour
   cette V1).

## 7. Hors périmètre (explicitement exclu de cette spec)

- Pas de prix par défaut suggéré (catalogue de prix marché) : Mathieu saisit lui-même, toujours.
- Pas de récolte en "pièces" (courges, choux comptés à l'unité) : seul `quantityKg` existe pour
  l'instant, cohérent avec le modèle actuel. Pourra être ajouté plus tard si besoin réel.
- Pas d'export ni de impression du bilan récoltes (l'export JSON global existant suffit).
- Pas de notification ni de rappel pour saisir le prix.
- Le reste du palier 7 (dépenses amorties, bilan de saison complet eau+récolte+€) reste pour plus
  tard, non couvert ici.

## 8. Tests

- `harvestService.test.ts` : cas multiples entrées même année/culture (sommation), culture sans
  prix (pas de `totalEuros`), entrée orpheline (`cropId` introuvable), plusieurs années pour le
  même légume, tri.
- `HarvestPage.test.tsx` : rendu liste vide, rendu avec données, présence du lien depuis
  `GardenPage`.
- `GardenPage.test.tsx` (existant) : étendre pour couvrir l'édition inline du prix au kg.
