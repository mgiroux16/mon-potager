# Palier 4 : le carnet de culture intelligent

Date : 2026-06-25
Statut : cahier des charges validé (cadrage), prêt pour le plan d'implémentation du bloc 4a.

## 1. Principe directeur

L'application n'est ni un tableau de bord eau, ni un suivi de cuves, ni une simple liste de
récoltes. C'est un **carnet de culture intelligent** dont l'unique but est de faire progresser
Mathieu comme jardinier, saison après saison : comprendre ce qu'il a fait, quand, dans quelles
conditions, ce que ça a donné, pourquoi ça a marché ou échoué, et quoi changer l'année suivante.

L'eau, la météo, les récoltes et les photos ne sont pas le centre : ce sont des **données au
service de l'apprentissage**. Toute fonction qui ne sert pas cet objectif est repoussée ou
supprimée (YAGNI).

## 2. Point de départ : ce qui existe déjà

On construit par-dessus l'existant, on ne réinitialise pas. État au 2026-06-25 (commit `3c52ea3`) :

- **Stockage** : Dexie, base `mon-potager`, 10 stores (`log`, `parcels`, `crops`, `oyas`,
  `trees`, `tanks`, `catalog`, `expenses`, `soil`, `settings`). Voir `src/data/db.ts` et
  `src/data/model.ts`.
- **Journal unifié** : `GardenLogEntry` est l'unique registre d'événements. 15 types d'entrées
  (`arrosage`, `recolte`, `observation`, `probleme`, `semis`, `plantation`, etc.). Champs déjà
  présents : `volumeLiters`, `rainMm`, `quantityKg`, `photoUrls`, `time`, `createdAt`.
- **Saisie vocale + sas de validation (livré au palier 3b-2b)** : micro flottant global →
  Web Speech → Gemini structure la phrase → formulaire **prérempli** → l'utilisateur valide ou
  corrige → écriture en base seulement après validation. La phrase d'origine sert d'entrée.
  Repli propre si pas de clé ou pas de réseau. Fichiers clés : `voiceParseService.ts`,
  `geminiService.ts`, `speechService.ts`, `EntryForm`, `QuickAddPage`, `VoiceCapture`.
- **Catalogue Champniers** : `CatalogItem` (légume, famille, mois de semis/plantation/récolte,
  compagnons, antagonistes).
