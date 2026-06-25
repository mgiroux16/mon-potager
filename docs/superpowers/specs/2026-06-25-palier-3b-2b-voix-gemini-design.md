# Palier 3b-2b : la voix Gemini

Date : 2026-06-25
Statut : validé (brainstorming), prêt pour plan d'implémentation

## Contexte

3b-2a a posé les fondations : page Réglages réelle, clé Gemini stockée sur l'appareil, et la
couche réseau `geminiService` (`callGemini`, `testGeminiConnection`) prouvée de bout en bout par
le bouton « Tester la connexion ». 3b-2b construit la voix par-dessus, sans rien réarchitecturer.

Objectif : appuyer sur un micro, parler une phrase de jardin, et obtenir le formulaire de saisie
déjà rempli (type, mesures, parcelle, culture), à valider d'un geste. La transcription reste
100 % gratuite (navigateur), Gemini n'intervient que pour ranger la phrase en entrée structurée.

## Décisions verrouillées (brainstorming)

- **Transcription par Web Speech (navigateur)**, pas par Gemini audio. Gratuit, zéro coût API,
  excellent sur Chrome Android (appareil cible : Honor Magic 7 Pro). Le texte transcrit part
  ensuite à `callGemini` (déjà posé en 3b-2a). On garde le « 100 % gratuit sauf parsing ».
- **Gemini relie la cible parlée à l'élément exact de la base** (option « matching »). On lui
  fournit la liste des parcelles / cultures / oyas / arbres (nom → id) ; il renvoie le bon
  `parcelId` / `cropId` déjà sélectionné. Sûr parce que Mathieu organise ses parcelles en noms
  courts et distincts (A, B, C…), stables, alors que les cultures bougent. Une entrée peut porter
  **à la fois** une parcelle ET une culture (le modèle a `parcelId` et `cropId`).
- **Bouton micro flottant global**, présent sur toutes les pages (bas-droite, au-dessus de la
  barre de navigation). Accessible partout, pas seulement depuis la saisie rapide.
- **Confirmation = réutiliser le formulaire de saisie existant** (approche A). Après le rangement,
  l'app amène sur `/ajouter` avec le formulaire prérempli. Une seule source de vérité pour éditer
  et valider, aucune UI de validation dupliquée. Conforme au spec 3b-2a (« préremplissage du
  formulaire de saisie »).
- **Dégradé gracieux sans clé** : le micro est toujours présent. Avec clé → transcription +
  rangement Gemini complet. Sans clé → transcription seule, la phrase brute va dans le champ
  Description, le type est choisi à la main. La voix marche toujours, juste moins magique.
- **Rien n'est jamais enregistré sans le clic Valider de Mathieu.** La voix ne fait que
  pré-remplir.

## État existant utile

- `geminiService.ts` : `callGemini(prompt, apiKey)` (texte → texte, lève une erreur lisible sur
  HTTP en erreur) et `testGeminiConnection`. C'est l'unique brique réseau, réutilisée telle quelle.
- `settingsService.ts` : `getSettings()` renvoie une copie ; `AppSettings.geminiApiKey?` et
  `aiLevel` ('aucune' | 'photo' | 'photo_assistant') sont en place.
- `model.ts` : `GardenLogEntry` porte `type`, `date`, `time?`, `title?`, `description?`,
  `parcelId?`, `cropId?`, `oyaId?`, `treeId?`, `volumeLiters?`, `rainMm?`, `quantityKg?`,
  `photoUrls?`. `LogEntryType` est l'union fermée des 15 types.
- `logService.ts` : `addLogEntry(entry: NewLogEntry)` (génère id + createdAt). C'est le seul point
  d'écriture du journal — la voix ne l'appelle pas directement, elle passe par le formulaire.
- `QuickAddPage.tsx` : `EntryForm` est piloté par un `FormConfig` (type + target + measure) et
  initialise son état local en interne. Aujourd'hui il ne prend pas de valeurs initiales, et un
  arrosage n'expose qu'une cible parcelle (pas parcelle + culture en même temps).
