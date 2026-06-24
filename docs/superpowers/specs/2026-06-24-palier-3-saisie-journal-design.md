# Palier 3 : Saisie rapide + journal filtrable

Spec validée le 2026-06-24. Sous-ensemble du design global
(`docs/specs/2026-06-24-mon-potager-design.md`, section 13, palier 3).

## 1. Périmètre

La ligne spec du palier 3 dit « Saisie rapide + vocale + journal filtrable + recherche ».
On la découpe pour garder un livrable petit, testable et conforme à la règle « jamais de gros
livrable d'un coup ».

**Dans ce palier :**
- Saisie rapide par tuiles d'action pour les types fréquents (capture en 2-3 gestes).
- Journal : liste de toutes les entrées, du plus récent au plus ancien, filtrable par type.

**Reporté au micro-palier 3b :**
- Saisie vocale (Web Speech API).
- Recherche plein texte dans le journal.
- Photos attachées aux entrées (gestion de fichiers/blobs, chantier propre).

On réutilise les services déjà codés et testés au palier 2 (`addLogEntry`, `listLog`,
`listLogByType`). Aucun nouveau store Dexie.

## 2. Écran « Saisie rapide » (`/ajouter`, QuickAddPage)

Grille de tuiles d'action. Cinq tuiles fréquentes plus une tuile « Autre… ».

Tuiles fréquentes et champs de leur mini-formulaire (tout au minimum utile) :

| Tuile | Type log | Cible | Mesure | Quand |
|-------|----------|-------|--------|-------|
| Arrosage | `arrosage` | parcelle (`parcelId`) | volume L (`volumeLiters`) | date+heure, défaut maintenant |
| Remplissage oya | `remplissage_oya` | oya (`oyaId`) | volume L (`volumeLiters`) | date+heure, défaut maintenant |
| Récolte | `recolte` | culture (`cropId`) | quantité kg (`quantityKg`) | date, défaut aujourd'hui |
| Observation | `observation` | élément optionnel | description (`description`) | date, défaut aujourd'hui |
| Problème | `probleme` | élément optionnel | description (`description`) | date, défaut aujourd'hui |

« Élément optionnel » = un sélecteur unique listant parcelles + cultures + arbres ; la sélection
remplit le bon identifiant (`parcelId` / `cropId` / `treeId`).

Tuile **« Autre… »** : ouvre un sélecteur des 10 types restants (`semis`, `plantation`,
`paillage`, `traitement`, `compost`, `taille`, `depense`, `diagnostic`, `releve_pluie`, `note`)
avec un formulaire générique : titre (`title`), description (`description`), date.

Validation : appelle `addLogEntry(...)`, confirmation visuelle (toast ou retour), retour à la
grille. Toute saisie est optionnelle sauf la mesure du type concerné quand elle a un sens
(volume pour arrosage, quantité pour récolte).

Approche écartée : un formulaire unique avec menu déroulant de type. Plus lent au pouce, moins
« 2-3 gestes ». Les tuiles gagnent.

## 3. Écran « Journal » (`/journal`, JournalPage)

- Liste de toutes les entrées via `listLog()` (déjà trié plus récent en haut).
- Chaque ligne : icône du type + libellé « Type · cible », ligne de détail (mesure ou
  description), date relative à droite.
- Barre de filtres par type (chips) : « Tout » plus un chip par type présent. Le filtre actif
  restreint la liste (`listLogByType` ou filtre en mémoire sur la liste déjà chargée).
- État vide : message « Rien encore, note ta première action » + lien vers `/ajouter`.
- Corriger l'étiquette périmée du placeholder actuel (« Palier 4 » → ce palier).

## 4. Architecture (respect des couches posées au palier 2)

Logique métier pure dans `services/`, aucune dépendance React, testable seule :

- `describeLogEntry(entry, refs): LogEntryView` où
  `LogRefs = { parcels, crops, oyas, trees }` (Maps par id) et
  `LogEntryView = { typeLabel, target?, detail? }`. Produit le libellé lisible d'une entrée à
  partir des objets liés. Gère l'absence de référence (cible non résolue → `target` indéfini).
- `formatLogDate(entry, now): string` : date relative lisible (« aujourd'hui 18:30 », « hier »,
  « il y a N j », sinon la date). Pure.

Les pages (`QuickAddPage`, `JournalPage`) ne font que du câblage : `useLiveQuery` pour lire la
base, formulaires pour écrire, mapping type → icône lucide local au composant. Zéro logique métier
dans les composants. Le mapping type → icône et type → libellé fréquent peut vivre dans un petit
module partagé (`logTypes.ts`) consommé par les deux pages.

## 5. Tests (TDD, Vitest + fake-indexeddb)

- `describeLogEntry` : un cas par type fréquent (typeLabel, target, detail corrects) ; un cas
  référence manquante (id pointant dans le vide → target indéfini, pas de crash).
- `formatLogDate` : aujourd'hui, hier, il y a N jours, date ancienne.
- QuickAddPage : taper une tuile, remplir, valider → l'entrée existe bien dans `db.log` avec le
  bon `type` et les bons champs.
- JournalPage : seed d'entrées variées → les entrées s'affichent ; activer un filtre de type
  masque les entrées des autres types.

## 6. Hors périmètre (rappel)

Saisie vocale, recherche plein texte, photos : micro-palier 3b. Tout ce qui touche à l'eau, la
météo, le calendrier, l'IA, le pilotage chiffré : paliers 4 et suivants, inchangés.
