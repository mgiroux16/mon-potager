# Bloc final : analyse à hypothèses IA (diagnostic)

Date : 2026-06-28
Statut : design validé, prêt pour le plan d'implémentation.

## 1. Objectif

Face à un problème noté dans le journal (entrée `probleme`), proposer des hypothèses
plausibles (stress thermique/hydrique, fertilisation, maladie, ravageur, pollinisation...) avec
les indices qui les soutiennent et un niveau de confiance, jamais une certitude. Mathieu choisit
lui-même l'action à mener, observe le résultat, et conclut pour l'année suivante. C'est le
dernier bloc de la roadmap palier 4 (D7 : vient en dernier, sur un historique déjà riche). Après
ce bloc restent 4h (export/import/sauvegarde) puis 4g (verger détaillé), dans cet ordre choisi
par Mathieu.

## 2. Déclenchement

- **Automatique mais pas silencieux** : dès qu'une entrée `probleme` est validée, un bloc
  "Analyse" apparaît sous l'entrée dans le journal, avec un bouton "Diagnostiquer". L'appel à
  Gemini ne part jamais sans action explicite de Mathieu (maîtrise du quota et du timing).
- **Manuel** : depuis la nouvelle page `/diagnostics`, possibilité de relancer une analyse sur
  n'importe quelle entrée `probleme` passée qui n'en a pas encore.

## 3. Contexte envoyé à Gemini

Pour la culture/parcelle/arbre concerné :
- météo : snapshot figé de l'entrée problème + cumuls 14 jours (réutilise `weatherService`,
  déjà capable de calculer cumuls pluie/température sur une fenêtre) ;
- actions et observations des 14 derniers jours sur la même culture/parcelle (lues dans
  `GardenLogEntry`) ;
- historique des saisons précédentes sur la même culture ou variété : bilans qualitatifs
  (`seasonNotesService`) et diagnostics déjà clos portant sur la même culture/variété ;
- le texte d'origine du problème (`sourcePhrase` ou texte de l'entrée).

Réponse attendue de Gemini, structurée : liste d'hypothèses, chacune avec un texte, les indices
qui la soutiennent (extraits du contexte envoyé), et un niveau de confiance `faible|moyen|eleve`.
Pattern de service repris de `geminiService.ts` (clé sur l'appareil, repli propre si absente ou
hors-ligne) : nouveau prompt dédié, pas de nouveau service IA séparé.

## 4. Nouvelle entité `Diagnostic`

Migration Dexie `version(4)` (suit la migration `version(3)` des `seasonNotes`).

```
Diagnostic {
  id?
  problemEntryId        // lien vers la GardenLogEntry de type 'probleme'
  cropId?                // selon le contexte de l'entrée problème
  parcelId?
  treeId?
  createdAt              // epoch ms
  hypotheses: {
    text: string
    indices: string
    confidence: 'faible' | 'moyen' | 'eleve'
  }[]
  chosenAction?: string   // texte libre, rempli par Mathieu
  result?: string         // texte libre
  conclusion?: string     // texte libre, pour l'an prochain
  status: 'ouvert' | 'clos'   // passe a 'clos' des que result ET conclusion sont remplis
}
```

Un seul `Diagnostic` par `problemEntryId` (pas de ré-analyse multiple sur la même entrée ; un
nouveau bouton "Diagnostiquer" sur une entrée déjà diagnostiquée ouvre le diagnostic existant
plutôt que d'en créer un second).

## 5. Écran `/diagnostics`

Nouvelle page, lien depuis la navigation. Liste des diagnostics, ouverts en premier puis clos
(tri par date de création décroissante dans chaque groupe). Chaque carte affiche :
- le texte du problème d'origine et la culture/parcelle/arbre concerné ;
- les hypothèses, chacune avec son badge de confiance (faible/moyen/élevé) et ses indices ;
- trois champs en édition inline (pattern déjà utilisé pour `CropPrice` et les notes de saison,
  save au blur) : action choisie, résultat observé, conclusion. Le statut passe automatiquement à
  `clos` dès que résultat et conclusion sont non vides.

Pas de relance automatique (type `reminderService`) sur les diagnostics restés ouverts : décision
explicite de Mathieu, un rappel manuel suffit, il revient sur `/diagnostics` quand il veut.

## 6. Gestion des erreurs

Si l'appel Gemini échoue (pas de clé configurée, hors-ligne, quota dépassé, réponse non
structurée) : message d'erreur clair affiché à la place des hypothèses, le bouton
"Diagnostiquer" reste disponible pour réessayer. Aucun `Diagnostic` n'est créé en base si l'appel
échoue (pas de diagnostic vide ou partiel persistant).

## 7. Garde-fous

- L'IA ne crée jamais de `Diagnostic` sans action explicite de Mathieu.
- L'IA ne modifie jamais le journal (`GardenLogEntry`) ni aucune autre table existante.
- Chaque hypothèse reste un texte affiché sur le `Diagnostic` ; aucune hypothèse n'est jamais
  injectée comme fait dans une autre partie de l'application (cultures, bilans, rappels).

## 8. Hors périmètre (YAGNI)

- Pas de suggestions d'action par Gemini : Mathieu écrit lui-même l'action choisie, en texte
  libre.
- Pas de relance automatique sur les diagnostics ouverts.
- Pas de score de réussite chiffré sur les diagnostics clos (texte libre uniquement, cohérent
  avec la décision déjà prise sur les bilans de saison qualitatifs en 4E-2).

## 9. Risques

- **Qualité de réponse Gemini** : dépend de la richesse du contexte assemblé ; le contexte
  inclut explicitement l'historique multi-saisons pour limiter les hypothèses génériques.
- **Coût/latence** : un appel Gemini par diagnostic demandé, jamais en arrière-plan ; cohérent
  avec le pattern déjà accepté pour la saisie vocale.
- **Migration Dexie** : nouvelle table sur une base avec données réelles ; suivre le même
  pattern que les migrations précédentes (version bump, pas de table rase), et mettre à jour les
  tests qui figent en dur le nombre de tables ou la version exportée (effet de bord déjà rencontré
  en 4E-2).
