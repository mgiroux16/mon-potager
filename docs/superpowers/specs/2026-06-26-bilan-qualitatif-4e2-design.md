# Bilan qualitatif de saison (4E-2)

## Contexte

Le palier 4E-1 a livré le bilan chiffré de saison (`/bilan`) : kg, rendements, valeur, net, eau/pluie par culture et par parcelle. Ce palier 4E-2 ajoute le volet qualitatif sur la même page : pour chaque culture, une note libre "à refaire / à changer" ; pour chaque parcelle, une note libre "météo marquante". Pas de note chiffrée de satisfaction (texte libre uniquement, décision explicite).

## Données

Nouvelle table Dexie `seasonNotes` :

```ts
export interface SeasonNote {
  id?: number
  year: number
  cropId?: number
  parcelId?: number
  text: string
}
```

Une ligne est liée soit à `cropId` (note de culture), soit à `parcelId` (note de parcelle), jamais les deux à la fois. Unicité logique : au plus une note par `(year, cropId)` et au plus une note par `(year, parcelId)`. Pas de contrainte unique Dexie native sur paire de colonnes : l'unicité est garantie par le service (upsert qui cherche l'existant avant insert).

Migration : `db.version(3).stores({ seasonNotes: '++id, year, cropId, parcelId' })`.

## Service `seasonNotesService.ts`

```ts
getCropNote(notes: SeasonNote[], cropId: number, year: number): string
getParcelNote(notes: SeasonNote[], parcelId: number, year: number): string
setCropNote(cropId: number, year: number, text: string): Promise<void>
setParcelNote(parcelId: number, year: number, text: string): Promise<void>
```

- Les `get*` sont des fonctions pures sur un tableau déjà chargé (`db.seasonNotes.toArray()` via `useLiveQuery`, comme le reste de la page), pas des requêtes Dexie directes : cohérent avec le style déjà utilisé dans `SeasonSummaryPage.tsx`. Retourne `''` si rien trouvé.
- Les `set*` font l'upsert : cherchent une note existante par `(year, cropId)` ou `(year, parcelId)` dans la table, puis `db.seasonNotes.update` si trouvée, `db.seasonNotes.add` sinon. Si `text` est vide après un upsert sur une note existante, la note est supprimée (`db.seasonNotes.delete`) plutôt que laissée vide en base.

## UI sur `SeasonSummaryPage.tsx`

- Nouveau composant `CropNoteField` : sous chaque `CropRowView`, un `<textarea>` avec label "À refaire / à changer", valeur initialisée depuis `getCropNote(notes, row.cropId, year)`, sauvegarde au `onBlur` via `setCropNote`. Pattern identique à `CropPrice` dans `GardenPage.tsx` (état local `value`, `useState`, pas de debounce, save direct au blur).
- Nouveau composant `ParcelNoteField` : même pattern sous chaque `ParcelRowView`, label "Météo marquante", `getParcelNote`/`setParcelNote`.
- `SeasonSummaryPage` charge `db.seasonNotes.toArray()` via `useLiveQuery` au même niveau que les autres collections, et passe le tableau filtré/le year aux deux nouveaux composants.
- Les champs sont vides par défaut (pas de placeholder ni de note préremplie) et n'affectent aucun calcul chiffré existant.

## Hors scope

- Pas de note de satisfaction chiffrée (1-5, pouce, etc.) : texte libre seulement, décision explicite de Mathieu.
- Pas de réutilisation des entrées de journal ('note'/'observation') existantes : les notes de bilan sont une saisie dédiée, indépendante du journal.
- Pas d'historique de notes par année affiché ailleurs que sur l'année sélectionnée (changer l'année change la note affichée/éditée, conformément à la clé `(year, cropId/parcelId)`).
