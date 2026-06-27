# Spec : carte photo cliquable du jardin (4D-2)

Date : 2026-06-27
Palier : 4D-2 (dernier mini-palier du bloc 4D)

## Contexte

Mathieu veut pouvoir taper sur une photo de sa parcelle, prise depuis le toit, pour loguer un
arrosage sans passer par une liste. Il a fourni 6 photos du jardin et une maquette papier annotée :
sur la maquette, des formes dessinées à la main sur une photo délimitent des zones de culture
précises (« Tomates 60 pieds », « Courgette 3 pieds », « Pêche plate 2 pieds », etc.), chacune
correspondant à ce qu'il appelle une parcelle.

Le terrain réel : 578 m², triangle, section CI, commune de Champniers (16). Orientation confirmée
(voir mémoire `jardin-terrain-orientation.md`) : pointe sud, base nord côté maison/Rue de
l'Arbalétrier, côté est = Impasse de la Claire-Voie = côté du rang de tomates, côté ouest = l'autre
grand côté. Cette orientation n'a pas d'impact direct sur l'implémentation (pas de logique de calcul
solaire dans ce palier), elle a juste servi à comprendre les photos pendant le brainstorming.

## Décisions actées

- **Granularité** : chaque forme dessinée à la main sur la maquette papier = une `Parcel`. Mathieu va
  redécouper ses 4 parcelles actuelles (venues du seed) en zones plus fines lui-même, via la nouvelle
  interface de gestion décrite ici. Pas de migration automatique des données existantes.
- **Photo par parcelle** : chaque `Parcel` a sa propre photo (champ `photoUrl`, déjà présent dans le
  modèle). Si plusieurs parcelles partagent la même photo de fond, Mathieu uploade/choisit la même
  image plusieurs fois (une copie par parcelle). Pas de nouvelle table « photo de jardin » partagée :
  décision explicite pour rester simple, redondance de stockage acceptée (photos compressées par
  `compressImage`, donc raisonnable en taille).
- **Tracé du polygone** : fait par Mathieu lui-même, une fois, dans l'app. Interaction tap point par
  point (pas de glissé à main levée). Pas d'annulation point par point : un seul bouton
  « Recommencer » qui vide tous les points tracés.
- **Action au tap (vue normale)** : taper n'importe où à l'intérieur d'un polygone fermé ouvre
  directement le formulaire d'arrosage prérempli avec cette parcelle (pas de menu intermédiaire).
  Réutilise le mécanisme déjà existant de brouillon prérempli (`voiceDraft` passé via
  `navigate(..., { state: { voiceDraft } })`), déjà utilisé pour la saisie vocale.
- **Emplacement** : la section « Parcelles » de `GardenPage.tsx` (actuellement une liste texte) est
  remplacée par cette nouvelle vue carte. Pas de nouvelle route.
- **Suppression d'une parcelle** : libre, sans blocage même si des `Crop`, `GardenLogEntry`, etc. y
  font encore référence. Dexie n'impose pas de contrainte de clé étrangère ; un `parcelId` orphelin
  ne casse rien côté lecture (les services existants filtrent par correspondance d'id, un id absent
  est simplement ignoré).
- **Parcelle sans photo ni polygone** : repli sur un affichage simple du nom seul (état actuel),
  pendant la phase de transition où Mathieu n'a pas encore redessiné toutes ses parcelles.

## Modèle de données

Ajout d'un seul champ optionnel sur `Parcel` (`src/data/model.ts`), pas de migration Dexie nécessaire
(champ optionnel non indexé, comme `daysToHarvest` ajouté au palier 4f-2) :

```ts
export interface Parcel {
  id?: number
  name: string
  areaM2?: number
  exposure?: Exposure
  soil?: string
  mulch?: string
  notes?: string
  photoUrl?: string
  polygon?: { x: number; y: number }[] // coordonnees relatives 0-1, independantes de la taille d'affichage
}
```

Un polygone est valide à partir de 3 points. `photoUrl` sans `polygon` (ou l'inverse) : traité comme
absent, repli sur l'affichage nom seul (évite un polygone dessiné sur rien, ou une photo sans zone
cliquable qui ne ferait rien au tap).

## Gestion des parcelles (CRUD minimal)

