# Palier 3b-2a : fondations Réglages + client Gemini

Date : 2026-06-25
Statut : validé (brainstorming), prêt pour plan d'implémentation

## Contexte

Le palier 3b a été scindé. 3b-1 (recherche journal + photos, 100% local) est livré et
mergé. 3b-2 introduit la voix par Gemini, ce qui suppose trois ruptures par rapport au
modèle 100% local des paliers 1 à 3 : un premier appel réseau sortant, une clé API à
stocker, une page Réglages réelle pour la saisir.

Pour ne pas empiler architecture neuve et logique vocale dans un même palier, 3b-2 est
lui-même scindé :

- **3b-2a (ce document)** : les fondations. Page Réglages réelle, clé Gemini stockée sur
  l'appareil, couche réseau minimale testable avec un bouton « Tester la connexion ». Aucune
  voix, aucun micro.
- **3b-2b (à brainstormer séparément)** : la voix. Capture micro, transcription, parsing de
  la commande parlée par Gemini, préremplissage du formulaire de saisie.

## Décisions verrouillées (brainstorming)

- **Scission 2a puis 2b** : 2a pose les fondations testables, 2b construit la voix dessus.
- **Clé sur l'appareil, appel direct** : la clé Gemini est stockée localement (IndexedDB,
  via `AppSettings`), et la PWA appelle l'API Google directement, sans relais Tailscale. Choix
  assumé car l'appareil cible est mono-utilisateur et personnel (Honor Magic 7 Pro de
  Mathieu). Le relais permanent avait justement été retiré du périmètre en V2.
- **Bouton « Tester la connexion »** dans Réglages : prouve la couche réseau de bout en bout
  dès 2a, avant toute logique vocale.
- **Réglages = le minimum utile maintenant** : localisation (nom + GPS), niveau IA, clé
  Gemini. Les seuils (gel, pluie, chaleur), le débit d'arrosage et la capacité des cuves sont
  reportés aux paliers 5/6 (YAGNI).

## État existant utile

- `AppSettings` (dans `src/data/model.ts`) porte déjà : `locationName`, `latitude`,
  `longitude`, `aiLevel` ('aucune' | 'photo' | 'photo_assistant'), plus les seuils et
  capacités non touchés ici. Il manque un champ pour la clé Gemini.
- `settingsService.ts` expose `DEFAULT_SETTINGS`, `getSettings()` et `saveSettings(settings)`
  sur le singleton `id=1`. `getSettings()` renvoie la **référence partagée** `DEFAULT_SETTINGS`
  quand la base est vide : un formulaire qui muterait l'objet corromprait la valeur par
  défaut. Suivi ouvert depuis le palier 2, à corriger ici car la page Réglages va justement
  charger puis modifier ces valeurs.
- `SettingsPage.tsx` est aujourd'hui un `PlaceholderPage` : à remplacer par un vrai
  formulaire.
- `aiLevel` existe dans le modèle mais n'est consommé nulle part : la page Réglages devient le
  premier endroit où il est édité.
- Aucune couche réseau, aucun champ clé, aucun `fetch` n'existe encore dans le code.
  `import.meta.env` n'est utilisé que dans `main.tsx` pour le service worker en dev.

## Architecture

Trois unités isolées, dépendances dans un seul sens, aucune ne dépend de la voix :

```
settingsService (données)  <--  SettingsPage (UI)  -->  geminiService (réseau)
```

- `settingsService` : déjà existant, on ajoute le champ clé et on corrige la copie.
- `geminiService` : neuf, pur, sans état, le `fetch` est mockable en test.
- `SettingsPage` : câble les deux, ne contient aucune logique réseau ni de persistance propre.

## Unité 1 : données (modèle + settingsService)

### Comportement

- `model.ts` : ajouter `geminiApiKey?: string` à l'interface `AppSettings` (optionnel, absent
  par défaut, donc clé vide tant que Mathieu ne l'a pas saisie).
- `settingsService.ts` :
  - `getSettings()` renvoie une **copie** `{ ...DEFAULT_SETTINGS }` quand la base est vide,
    pour qu'aucun consommateur ne puisse muter la référence partagée. (Correction du suivi
    ouvert depuis le palier 2.)
  - `saveSettings(settings)` inchangé dans sa logique : il persiste l'objet complet sur
    `id=1`. Comme `geminiApiKey` fait désormais partie du type `AppSettings`, il est persisté
    naturellement, sans code spécifique.
  - `DEFAULT_SETTINGS` n'inclut pas `geminiApiKey` (champ optionnel, vide par défaut).

### Tests

- `getSettings()` sur base vide renvoie une copie : muter le résultat ne change pas
  `DEFAULT_SETTINGS` ni un second appel à `getSettings()`.
- Round-trip : `saveSettings` avec un `geminiApiKey` renseigné, puis `getSettings` le relit
  identique.
- `getSettings()` après `saveSettings` renvoie bien les valeurs stockées et non les valeurs
  par défaut.

