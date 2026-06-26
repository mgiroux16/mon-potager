# Séparation multi-actions à la dictée vocale

Date : 2026-06-26
Statut : validé, prêt pour writing-plans

## Contexte

Retour terrain de Mathieu après le premier test vocal réel (palier 3b-2b) : une phrase qui mélange
plusieurs actions de nature différente (« j'ai récolté 3 kilos, j'ai arrosé 20 min les tomates »)
devient une seule note fourre-tout au lieu de deux entrées typées (récolte 3kg + arrosage 20min
tomates).

Cause racine : `parseVoiceDraft` (palier 3b-2b) ne produit structurellement qu'**un seul** brouillon
(`VoiceDraft.draft` a un champ `type` unique). Quel que soit ce que Gemini détecte dans l'audio, le
code actuel ne peut écrire qu'une entrée.

## Décision : option A (parsing multi-actions), pas l'option B

Deux pistes avaient été proposées au retour terrain :
- A) Gemini renvoie un tableau d'actions détectées, parsées en plusieurs brouillons.
- B) micro contextuel par onglet/parcelle (la cible est fixée par la navigation, plus besoin de
  séparer après coup).

Tranché en faveur de **A**. Confirmé en brainstorming : sur le terrain, Mathieu dicte toujours sur
**une seule cible** (parcelle/culture) à la fois ; le mélange réel n'est pas "deux cibles différentes
dans la même phrase" mais "deux types d'action différents sur la même cible" (récolte + arrosage sur
les tomates). L'option B réglerait un problème de cible qui n'existe pas vraiment ici, et laisserait
le vrai trou intact : `parseVoiceDraft` ne peut produire qu'un seul `type`, peu importe la cible.

La latence du parcours vocal (signalée dans le même retour terrain) est traitée séparément, après ce
palier.

## Section 1 — Parsing (`voiceParseService.ts`)

Le prompt Gemini (`buildVoiceAudioPrompt`) change : au lieu de demander un objet JSON unique, on
demande un **tableau** d'objets, même s'il n'y a qu'une seule action détectée (schéma uniforme,
plus simple à parser qu'un "objet ou tableau"). Chaque élément du tableau garde exactement les mêmes
champs qu'aujourd'hui : `type`, `date`, `time`, `title`, `description`, `parcelId`, `cropId`,
`oyaId`, `treeId`, `volumeLiters`, `rainMm`, `quantityKg`.

`parseVoiceDraft` devient `parseVoiceDrafts` (retourne `VoiceDraft[]` au lieu de `VoiceDraft`) :
1. Extrait le tableau JSON (`[` ... `]` au lieu de `{` ... `}`).
2. Parse chaque élément avec exactement la même logique défensive qu'aujourd'hui (whitelist par
   champs littéraux fixes — anti prototype-pollution déjà en place, inchangée — id rejeté si hors
   catalogue, nombres non numériques ignorés). Cette logique par élément n'est pas réécrite, juste
   appliquée en boucle sur chaque objet du tableau.
3. **Plafond à 5 actions** : au-delà, les éléments excédentaires sont ignorés silencieusement (pas
   d'erreur visible côté UI).
4. Si le tableau JSON est introuvable, vide, ou invalide → repli identique au comportement actuel :
   un seul `VoiceDraft` `{ type: 'note', description: transcript, parsed: false }`.

## Section 2 — Orchestration et UI

`VoiceCapture.finalize()` appelle `parseVoiceDrafts` et obtient un tableau de brouillons.

- **1 seul brouillon** → comportement actuel strictement inchangé : navigation directe vers
  `/ajouter` avec ce brouillon dans le router state, `EntryForm` plein écran comme aujourd'hui. Zéro
  changement visible pour le cas le plus fréquent.
- **2+ brouillons** → navigation vers une nouvelle page `VoiceReviewPage` avec le tableau complet
  dans le router state. Cette page affiche une carte résumée par action détectée (icône du type via
  `logTypeIcons.tsx` existant + résumé court, ex. « Récolte · Tomates · 3 kg » via les helpers de
  `logView.ts` déjà disponibles). Chaque carte a trois actions :
  - **Valider** : écrit l'entrée directement en base via `addLogEntry` (les valeurs du brouillon
    telles que parsées, `status: 'valide'` par défaut comme le pose déjà `logService`), puis retire
    la carte de la liste.
  - **Modifier** : ouvre `EntryForm` (réutilisé tel quel, aucune réécriture) préremplie avec le
    brouillon de cette carte précise, en surcouche (overlay/route enfant) ; au submit, retour à la
    liste de cartes avec cette carte retirée (déjà sauvegardée par `EntryForm`).
  - **Supprimer** : retire la carte de la liste sans rien écrire en base.
  - Quand la liste est vide (toutes les cartes validées, modifiées ou supprimées), navigation
    automatique vers le journal, comme le fait déjà le flux à une seule action aujourd'hui.

Aucune migration Dexie : pas de nouveau champ de modèle, seulement le flux de saisie qui change.

## Section 3 — Cas limites et tests

- Annulation pendant le traitement (`cancelledRef`) : comportement actuel conservé à l'identique,
  s'applique à l'ensemble du tableau (pas de navigation si l'overlay est fermé pendant l'appel
  Gemini).
- Tableau vide ou JSON cassé → repli note unique, pas d'écran de cartes vide.
- Tests à écrire/étendre :
  - `voiceParseService.test.ts` : cas 2 actions, cas 5+ actions (troncature), tableau vide, JSON
    cassé (repli note).
  - Nouveau `VoiceReviewPage.test.tsx` : rendu d'une carte par action, Valider écrit en base et
    retire la carte, Modifier ouvre `EntryForm` préremplie et retire la carte après sauvegarde,
    Supprimer retire la carte sans écriture, dernière carte traitée → navigation vers le journal.
  - `VoiceCapture.test.tsx` : mise à jour pour couvrir le routage 1 action (direct `/ajouter`) vs
    2+ actions (vers `VoiceReviewPage`).

## Hors périmètre

- Latence du parcours vocal (mesure et diagnostic séparés, après ce palier).
- Option B (micro contextuel par parcelle) : écartée, cf. Décision ci-dessus.
- Tout changement de modèle de données (`GardenLogEntry`, `Crop`, etc.) : aucun nécessaire ici.