Nouveau bloc dans `GardenPage.tsx`, à la place de la liste actuelle :

- **Créer** : bouton « + Nouvelle parcelle » → saisie du nom (input simple) → la parcelle est créée
  sans photo ni polygone, affichée immédiatement en repli nom seul, avec un bouton « Ajouter une
  photo » dessus.
- **Renommer** : tap sur le nom affiché sur la carte → input inline → save au blur (pattern repris de
  `CropPrice`).
- **Supprimer** : bouton corbeille sur la carte → `window.confirm` (« Supprimer la parcelle
  "<nom>" ? ») → `db.parcels.delete(id)`.
- **Ajouter/changer la photo** : bouton sur la carte → réutilise `PhotoInput`/`compressImage`
  (`src/components/PhotoInput.tsx`, `src/services/imageService.ts`) pour choisir et compresser une
  image, stockée dans `Parcel.photoUrl`. Changer la photo d'une parcelle qui avait déjà un polygone
  réinitialise ce polygone à vide (les coordonnées ne correspondent plus à la nouvelle image), et
  repasse automatiquement en mode tracé.

## Tracé du polygone

Après ajout d'une photo (ou via un bouton « Modifier la zone » sur une parcelle qui a déjà
photo + polygone), affichage plein écran de la photo avec un calque de tracé :

- Chaque tap sur la photo ajoute un point (cercle marqueur) et trace un segment depuis le point
  précédent.
- Bouton « Recommencer » : vide tous les points.
- Bouton « Valider la forme » : actif uniquement à partir de 3 points. Ferme le polygone (segment du
  dernier point vers le premier) et enregistre `Parcel.polygon` (coordonnées converties en relatif 0-1
  par rapport aux dimensions affichées de l'image).
- Bouton « Annuler » : quitte le mode tracé sans rien enregistrer (la parcelle garde son polygone
  précédent s'il y en avait un, ou reste sans polygone).

## Affichage normal (vue jardin)

Chaque parcelle avec `photoUrl` et `polygon` valides s'affiche comme une carte : la photo en fond,
un polygone SVG semi-transparent (couleur unie, pas de remplissage opaque) dessiné par-dessus aux
coordonnées enregistrées, le nom de la parcelle en superposition (badge texte).

Taper n'importe où à l'intérieur du polygone (test point-dans-polygone, pas juste sur le contour)
déclenche :

```ts
navigate('/ajouter', { state: { voiceDraft: { type: 'arrosage', parcelId: parcel.id } } })
```

Ce qui ouvre `QuickAddPage` directement sur le formulaire d'arrosage, parcelle déjà sélectionnée,
comme le fait déjà un brouillon vocal aujourd'hui.

Une parcelle sans `photoUrl`/`polygon` valides s'affiche en repli : carte simple avec le nom (et
`areaM2` si renseigné), comme l'affichage actuel, plus les boutons de gestion (renommer, ajouter
photo, supprimer).

## Tests

- `Parcel.polygon` : pas de logique pure complexe à tester en isolation au-delà de la fonction
  point-dans-polygone (à extraire en fonction testable, ex. `isPointInPolygon(point, polygon)`).
- Tests de rendu `GardenPage` : parcelle avec photo+polygone affiche la carte image ; parcelle sans
  affiche le repli nom seul ; tap dans le polygone appelle `navigate` avec le bon `state` ; créer,
  renommer, supprimer une parcelle mettent à jour `db.parcels`.
- Pas de test automatisé du tracé tap-par-tap lui-même (interaction canvas/SVG complexe, mieux vérifié
  manuellement en preview navigateur comme les paliers précédents).

## Hors périmètre

- Logique liée à l'exposition solaire (`Exposure` existe déjà sur `Parcel` mais reste un champ texte
  libre, pas de calcul automatique à partir de l'orientation du terrain).
- Panorama assemblé à partir des 6 photos : abandonné, chaque parcelle garde sa propre photo isolée.
- Annulation point par point pendant le tracé : seul « Recommencer » (vider tout) est prévu.
- Migration automatique des 4 parcelles existantes vers la granularité fine de la maquette : Mathieu
  s'en occupe lui-même via les nouveaux boutons créer/renommer/supprimer.