## Unité 2 : client réseau (geminiService.ts, neuf)

### Comportement

- Constante `GEMINI_MODEL` = un modèle gratuit du palier (`gemini-2.0-flash`), isolée en haut
  de fichier pour être changée en une ligne.
- `callGemini(prompt: string, apiKey: string): Promise<string>` :
  - POST sur
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    corps `{ contents: [{ parts: [{ text: prompt }] }] }`, en-tête JSON.
  - En cas de réponse HTTP en erreur (4xx/5xx), lève une erreur portant un message lisible
    (statut + message d'API si présent).
  - En cas de succès, extrait et renvoie le texte de la première réponse
    (`candidates[0].content.parts[0].text`).
  - La clé n'est jamais journalisée. Aucune clé en dur.
- `testGeminiConnection(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }>` :
  - Enveloppe `callGemini` avec un mini-prompt neutre (ex. « Réponds OK »).
  - Capte toute erreur (clé invalide, réseau coupé, quota) et renvoie
    `{ ok: false, error }` avec un message lisible plutôt que de lever.
  - Succès renvoie `{ ok: true }`.
  - C'est l'unique brique réseau que 3b-2b réutilisera (le parsing vocal appellera
    `callGemini`).

### Tests (fetch mocké, aucun appel réseau réel)

- `callGemini` : sur une réponse mock valide, renvoie le texte extrait de la structure Gemini.
- `callGemini` : sur une réponse HTTP en erreur (ex. 400 clé invalide), lève une erreur au
  message lisible.
- `testGeminiConnection` : réponse valide → `{ ok: true }`.
- `testGeminiConnection` : `fetch` qui rejette (réseau) ou réponse en erreur → `{ ok: false,
  error }` non vide, sans lever.
- Vérifie que l'URL appelée contient bien `GEMINI_MODEL` et la clé passée.

## Unité 3 : page Réglages (SettingsPage.tsx, réécrite)

### Comportement

- Remplace le `PlaceholderPage` par un vrai formulaire, dans le style existant (mêmes classes
  Tailwind `green-*`, mêmes patterns de `label`/`input` que `QuickAddPage`).
- Charge les valeurs initiales via `getSettings()` (ou `useLiveQuery` sur le singleton).
- Champs éditables :
  - **Nom du lieu** (`locationName`, texte).
  - **Latitude** et **Longitude** (`latitude`, `longitude`, numériques).
  - **Niveau IA** (`aiLevel`, select : Aucune / Photo / Photo + assistant).
  - **Clé Gemini** (`geminiApiKey`, champ `type="password"`, masqué, avec libellé indiquant
    qu'elle reste sur l'appareil).
- Bouton **Enregistrer** : appelle `saveSettings` avec l'objet complet, affiche une
  confirmation brève.
- Bouton **« Tester la connexion »** : appelle `testGeminiConnection(geminiApiKey)` avec la
  valeur courante du champ, gère un état `idle | test_en_cours | ok | erreur`, affiche
  « Connexion OK » en succès ou le message d'erreur retourné. Le test utilise la valeur saisie,
  même non encore enregistrée, pour pouvoir valider une clé avant de l'enregistrer.
- Les seuils, le débit et les cuves ne sont **pas** affichés (paliers 5/6).

### Tests

- Au montage, le formulaire affiche les valeurs renvoyées par `getSettings` (service mocké ou
  base seedée).
- Modifier un champ puis Enregistrer appelle `saveSettings` avec la valeur modifiée (et la
  persiste : relecture cohérente).
- Le bouton « Tester la connexion » appelle `testGeminiConnection` (mocké) avec la clé du champ
  et affiche le statut de succès puis, sur un mock d'échec, le message d'erreur.

## Hors périmètre

- Toute la voix (micro, transcription, parsing, préremplissage) → palier 3b-2b.
- Diagnostic IA sur photo (vision Gemini) → paliers diagnostic ultérieurs.
- Seuils du moteur de reco, débit d'arrosage, capacité des cuves, export/import JSON →
  paliers 5/6.
- Relais Tailscale → écarté (appel direct retenu).

## Critères de réussite

- La page Réglages charge les valeurs réelles, permet d'éditer localisation, niveau IA et clé
  Gemini, et persiste après rechargement.
- Le bouton « Tester la connexion » prouve la couche réseau de bout en bout : une clé valide
  affiche « Connexion OK », une clé invalide ou un réseau coupé affiche un message d'erreur
  propre, sans planter l'app.
- La clé Gemini est stockée sur l'appareil (IndexedDB) et jamais journalisée.
- `getSettings()` ne renvoie plus la référence partagée `DEFAULT_SETTINGS` (suivi du palier 2
  clos).
- Suite de tests verte, build et lint OK. Vérification navigateur sur le parcours Réglages
  (édition + persistance + test avec une clé bidon donnant une erreur propre). Le test avec la
  vraie clé reste à la main de Mathieu : je ne manipule pas son secret.
