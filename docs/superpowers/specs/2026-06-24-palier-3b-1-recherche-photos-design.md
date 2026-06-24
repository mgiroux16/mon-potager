# Palier 3b-1 : recherche dans le journal + photos

Date : 2026-06-24
Statut : validé (brainstorming), prêt pour plan d'implémentation

## Contexte

Le palier 3 a livré la saisie rapide par tuiles et le journal filtrable par type.
Trois fonctions avaient été reportées en 3b : saisie vocale, recherche, photos.

Décision de découpage : la saisie vocale passe par Gemini (choix de Mathieu), ce qui
introduit le premier appel réseau sortant, une clé API et la dépendance Web Speech.
C'est une rupture du modèle 100% local des paliers 1 à 3. Recherche et photos, elles,
restent entièrement locales, sans clé ni réseau.

Pour ne pas mélanger du quick-win local avec de l'architecture neuve dans un même palier
(coût et risque de reprise plus élevés), le palier 3b est scindé :

- **3b-1 (ce document)** : recherche + photos. 100% local, aucune infra nouvelle.
- **3b-2 (à brainstormer séparément)** : voix Gemini, avec ses fondations (page Réglages
  réelle, clé API stockée sur l'appareil, couche réseau).

Toute IA sur les photos (diagnostic Gemini vision) est hors 3b-1 : ici la photo se limite
à capture + stockage + affichage.

## État existant utile

- `GardenLogEntry` porte déjà `photoUrls?: string[]` : aucune migration de schéma requise.
- `JournalPage` charge déjà toutes les entrées via `useLiveQuery` et les filtre par type.
- `logView.ts` contient les libellés de type (`LOG_TYPE_LABELS`) et la logique d'affichage
  (`describeLogEntry`, `formatLogDate`), avec tests à côté.
- `EntryForm` (dans `QuickAddPage.tsx`) construit chaque entrée et appelle `addLogEntry`.
- `AppSettings.aiLevel` ('aucune' | 'photo' | 'photo_assistant') existe déjà : la place de
  la photo dans la stratégie IA est prévue, mais n'est pas exercée en 3b-1.

## Fonction 1 : recherche dans le journal

### Comportement

- Un champ de recherche en haut de `JournalPage`, au-dessus ou à côté des filtres de type.
- La recherche se combine **en ET** avec les filtres de type déjà présents : taper un texte
  ET sélectionner un type restreint sur les deux critères.
- Filtrage **en mémoire, en direct** pendant la frappe. Le journal est à échelle perso et
  `useLiveQuery` charge déjà l'ensemble des entrées : pas de nouvel accès base, pas d'index.
- Insensible à la casse et aux accents (normalisation NFD + suppression des diacritiques).
- Champs cherchés pour chaque entrée :
  - `title`
  - `description`
  - le **nom de la cible résolue** : parcelle, culture, oya ou arbre référencé par l'entrée
  - le libellé du type (`LOG_TYPE_LABELS[type]`)
- Une entrée correspond si la requête (éventuellement plusieurs mots) est trouvée dans la
  concaténation normalisée de ces champs. Découpage de la requête en termes : tous les
  termes doivent matcher (ET entre les mots).
- Champ vide = aucun filtre texte appliqué (comportement actuel inchangé).

### Découpage

- Cœur = fonction pure, testée isolément, posée à côté de `logView.ts` :
  `searchLogEntries(entries, query, resolveTargetName)` où `resolveTargetName(entry)`
  renvoie le nom lisible de la cible (réutilise la logique déjà employée par le journal).
  Alternative : passer une fonction de normalisation en texte cherchable par entrée.
- `JournalPage` ajoute un état local `query`, construit le resolver à partir des
  parcelles/cultures/oyas/arbres déjà chargés, et applique `searchLogEntries` après le
  filtre de type existant.
- Aucune modification du modèle ni de la base.

### Tests

- `searchLogEntries` : match sur titre, sur description, sur nom de cible, sur libellé de
  type ; insensibilité casse + accents ; multi-termes (ET) ; requête vide renvoie tout ;
  combinaison avec un sous-ensemble déjà filtré par type.

## Fonction 2 : photos

### Comportement

- Capture via `<input type="file" accept="image/*" capture="environment">` : ouvre
  directement l'appareil photo arrière sur Android (Honor Magic 7 Pro), tout en restant un
  input fichier classique sur desktop (sélection de fichier) pour les tests et le dev.
- Ajout **optionnel sur tous les formulaires** d'`EntryForm`, 1 à 3 photos par entrée.
- **Compression côté client avant stockage** : redimensionnement via canvas à un côté max
  d'environ 1280 px, export JPEG qualité ~0.7. Une photo de plusieurs Mo descend autour de
  ~150 Ko.
- Stockage : **data URL compressée** poussée dans le champ `photoUrls` déjà existant de
  l'entrée. Aucune migration de schéma, aucun object URL à révoquer.
  - Alternative écartée : table `photos` séparée stockant des Blobs, l'entrée gardant des
    ids. Plus propre à très gros volume mais impose une migration Dexie et la gestion du
    cycle de vie des object URLs. Surdimensionné pour un usage personnel.
- Affichage dans le journal : vignettes des photos d'une entrée, clic pour agrandir
  (aperçu plein écran simple, fermeture au clic).

### Découpage

- Cœur testable isolé du composant : `compressImage(file, options?) → Promise<dataUrl>`
  dans `src/services/` (ou un dossier `image/`). Encapsule la lecture du fichier, le
  redimensionnement canvas et l'export JPEG.
- Un petit composant de capture/aperçu réutilisable (ex. `PhotoInput`) géré par l'état
  local du formulaire, qui rend les vignettes des photos déjà ajoutées et un bouton
  d'ajout. Au submit, les data URLs sont jointes à l'entrée via `photoUrls`.
- `EntryForm` intègre `PhotoInput` et passe le tableau résultant dans `NewLogEntry`.
- Affichage : un composant de vignettes dans le rendu d'une ligne de journal, plus un
  aperçu agrandi.

### Tests

- `compressImage` : à partir d'un fichier image factice, renvoie bien une data URL JPEG ;
  respecte la borne de dimension (mock canvas/Image selon ce que jsdom permet ; sinon
  tester la logique de calcul des dimensions cible isolément).
- Logique de calcul de dimension cible (ratio préservé, côté max respecté) testée en pur.
- `EntryForm` : une photo ajoutée se retrouve dans `photoUrls` de l'entrée enregistrée
  (au niveau service/intégration, en mockant la compression).

## Hors périmètre (rappel)

- Saisie vocale et tout appel Gemini → palier 3b-2.
- Diagnostic IA sur photo (vision) → paliers diagnostic ultérieurs.
- Page Réglages réelle (clé API, seuils) → introduite avec 3b-2 ou un palier Réglages dédié.
- Recherche indexée / plein-texte avancée → inutile à l'échelle perso, on reste en mémoire.

## Critères de réussite

- Taper un mot dans le journal restreint la liste en direct, combiné avec les filtres de
  type, accents et casse ignorés.
- Une photo prise depuis le formulaire est compressée, stockée localement, persiste après
  rechargement, et s'affiche en vignette dans le journal avec agrandissement au clic.
- Aucun appel réseau, aucune clé, aucune migration de base.
- Suite de tests verte, build et lint OK, vérification au navigateur sur au moins un
  parcours recherche et un parcours photo.