- `Layout.tsx` : barre de navigation fixe en bas avec un bouton central « Ajouter » déjà mis en
  avant. Le micro flottant doit cohabiter sans gêner cette barre (bas-droite, au-dessus d'elle).
- `App.tsx` : routage react-router (`BrowserRouter`), route `/ajouter` → `QuickAddPage`. Le
  passage du brouillon se fera par le `state` du router (pas de store global neuf).
- Données utiles au catalogue : `db.parcels`, `db.crops`, `db.oyas`, `db.trees` (tous avec
  `id?` + `name`).

## Architecture

Quatre unités isolées, dépendances dans un seul sens :

```
speechService (navigateur)
        |
        v
VoiceCapture (UI globale, dans Layout)
   |                         |
   v                         v
voiceParseService       geminiService.callGemini (existant)
   |
   v
router state  -->  QuickAddPage / EntryForm (préremplis)
```

- `speechService` : encapsule l'API Web Speech, dépend du navigateur, surface minimale.
- `voiceParseService` : pur, sans état, sans réseau — construit le prompt et valide le JSON
  renvoyé. C'est le cœur testable.
- `VoiceCapture` : orchestre (écoute → si clé : `callGemini` + parse → navigation préremplie).
- `QuickAddPage` / `EntryForm` : acceptent un brouillon initial et s'ouvrent préremplis.

## Unité 1 : speechService.ts (neuf)

### Comportement

- `isSpeechSupported(): boolean` : vrai si `SpeechRecognition` ou `webkitSpeechRecognition`
  existe sur `window`.
- `createSpeechSession(handlers): SpeechSession` : démarre la reconnaissance en français
  (`lang = 'fr-FR'`, `interimResults = true` pour l'affichage en direct), expose `stop()`, et
  appelle les handlers `onInterim(text)`, `onFinal(text)`, `onError(reason)`.
- `reason` d'erreur normalisée en valeurs lisibles : micro refusé, aucun son capté, non
  supporté, autre. Aucune dépendance à React ici.
- Aucune clé, aucun réseau dans cette unité.

### Tests

- `isSpeechSupported` renvoie faux quand l'API est absente de `window`, vrai quand un mock est
  présent. (Le pilotage live de la reco navigateur n'est pas testé unitairement : il dépend d'une
  API non simulable proprement sous jsdom. Garde légère assumée.)

## Unité 2 : voiceParseService.ts (neuf, cœur testable)

### Comportement

- Type `GardenCatalog` : listes `{ id, name }` de parcelles, cultures, oyas, arbres, telles que
  lues depuis Dexie au moment de la dictée.
- `buildVoicePrompt(transcript: string, catalog: GardenCatalog, todayISO: string): string` :
  produit un prompt qui contient :
  - la phrase transcrite,
  - la liste des types valides (`LogEntryType`),
  - le catalogue parcelles / cultures / oyas / arbres (nom → id),
  - la date du jour (pour résoudre « ce matin », « hier »),
  - la consigne de répondre **uniquement** un objet JSON, avec les seuls champs reconnus, en
    n'utilisant que des ids présents dans le catalogue, et en omettant ce qui n'est pas dit.
- `parseVoiceDraft(geminiText: string, catalog: GardenCatalog): VoiceDraft` :
  - extrait le JSON même s'il est entouré de texte ou d'un bloc ```` ```json ```` (tolérant).
  - valide défensivement : ne garde que les champs connus de `NewLogEntry` ; `type` doit
    appartenir à `LogEntryType` (sinon `note` par défaut) ; les nombres sont coercés/ignorés s'ils
    ne sont pas numériques ; **tout id (`parcelId`, `cropId`, `oyaId`, `treeId`) absent du
    catalogue est rejeté** (cible laissée vide).
  - en cas de JSON introuvable ou cassé : renvoie un brouillon de repli `{ type: 'note',
    description: transcript }` (fallback géré ici, pas par l'appelant) avec un drapeau
    `parsed: false`.
  - `VoiceDraft` = `{ draft: NewLogEntry; parsed: boolean }`.

### Tests (aucun réseau, callGemini non appelé ici)

- `buildVoicePrompt` : le prompt contient bien la phrase, tous les types valides, les noms+ids du
  catalogue et la date du jour.
- `parseVoiceDraft` : JSON propre → brouillon correct (type, volume, parcelId, cropId).
- `parseVoiceDraft` : JSON entouré de texte / dans un bloc markdown → extrait quand même.
- `parseVoiceDraft` : champ inconnu dans le JSON → ignoré ; `type` invalide → `note`.
- `parseVoiceDraft` : id inexistant dans le catalogue → champ cible rejeté, reste conservé.
- `parseVoiceDraft` : JSON cassé / absent → repli `{ type: 'note', description: transcript,
  parsed: false }`.

## Unité 3 : VoiceCapture.tsx (neuf, monté dans Layout)

### Comportement

- Bouton micro flottant (bas-droite, au-dessus de la barre de nav, `aria-label="Dicter une
  entrée"`). Masqué si `isSpeechSupported()` est faux.
- À l'appui : ouvre un overlay « J'écoute… », démarre une session via `speechService`, affiche la
  transcription en direct (interim + final).
- À l'arrêt :
  - **Avec clé Gemini** (`getSettings().geminiApiKey` non vide) : état « Je range… », lit le
    catalogue (`db.parcels/crops/oyas/trees`), `buildVoicePrompt` → `callGemini` →
    `parseVoiceDraft`. Si `callGemini` lève ou si `parsed: false`, on retombe sur le brouillon de
    repli (phrase brute en Description).
  - **Sans clé** : pas d'appel Gemini, brouillon direct `{ type: 'note', description: transcript }`.
  - Dans tous les cas, `navigate('/ajouter', { state: { voiceDraft } })` puis ferme l'overlay.
- Erreurs micro (refus, silence) → message court dans l'overlay, pas de navigation.
- Le `aiLevel` ne **bloque pas** la voix : la voix est un usage texte distinct du diagnostic
  photo. La seule condition du rangement Gemini est la présence d'une clé.

### Tests (RTL léger)

- Le bouton n'est pas rendu quand `isSpeechSupported` est faux (mock).
- Le bouton est rendu et ouvre l'overlay quand supporté. (Le cycle complet écoute → Gemini →
  navigation s'appuie sur des mocks de `speechService` et `callGemini` ; couverture légère, le
  gros de la logique vit dans `voiceParseService` testé à fond.)

## Unité 4 : QuickAddPage / EntryForm (refactor ciblé)

### Comportement

- `QuickAddPage` lit `location.state.voiceDraft` au montage. S'il existe, elle ouvre directement
  `EntryForm` sur la config correspondant au `type` du brouillon, prérempli, sans passer par la
  grille. (On nettoie le state après lecture pour qu'un retour arrière ne ré-ouvre pas le
  brouillon.)
- `EntryForm` accepte des **valeurs initiales** optionnelles (date, time, parcelId, cropId, oyaId,
  treeId, volume, quantity, title, description) et initialise son état local avec.
- `EntryForm` sait afficher **parcelle ET culture en même temps** quand le brouillon contient les
  deux (cas « tomates sur parcelle A » pour un arrosage). Concrètement : le rendu des sélecteurs
  de cible ne dépend plus uniquement d'un `target` unique ; un champ cible est affiché dès que le
  brouillon (ou la config) le concerne. La saisie manuelle classique reste inchangée pour les
  entrées sans brouillon.
- Aucune écriture directe : la validation passe toujours par `addLogEntry` via le `handleSubmit`
  existant.

### Tests

- `QuickAddPage` montée avec un `voiceDraft` en router state ouvre `EntryForm` prérempli (type +
  champs visibles avec les bonnes valeurs).
- `EntryForm` avec valeurs initiales affiche ces valeurs et, à la validation, appelle
  `addLogEntry` avec parcelId **et** cropId quand les deux sont fournis.
- Comportement sans brouillon : la grille de saisie rapide et la saisie manuelle restent
  identiques (non-régression).

## Hors périmètre (3b-2b)

- Lecture vocale des réponses (text-to-speech).
- Commandes multi-entrées en une seule phrase (« j'ai arrosé A et récolté des tomates »).
- Bouton micro contextuel par page (pré-réglé sur un type).
- Diagnostic IA sur photo (vision Gemini) → paliers diagnostic ultérieurs.
- Dashboard et module Réserve d'eau → palier 4.

## Critères de réussite

- Depuis n'importe quelle page, le micro flottant capte la parole et affiche la transcription en
  direct (sur navigateur compatible ; masqué sinon).
- Avec une clé Gemini valide : « j'ai arrosé dix litres sur la parcelle A ce matin » ouvre le
  formulaire prérempli (type Arrosage, volume 10, heure ~matin, parcelle A sélectionnée) ; si la
  phrase nomme aussi une culture, elle est préremplie en plus. Mathieu vérifie et valide.
- Sans clé : la même dictée ouvre le formulaire avec la phrase brute en Description, type à
  choisir. Aucune perte des mots dits.
- Échec Gemini (réseau, JSON cassé, id inconnu) : dégradé propre, jamais de plantage, jamais
  d'enregistrement automatique.
- Aucun id inexistant n'est jamais injecté dans une entrée.
- Suite de tests verte, **`npm run build` (tsc -b) ET `npm test`** au vert (leçon 3b-2a : Vitest
  ne type-check pas), lint OK. Vérification navigateur du parcours dictée → formulaire prérempli
  → validation (avec une clé bidon pour prouver le dégradé ; le test avec la vraie clé reste à la
  main de Mathieu, je ne manipule pas son secret).
