# 4g-2 : maladies/traitements avec photo, qualité récolte, galerie photo arbre

## Contexte

4g-1 (fiche arbre `TreeCard`, bilan récolte/alternance) est mergé sur main (commit `8683938`). 4g-2 clôt le palier 4g (verger détaillé), dernier palier de la roadmap initiale du palier 4 (carnet de culture).

Trois sous-fonctionnalités, traitées dans ce même design car elles partagent l'infrastructure existante (logs datés, `seasonNotes`, diagnostic IA) :

1. Diagnostic IA avec photo + suggestions de traitement
2. Note de qualité de récolte par année, sur la fiche arbre
3. Galerie photo historique de l'arbre

## Décisions de scope

- Pas de nouvelle table Dexie, donc pas de migration ni de bump de `db.verno`.
- S'applique au jardin et au verger de façon identique (pas de mécanisme spécifique aux arbres pour le diagnostic).
- Gemini propose des solutions concrètes pour ce palier : c'est un changement assumé par rapport à la décision initiale du bloc IA ("pas de suggestion d'action par l'IA"). La décision/saisie de `chosenAction`/`result`/`conclusion` reste entièrement manuelle, Gemini ne fait que suggérer.

## 1. Diagnostic IA avec photo

### Modèle de données

`Diagnostic.hypotheses[]` (dans `src/data/model.ts`) : ajout d'un champ optionnel `suggestedTreatment?: string` par hypothèse. Champ optionnel et tolérant au parsing : si Gemini omet le champ pour une hypothèse donnée, elle reste valide.

### Service Gemini vision

Nouvelle fonction `callGeminiVision(prompt: string, imageDataUrl: string, apiKey: string)` dans `src/services/geminiService.ts`, sur le modèle de `callGeminiAudio` : extraction du base64 depuis le data URL JPEG (format produit par `compressImage`), envoi en `inlineData` via l'infrastructure `GeminiPart`/`postGemini()` déjà existante (pas de nouvelle fonction bas niveau nécessaire, juste un wrapper).

### Déclenchement

Dans `src/services/diagnosticService.ts`, `buildDiagnosticPrompt` est étendu pour demander, en plus du JSON `{text, indices, confidence}` actuel, un champ `suggestedTreatment` par hypothèse (piste de traitement concrète liée à cette hypothèse précise).

Le bouton "Diagnostiquer" (dans `src/pages/JournalPage.tsx`) reste inchangé côté UI déclenchante : si l'entrée `probleme` source a `photoUrls.length > 0`, la première photo (`photoUrls[0]`) est automatiquement envoyée à Gemini en plus du contexte texte (météo 14j, historique multi-saisons). Pas de case à cocher, pas de choix de photo : c'est transparent et utilise `callGeminiVision` au lieu de `callGemini` uniquement quand une photo est présente, sinon le chemin texte existant reste utilisé tel quel.

`parseDiagnosticResponse` (dans `diagnosticService.ts`) est étendu pour lire `suggestedTreatment` (string optionnelle) sans le rendre obligatoire.

### UI

`src/pages/DiagnosticsPage.tsx` affiche `suggestedTreatment` sous le texte de chaque hypothèse, à titre indicatif uniquement (pas de bouton "appliquer" ni de pré-remplissage automatique du champ `chosenAction`). Le formulaire de clôture (`OutcomeFields` : `chosenAction`/`result`/`conclusion`) reste entièrement manuel, inchangé.

## 2. Qualité de récolte par année (fiche arbre)

### Modèle de données

`seasonNotes` (table Dexie existante depuis 4E-2, schéma `{id, year, cropId?, parcelId?, text}`) : ajout d'un champ optionnel `treeId?: string`. Pas de migration nécessaire (Dexie ne valide pas les champs absents sur les enregistrements existants, et c'est un ajout de champ optionnel sur une table déjà versionnée, pas une nouvelle table).

### Service

`src/services/seasonNotesService.ts` : ajout de `getTreeNote(notes, year, treeId)` et `setTreeNote(year, treeId, text)`, sur le modèle exact de `getCropNote`/`setCropNote` (lecture pure sur tableau déjà chargé, upsert asynchrone, suppression de la note si le texte redevient vide).

### UI

Dans l'accordion de `src/components/TreeCard.tsx` : champ "Qualité de récolte" en `<textarea>`, save au blur (pattern `CropPrice`/notes de saison), avec un sélecteur d'année identique à celui de `SeasonSummaryPage.tsx` pour permettre de comparer les années. Affiché sur la fiche arbre elle-même (pas seulement dans le bilan de saison global), à côté du bilan récolte/alternance déjà présent depuis 4g-1.

## 3. Galerie photo historique de l'arbre

### Modèle de données

Aucun changement. `GardenLogEntry.photoUrls?: string[]` et `GardenLogEntry.treeId` existent déjà (4g-1 et antérieur) et portent déjà une date obligatoire (`GardenLogEntry.date`).

### UI

Nouvelle section dans l'accordion de `TreeCard.tsx` : liste des `GardenLogEntry` filtrés sur ce `treeId` ayant au moins une photo (`photoUrls.length > 0`), triés par date décroissante, affichant la miniature (première photo de chaque entrée) et la date. Pas de formulaire dédié : l'ajout de photo se fait en attachant une photo à n'importe quelle entrée de journal liée à l'arbre.

Vérification à faire en implémentation : confirmer que `src/pages/QuickAddPage.tsx` expose bien le champ d'ajout de photo pour la cible `TargetKind: 'arbre'` (ajoutée en 4g-1 pour `floraison`/`nouaison`/`chute_fruits`/`observation`). Si l'attachement de photo n'est pas encore exposé pour cette cible, l'ajouter sans changer le mécanisme `compressImage` existant.

## Hors scope (confirmé, pas dans ce palier)

- Pas d'indicateur automatique de qualité (texte libre uniquement, cohérent avec la décision du bilan qualitatif 4E-2).
- Pas de bouton "appliquer le traitement suggéré" qui pré-remplirait `chosenAction` : la saisie de l'action choisie reste 100% manuelle.
- Pas de champ structuré pour la maladie (liste déroulante, gravité) : le texte libre des hypothèses + suggestion de traitement suffit.

## Tests

- `geminiService.test.ts` : nouveau test pour `callGeminiVision` (construction du `inlineData` depuis un data URL JPEG).
- `diagnosticService.test.ts` : `buildDiagnosticPrompt` inclut la demande de `suggestedTreatment` ; `parseDiagnosticResponse` accepte les hypothèses avec et sans ce champ.
- `seasonNotesService.test.ts` : `getTreeNote`/`setTreeNote` (cas présent, absent, suppression si texte vide).
- `TreeCard.test.tsx` : affichage de la note de qualité par année, affichage de la galerie photo triée par date, comportement si aucune photo.
- `DiagnosticsPage.test.tsx` : affichage de `suggestedTreatment` quand présent, absence d'affichage si non fourni par Gemini.

Pas de vérification visuelle en preview prévue pour les parties dépendant de l'auth Google (même limite que 4g-1, bloc IA, 4h) : tests automatisés + build + lint, comme déjà accepté par Mathieu sur les paliers précédents.
