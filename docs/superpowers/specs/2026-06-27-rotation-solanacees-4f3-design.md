# Spec : alerte rotation de famille (4f-3)

Date : 2026-06-27
Palier : 4f-3 (dernier morceau de 4f, après 4f-1 calendrier et 4f-2 rappels contextuels)

## Contexte

`reminderService.ts` contient déjà `getInactiveParcels` (inactivité parcelle) et `getHarvestReminders`
(récolte possible). Il manque le rappel de rotation des cultures : éviter de replanter la même
famille botanique sur la même parcelle deux années de suite (mildiou, épuisement du sol, ravageurs
spécifiques...).

## Objectif

Détecter, pour chaque parcelle, si une famille botanique cultivée cette année y était déjà cultivée
l'année précédente, et le signaler dans la section Rappels du Jardin.

## Règles

- Portée : toutes les familles (`VegetableFamily`), pas seulement les solanacées. La famille `'autres'`
  est exclue (fourre-tout sans règle de rotation réelle).
- Année de référence d'un `Crop` : année de `sowingDate ?? plantingDate`. Un crop sans aucune des deux
  dates est ignoré (pas assez d'info pour le dater).
- Un `Crop` ne compte que s'il a `parcelId` et `catalogId` renseignés (besoin de la famille via le
  catalogue).
- Tous les statuts comptent, y compris `prevu` : l'alerte doit pouvoir se déclencher tôt, avant la
  plantation effective, pour laisser le temps de changer de plan.
- Comparaison : année courante (dérivée de `today`) vs année courante - 1, sur la même parcelle. Si une
  famille apparaît dans les deux ensembles → alerte.
- Une parcelle peut générer plusieurs alertes (une par famille en conflit).

## Interface

```ts
export interface RotationReminder {
  parcel: Parcel
  family: VegetableFamily
  crop: Crop // le crop de cette année concerné
}

export function getRotationReminders(
  parcels: Parcel[],
  crops: Crop[],
  catalog: CatalogItem[],
  today: string,
): RotationReminder[]
```

Si plusieurs crops de cette année partagent la même famille en conflit sur une parcelle, une entrée
par crop (pas de déduplication par famille) : cohérent avec `getHarvestReminders` qui est aussi par
crop.

## Affichage (GardenPage.tsx)

Ajouter une troisième liste dans le bloc "Rappels" existant (après inactivité parcelle et récolte
possible), même style visuel (icône + texte). Message type :

> Parcelle "Carré nord" : solanacées déjà cultivées ici l'an dernier, attention à la rotation

`hasReminders` doit inclure `rotationReminders.length > 0`.

## Tests

- Même famille sur la même parcelle, année N et N-1 → alerte générée.
- Familles différentes sur la même parcelle → pas d'alerte.
- Famille `'autres'` répétée → pas d'alerte.
- Crop sans `sowingDate` ni `plantingDate` → ignoré, pas d'erreur.
- Crop sans `catalogId` → ignoré.
- Parcelles différentes avec la même famille → pas d'alerte (la rotation est par parcelle).
- Crop `prevu` cette année en conflit avec l'année précédente → alerte générée (statut sans incidence).

## Hors périmètre

- Rappel d'historique de problèmes ("mildiou l'an dernier") : reporté, voir reprise de session.
- Champ `year` explicite sur `Crop` : non ajouté, l'année reste dérivée des dates existantes.