- **Dépenses amorties** : `Expense` (consommable / étalé / durable).
- **Verger** : store `trees` (`FruitTree`).
- **Sol** : store `soil` (`SoilNote`).
- **Réglages** : `AppSettings` (géoloc lat/long, seuils gel/chaleur/pluie, débit d'arrosage,
  niveau IA, clé Gemini sur l'appareil).

Conséquence : le « Bloc 2 — saisie naturelle + sas de validation IA » du cahier initial est
**déjà livré**. On l'étend, on ne le reconstruit pas.

## 3. Décisions tranchées

| # | Décision | Justification |
|---|----------|---------------|
| D1 | Hiérarchie : **Parcelle → Culture → Variété**, plus un nombre de plants sur la culture. Pas de niveau zone, rang, ni plant individuel. | Le plus léger à tenir au quotidien tout en couvrant l'objectif de comparaison. Validé par Mathieu. |
| D2 | La **variété devient une entité de plein droit**, reliée au catalogue. | Toute la comparaison inter-saisons (rendement, goût, résistance) repose dessus. En texte libre, agrégation impossible. |
| D3 | **Météo Open-Meteo**, sans clé API, géoloc depuis les réglages. | Gratuit, sans clé, fournit l'archive historique ET l'évapotranspiration (ET0 FAO). |
| D4 | Deux mécanismes météo distincts : **snapshot figé** à la saisie + **cumuls recalculés** à la demande. | Le snapshot doit être stocké dès le départ (sinon perdu). Les cumuls se recalculent quand on veut. |
| D5 | Statuts d'entrée minimaux : **`brouillon` / `validé`** + conservation de la phrase d'origine. Pas 5 statuts. | Éviter la lourdeur. On ajoute des statuts seulement si le besoin se confirme. |
| D6 | Évolution **incrémentale** du modèle, jamais de réécriture from scratch. | 81 tests passent. Migration Dexie douce, pas de table rase. |
| D7 | L'**analyse à hypothèses (diagnostic IA)** vient en dernier, sur un historique déjà riche. | C'est la partie la plus spéculative et la plus dépendante de l'IA. Le factuel d'abord. |

## 4. Modèle de données cible

Évolutions à apporter (migration Dexie `version(2)`), sans casser l'existant :

### 4.1 Nouvelle entité `Variety`
```
Variety {
  id?
  name              // ex : "Saint-Pierre"
  vegetable         // lien logique vers le catalogue (ex : "Tomate")
  catalogId?        // lien dur vers CatalogItem si présent
  source?           // semencier, échange, ferme...
  notes?
  // Attributs d'apprentissage cumulés (renseignés via bilans, pas saisis à la main) :
  // calculés à la volée depuis le journal, pas stockés en dur, pour éviter la dé-synchro.
}
```
Note : les scores (goût, résistance chaleur, résistance maladie, précocité, facilité, à refaire)
sont **dérivés du journal et des bilans**, pas des champs figés sur la variété. Un champ figé se
désynchronise ; une valeur calculée reste vraie.

### 4.2 Évolution de `Crop`
- `varietyId?` (lien vers `Variety`) en plus du `variety?` texte conservé pour compatibilité.
- `plantCount?` (nombre de plants).

### 4.3 Évolution de `GardenLogEntry`
- `varietyId?` : pour rattacher une action/observation/récolte à une variété.
- `status?: 'brouillon' | 'valide'` (défaut `valide` pour les saisies manuelles directes,
  `brouillon` tant qu'une entrée issue de l'IA n'est pas confirmée).
- `sourcePhrase?` : la phrase naturelle d'origine (déjà partiellement gérée par le flux vocal).
- `weather?: WeatherSnapshot` : le snapshot figé (voir 4.4).
- Enrichissement de la liste des types : ajouter `repiquage`, `fertilisation`, `tuteurage`,
  `ombrage`, `desherbage`, `binage`, `protection_gel`. (Les types existants couvrent déjà
  arrosage, paillage, compost, taille, traitement, etc.)

### 4.4 Type `WeatherSnapshot` (figé dans l'entrée)
```
WeatherSnapshot {
  capturedAt          // epoch ms
  tempC?              // température au moment de la saisie
  tempMinC?           // min du jour
  tempMaxC?           // max du jour
  rainMm?             // pluie du jour
  source: 'open-meteo' | 'manuel'
}
```
Les cumuls (pluie 7/14/30 j, jours sans pluie, jours > 30 °C, épisode canicule/sécheresse) ne
sont **pas** stockés : ils sont calculés à la demande depuis l'archive Open-Meteo + le journal.

### 4.5 Observation terrain vs météo théorique
Important pour l'apprentissage : il peut avoir plu officiellement mais le sol rester sec sous le
paillage. On garde la distinction via des **observations terrain** (entrées de type `observation`
avec tags `sol_sec`, `sol_humide`, `feuilles_fletries`, `paillage_sec`...), à ne jamais confondre
avec le snapshot météo théorique.

## 5. Les blocs livrables

Ordre conçu pour ne rien jeter et faire arriver la météo (la vraie valeur ajoutée) tôt.

### Bloc 4a : fondation du modèle (PREMIER À IMPLÉMENTER)
- **Objectif** : poser la variété-entité, la hiérarchie, les statuts et la phrase d'origine.
- **Données** : migration `version(2)` Dexie ; nouvelle entité `Variety` ; champs `varietyId`,
  `plantCount`, `status`, `sourcePhrase` ; service `varietyService` (CRUD + liaison catalogue).
- **Écrans** : gestion des variétés (liste + création depuis le catalogue) ; le formulaire de
  saisie gagne un sélecteur de variété sous la culture ; le badge `brouillon`/`validé`.
- **Risques** : migration Dexie sur des données réelles existantes. Mitigation : migration testée
  + export JSON de secours embarqué dès ce bloc (début de 4h tiré en avant).
- **Dépendances** : aucune externe.

### Bloc 4b : météo Open-Meteo
- **Objectif** : rattacher chaque entrée à son contexte météo, automatiquement.
- **Fonctions** : `weatherService` (snapshot du jour à la saisie ; cumuls historiques à la
  demande ; détection d'épisodes canicule/sécheresse à partir des seuils des réglages).
- **Données** : `WeatherSnapshot` figé sur l'entrée ; cache local court des appels Open-Meteo.
- **Écrans** : bandeau de contexte sous une observation (« notée après 12 jours de forte chaleur,
  3 arrosages enregistrés, peu de pluie »).
- **Risques** : hors-ligne, quotas Open-Meteo, géoloc absente. Mitigation : dégradation propre
  (snapshot `manuel` possible), cache, fallback sur lat/long des réglages.
- **Dépendances** : Open-Meteo (réseau). Premier appel externe non optionnel de l'appli.

### Bloc 4c : récoltes, rendements et économies
- **Objectif** : transformer les pesées en bilans chiffrés et en valeur économique.
- **Fonctions** : agrégats kg par culture / variété / parcelle / plant ; rendement au m² ;
  première et dernière récolte ; pic de production ; valorisation € (prix standard et bio) ;
  économie nette croisée avec les dépenses ; destination (frais, donné, congelé, transformé,
  perdu, composté) ; pertes (abîmé, maladie, ravageur, trop tard, fendu, pourri).
- **Données** : enrichir l'entrée `recolte` (variété, qualité, destination) ; table de prix de
  référence (éditable).
- **Écrans** : page Récoltes (saisie rapide + récap par légume) ; fiche bilan par culture.
- **Risques** : prix de référence arbitraires. Mitigation : prix éditables, hypothèse affichée.

### Bloc 4d : actions culturales complètes + arrosage chiffré
- **Objectif** : couvrir toutes les actions, et calculer les litres d'arrosage.
- **Fonctions** : calcul `litres = nb goutteurs × débit × durée` (débit confirmé : **2 L/h par
  goutteur/trou**) ; paramètre de débit et longueur de ligne par parcelle, vérifiable et éditable.
- **Données** : paramètres d'arrosage par parcelle ; nouveaux types d'actions (cf. 4.3).
- **Écrans** : saisie d'arrosage (« tomates, 2 h » → litres calculés) ; bilan eau par culture
  (arrosages manuels + litres estimés + pluie naturelle sur la période).
- **Dépendances** : la pluie naturelle vient de 4b.

### Bloc 4e : bilans de saison automatiques
- **Objectif** : un bilan par culture, variété, parcelle et arbre en fin de saison.
- **Fonctions** : dates clés, total récolté, rendement/plant et /m², valeur estimée, dépenses,
  problèmes, actions efficaces, météo marquante, photos importantes, satisfaction ; sections
  « à refaire / à changer / à ne pas refaire / à tester ».
- **Écrans** : page Bilan de saison ; tableau de synthèse multi-cultures.
- **Dépendances** : 4b, 4c, 4d.

### Bloc 4f : calendrier local + rappels + rotations
- **Objectif** : un calendrier H2b / Charente, et des rappels basés sur l'historique réel.
- **Fonctions** : quoi semer/planter/récolter ce mois (depuis le catalogue) ; rappels
  contextuels (« radis semés il y a 28 j, récolte possible » ; « rien noté sur cette parcelle
  depuis 3 semaines » ; « mildiou fin juillet l'an dernier ») ; alerte rotation (solanacées
  deux ans de suite) ; aide associations (compagnons/antagonistes du catalogue), sans en faire
  le centre.
- **Dépendances** : historique accumulé via 4a→4e.

### Bloc 4g : verger détaillé
- **Objectif** : étendre le suivi aux arbres fruitiers et petits fruits.
- **Fonctions** : par arbre, floraison, nouaison, chute de fruits, maladies, traitements,
  récoltes (kg), qualité, alternance année pleine/creuse, photos, bilan annuel.
- **Données** : enrichir `FruitTree` ; entrées de journal rattachées à `treeId` (déjà possible).

### Bloc 4h : export, import, sauvegarde (souveraineté)
- **Objectif** : les données appartiennent à Mathieu, rien n'est perdu si l'outil disparaît.
- **Fonctions** : export JSON complet ; export CSV par saison/culture/parcelle/récoltes ; import/
  restauration ; journal des modifications (« créé le 25/06 : 2,4 kg ; corrigé le 26/06 : 2,1 kg,
  raison : erreur de pesée »).
- **Note** : un export JSON minimal est tiré en avant dès **4a** pour protéger la migration.

### Bloc final : analyse, hypothèses, apprentissage (EN DERNIER)
- **Objectif** : proposer des hypothèses avec niveau de confiance, jamais des certitudes.
- **Fonctions** : face à un problème, lister les hypothèses (stress thermique/hydrique,
  fertilisation, racinaire, pollinisation, maladie) avec les indices qui les soutiennent (météo,
  actions récentes, photos), ce qu'il faut vérifier, et un niveau de confiance faible/moyen/élevé ;
  suivi de décision (problème → hypothèse → action → résultat → conclusion pour l'an prochain).
- **Pourquoi en dernier** : la qualité de l'analyse dépend de la richesse de l'historique produit
  par tous les blocs précédents.

## 6. Risques transverses

- **Migration de données réelles** : Mathieu a déjà saisi son vrai jardin. Chaque migration Dexie
  doit être testée et réversible (export JSON avant migration).
- **Dépendance réseau (météo)** : première dépendance externe non optionnelle. Tout doit dégrader
  proprement hors-ligne.
- **Sur-ingénierie de l'IA** : risque de salir l'historique avec des interprétations fausses. Le
  sas de validation (déjà là) et les statuts brouillon/validé sont la parade. L'IA propose, jamais
  elle n'écrit en dur.
- **Friction de saisie** : si saisir devient lourd, Mathieu n'utilisera plus l'outil. La saisie
  vocale + préremplissage reste la voie royale ; tout nouveau champ doit rester optionnel.

## 7. À prévoir dès 4a pour ne pas tout refaire

1. La **variété-entité** et le `varietyId` sur le journal et les cultures (rétrofit douloureux
   sinon).
2. Le **snapshot météo** comme champ d'entrée (même si 4b le remplit seulement plus tard, le
   champ doit exister tôt pour ne pas re-migrer).
3. Le **statut** et la **phrase d'origine** sur l'entrée.
4. Un **export JSON** de secours, pour sécuriser toutes les migrations suivantes.

## 8. Méthode

Méthode des paliers déjà éprouvée : un bloc à la fois, je code, je vérifie (build + lint + tests +
preuve navigateur), je montre, Mathieu valide, on merge, on enchaîne. Jamais de gros livrable d'un
coup. Implémentation du **bloc 4a en premier**.
