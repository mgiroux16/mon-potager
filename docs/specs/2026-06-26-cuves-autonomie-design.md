# Spec de conception : Palier 4D-3 — Niveau des cuves et autonomie en jours

Date : 2026-06-26
Auteur : Mathieu Giroux (conception assistée)
Statut : validé, prêt pour plan d'implémentation
Périmètre : troisième sous-palier de 4D (arrosage chiffré), sous-ensemble du palier "Eau" de
la spec globale [2026-06-24-mon-potager-design.md](2026-06-24-mon-potager-design.md).
Couvre le niveau des 5 cuves (saisie manuelle) et la projection d'autonomie en jours. Ne
couvre pas : la lecture du niveau par photo IA (palier 6, Gemini Vision), la carte photo
cliquable du jardin (4D-2, en attente d'une photo du jardin), la comparaison litres
versés/pluie reçue/météo (4D-4).

## 1. Objectif

Savoir, en un coup d'œil sur `/eau` : combien de litres restent dans les cuves au total, et
pour combien de jours d'autonomie au rythme de consommation actuel.

## 2. Décisions issues du brainstorming

- Le niveau de chaque cuve est saisi **manuellement** par Mathieu, en litres estimés (pas en
  pourcentage). Il peut s'aider d'une photo des cuves prise à l'œil, mais aucun appel IA n'a
  lieu dans ce palier : la lecture automatique par photo (Gemini Vision) est repoussée au
  palier 6, où elle pourra être réutilisée pour le diagnostic de plantes.
- La saisie se fait **directement sur la page `/eau`**, en édition inline (même pattern que
  `pricePerKg` sur `GardenPage`). Pas de nouveau type d'entrée de journal : seule la dernière
  valeur connue par cuve est gardée, pas d'historique des relevés.
- L'autonomie se calcule sur la **consommation moyenne des 7 derniers jours**, toutes
  parcelles confondues (réactif aux changements récents, ex. canicule).
- Affichage : un **total agrégé** (litres restants / capacité totale + autonomie en jours) en
  haut de page, puis le **détail des 5 cuves** avec édition inline, puis (inchangé) le détail
  par parcelle du 4D-1.
- Si la consommation moyenne des 7 derniers jours est nulle, l'autonomie affiche
  **"Autonomie : illimitée"** plutôt qu'un calcul de division par zéro ou un nombre absurde.
- Pas de prise en compte de la recharge par la pluie dans ce palier (ça reviendrait à anticiper
  sur 4D-4, qui traite explicitement la comparaison arrosage/météo). Le niveau d'une cuve ne
  remonte que si Mathieu le ressaisit après l'avoir constaté (ex. après une pluie).

## 3. Modèle de données

Aucun changement de modèle. `WaterTank` ([model.ts:124](../../src/data/model.ts)) et la table
Dexie `tanks` existent déjà et sont peuplées par les données de démo
([seed.ts:20-25](../../src/data/seed.ts)) : 5 cuves de 500 L chacune (2500 L de capacité totale).

```ts
export interface WaterTank {
  id?: number
  name: string
  capacityLiters: number
  estimatedLiters?: number
}
```

## 4. Calcul (dérivé, jamais stocké)

Nouveau service pur `src/services/tankAutonomyService.ts` (même esprit que
`waterUsageService.ts` : aucune dépendance React, testable) :

```ts
export interface TankAutonomySummary {
  totalCapacityLiters: number
  totalEstimatedLiters: number
  dailyAverageLiters: number
  autonomyDays: number | null // null = autonomie illimitée (pas de consommation recente)
}

function summarizeTankAutonomy(
  tanks: WaterTank[],
  entries: GardenLogEntry[],
  refDate: string,
): TankAutonomySummary
```

- `totalCapacityLiters` = somme de `capacityLiters` sur toutes les cuves.
- `totalEstimatedLiters` = somme de `estimatedLiters` sur toutes les cuves (une cuve sans
  `estimatedLiters` renseigné compte comme 0, elle ne provoque pas d'erreur).
- `dailyAverageLiters` = somme des `volumeLiters` de toutes les entrées `type === 'arrosage'`
  (toutes parcelles confondues) dont `entry.date` est dans les 7 jours précédant `refDate`
  inclus, divisée par 7. Réutilise la même règle de fenêtre glissante que
  `summarizeWaterUsage` (entrées sans `volumeLiters` ou sans `parcelId` ignorées, par
  cohérence avec 4D-1, même si `parcelId` n'a pas d'incidence ici puisqu'on agrège toutes les
  parcelles).
- `autonomyDays` = `totalEstimatedLiters / dailyAverageLiters`, arrondi à l'entier le plus
  proche (`Math.round`). Si `dailyAverageLiters === 0`, `autonomyDays` vaut `null` (cas
  "illimitée", voir §5).
- Aucune dépendance à `summarizeWaterUsage` : les deux services lisent les mêmes
  `GardenLogEntry[]`, mais agrègent différemment (par parcelle pour l'un, toutes parcelles
  confondues pour l'autre), donc pas de couplage entre eux à ce stade.

## 5. Page `/eau` (complète, ne remplace pas le 4D-1)

`WaterPage.tsx` gagne deux sections, ajoutées avant le détail par parcelle déjà existant
(4D-1, inchangé) :

1. **Réserve totale**, en haut de page :
   - "Réserve d'eau : `{totalEstimatedLiters}` / `{totalCapacityLiters}` L"
   - Si `autonomyDays !== null` : "Autonomie : `{autonomyDays}` jours"
   - Si `autonomyDays === null` : "Autonomie : illimitée"
2. **Détail des cuves**, une carte par cuve avec édition inline du niveau :
   - Affiche `{tank.name}` et un champ numérique pré-rempli avec `estimatedLiters` (vide si
     `undefined`), sur le modèle de l'édition `pricePerKg` de `GardenPage.tsx`.
   - À la perte de focus (`onBlur`) ou à la validation, écrit la nouvelle valeur via
     `db.tanks.update(tank.id, { estimatedLiters: Number(value) })` si la valeur a changé et
     est un nombre valide. Pas de bouton "Enregistrer" séparé, cohérent avec le pattern
     `GardenPage`.
   - Si la liste des cuves est vide (pas de données de démo, base neuve) : pas de section
     cuves affichée, uniquement le message "Réserve d'eau : 0 / 0 L" en compatibilité avec le
     calcul (évite une carte vide sans contenu utile).

Le détail par parcelle (3e section, 4D-1) garde son comportement actuel : message
"Pas encore d'arrosage enregistré" si aucune ligne, sinon la liste des cartes par parcelle.

## 6. Hors périmètre (explicitement exclu de cette spec)

- Lecture du niveau par photo IA (Gemini Vision) : palier 6.
- Carte photo cliquable du jardin : 4D-2, en attente de la photo du jardin.
- Recharge des cuves par la pluie / comparaison arrosage-météo : 4D-4.
- Historique des relevés de niveau dans le journal : seule la dernière valeur connue par cuve
  est gardée, pas de type d'entrée `releve_cuve`.
- Alertes ou notifications sur seuil bas d'autonomie : pas demandé, pas de notification push
  en v1 de toute façon (cf. spec globale §4).

## 7. Tests

- `tankAutonomyService.test.ts` : calcul de `totalCapacityLiters`/`totalEstimatedLiters` sur
  plusieurs cuves, cuve sans `estimatedLiters` comptée comme 0, calcul de
  `dailyAverageLiters` sur la fenêtre de 7 jours (entrées hors fenêtre ignorées, entrées sans
  `volumeLiters` ignorées), `autonomyDays` arrondi correctement, `autonomyDays` à `null` quand
  la consommation des 7 jours est nulle.
- `WaterPage.test.tsx` (étendre les tests existants du 4D-1) : affichage de la réserve totale
  et de l'autonomie en jours avec des données de cuves et d'arrosage, affichage
  "Autonomie : illimitée" quand aucun arrosage récent, édition inline du niveau d'une cuve qui
  persiste bien en base (`db.tanks`), pas de section cuves si la table `tanks` est vide.
