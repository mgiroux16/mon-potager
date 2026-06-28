# Palier 4h : Export CSV ciblé, import/restauration, journal système

## Contexte

L'export JSON complet existe déjà (`exportService.ts` + `ExportButton.tsx`, accessible depuis Réglages) et boucle sur toutes les tables Dexie. Le palier 4h ajoute ce qui manque : import/restauration depuis ce JSON, des exports CSV ciblés (parcelles, cultures, journal, récoltes), et un journal des opérations d'export/import pour la traçabilité.

Firebase/Firestore (synchro multi-appareils) est un sujet séparé, déjà livré, hors scope ici.

## 1. Modèle de données

Nouvelle table Dexie `auditLog`, ajoutée via une nouvelle version de schéma (suivant le pattern des migrations existantes dans `db.ts`) :

```ts
interface AuditLogEntry {
  id: string
  type: 'export-json' | 'export-csv' | 'import'
  date: number          // Date.now()
  label: string          // ex: "Export JSON complet", "Import (fusion)", "CSV — Cultures saison 2025"
  recordCount: number    // nb d'enregistrements concernés
}
```

Store Dexie : `auditLog: 'id, type, date'`.

## 2. Export CSV ciblé

Ajouts dans `exportService.ts`, génération CSV maison (pas de librairie ; échappement des virgules/guillemets/retours ligne) :

- **Parcelles** : export complet de la table `parcels`, pas de filtre (volume faible).
- **Cultures** : export de la table `crops`, filtrable par saison (année).
- **Journal** : export de la table `log`, filtrable par saison ET par parcelle.
- **Récoltes** : sous-ensemble du journal où `type === 'harvest'`, filtrable par saison.

Chaque fonction retourne une string CSV (en-têtes + lignes). Le filtre "saison" se base sur l'année déduite du champ `date` de chaque enregistrement (pas de dépendance à `seasonNotes`).

## 3. Import / restauration

Nouvelle fonction `importAll(file: File): Promise<ImportResult>` dans `exportService.ts` :

1. Lit le fichier, parse le JSON au format `PotagerExport` (même format que l'export existant : `{ version, exportedAt, tables }`).
2. Validation minimale : ignore silencieusement toute clé de `tables` qui ne correspond à aucune table Dexie connue (tolérance aux fichiers d'une version antérieure/future).
3. Pour chaque table reconnue, `db.table(name).bulkPut(records)`. `bulkPut` écrase par id : le contenu du fichier importé gagne toujours sur les enregistrements existants ayant le même id (règle de résolution de conflit validée). Les enregistrements absents du fichier mais présents en base ne sont pas touchés (mode fusion, pas de remplacement complet).
4. Retourne `{ tablesImported: string[], totalRecords: number }`.

Pas d'écran de confirmation pré-import : le mode fusion est non destructif sur les données absentes du fichier, donc le risque est jugé suffisamment faible pour ne pas justifier une étape de confirmation supplémentaire. Un message de résultat est affiché après l'opération.

## 4. Journal système (audit)

Une fonction commune `logAudit(entry: Omit<AuditLogEntry, 'id' | 'date'>)` est appelée après chaque opération réussie :
- export JSON complet (existant, à instrumenter)
- chaque export CSV (un type par export : parcelles/cultures/journal/récoltes)
- chaque import

Le journal ne trace que ces opérations, pas les modifications de données métier (création/édition de cultures, parcelles, etc.) — hors scope du palier 4h.

## 5. UI — page Réglages

Trois sections ajoutées sous l'export JSON existant (`SettingsPage.tsx`) :

- **Import** : `<input type="file" accept=".json">` + bouton "Importer". Affiche un message de résumé après l'opération (nb de tables et d'enregistrements importés, ou message d'erreur si le fichier n'est pas un JSON valide).
- **Export CSV** : sélecteur de type d'export (Parcelles / Cultures / Journal / Récoltes). Les filtres saison/parcelle s'affichent conditionnellement selon le type choisi. Bouton "Télécharger CSV" qui déclenche le téléchargement (même mécanisme `Blob` + lien que `ExportButton.tsx`).
- **Journal système** : tableau listant les entrées `auditLog`, triées du plus récent au plus ancien (date, libellé, nombre d'enregistrements).

## Tests

- `exportService.test.ts` : ajouter des tests pour chaque fonction d'export CSV (en-têtes corrects, filtrage par saison/parcelle, échappement des caractères spéciaux), pour `importAll` (fusion correcte, écrasement par id, tolérance aux tables inconnues, gestion du JSON invalide), et pour `logAudit`.
- Tests de composant pour les nouvelles sections de `SettingsPage.tsx` (affichage du journal, déclenchement import/export).

## Hors scope

- Traçabilité des modifications de données métier (CRUD sur cultures/parcelles/etc.) — uniquement les opérations export/import sont journalisées.
- Écran de confirmation avant import.
- Synchro Firestore (déjà livrée, sujet séparé).
