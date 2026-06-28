# Palier 4h : Export CSV ciblé, import/restauration, journal système Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter l'import/restauration depuis le JSON d'export existant, quatre exports CSV ciblés (parcelles/cultures/journal/récoltes), et un journal des opérations export/import consultable dans Réglages.

**Architecture:** Une nouvelle table Dexie `auditLog` trace chaque export/import. `exportService.ts` gagne des fonctions CSV (génération maison, séparateur `;`) et `importAll()` (fusion par `bulkPut`, le fichier importé gagne toujours). Trois nouveaux composants (`ImportButton`, `CsvExportPanel`, `AuditLogPanel`) sont montés dans `SettingsPage.tsx`.

**Tech Stack:** React, TypeScript, Dexie (IndexedDB), Vitest + Testing Library.

Spec de référence : [docs/superpowers/specs/2026-06-28-palier-4h-export-import-journal-design.md](../specs/2026-06-28-palier-4h-export-import-journal-design.md)

---

## Task 1 : Modèle `AuditLogEntry` et table Dexie

**Files:**
- Modify: `src/data/model.ts`
- Modify: `src/data/db.ts`

- [ ] **Step 1: Ajouter l'interface dans `model.ts`**

À la fin de `src/data/model.ts`, ajouter :

```ts
export type AuditLogType = 'export-json' | 'export-csv' | 'import'

export interface AuditLogEntry {
  id?: string
  type: AuditLogType
  date: number // epoch ms
  label: string
  recordCount: number
}
```

- [ ] **Step 2: Ajouter la table dans `db.ts`**

Dans `src/data/db.ts:14` (import), ajouter `AuditLogEntry` à la liste des types importés depuis `./model`.

Dans la classe `PotagerDB` (après `diagnostics!: Table<Diagnostic, string>` à la ligne 63), ajouter :

```ts
  auditLog!: Table<AuditLogEntry, string>
```

Après `this.version(10).stores({...})` (ligne 234-236), ajouter une nouvelle version :

```ts
    this.version(11).stores({
      auditLog: 'id, type, date',
    })
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 4: Commit**

```bash
git add src/data/model.ts src/data/db.ts
git commit -m "feat(4h): ajouter la table auditLog (journal export/import)"
```

---

## Task 2 : `logAudit` et instrumentation de `exportAll`

**Files:**
- Modify: `src/services/exportService.ts`
- Modify: `src/services/exportService.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Dans `src/services/exportService.test.ts`, remplacer le contenu par :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db, newId } from '../data/db'
import { exportAll, logAudit } from './exportService'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('exportService', () => {
  it('exporte toutes les tables avec un en-tête de version', async () => {
    await db.log.add({ id: newId(), type: 'note', date: '2026-06-25', title: 'test', createdAt: 1 })
    await db.varieties.add({ id: newId(), name: 'Agata', vegetable: 'Pomme de terre' })
    const dump = await exportAll()
    expect(dump.version).toBe(11)
    expect(typeof dump.exportedAt).toBe('number')
    expect(dump.tables.log).toHaveLength(1)
    expect(dump.tables.varieties).toHaveLength(1)
    // toutes les tables de la base sont présentes
    expect(Object.keys(dump.tables).sort()).toEqual(db.tables.map((t) => t.name).sort())
  })

  it('logAudit ajoute une entrée dans auditLog', async () => {
    await logAudit({ type: 'import', label: 'Test', recordCount: 3 })
    const entries = await db.auditLog.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ type: 'import', label: 'Test', recordCount: 3 })
    expect(typeof entries[0].date).toBe('number')
  })

  it('exportAll trace une entrée export-json dans auditLog', async () => {
    await db.parcels.add({ id: newId(), name: 'Parcelle test' })
    await exportAll()
    const entries = await db.auditLog.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('export-json')
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/services/exportService.test.ts`
Expected: FAIL — `logAudit` n'est pas exporté par `exportService.ts`, et `dump.version` vaut `10` au lieu de `11`.

- [ ] **Step 3: Implémenter**

Remplacer le contenu de `src/services/exportService.ts` par :

```ts
import { db, newId } from '../data/db'
import type { AuditLogType } from '../data/model'

export interface PotagerExport {
  version: number
  exportedAt: number
  tables: Record<string, unknown[]>
}

export async function logAudit(entry: {
  type: AuditLogType
  label: string
  recordCount: number
}): Promise<void> {
  await db.auditLog.add({ id: newId(), date: Date.now(), ...entry })
}

export async function exportAll(): Promise<PotagerExport> {
  const tables: Record<string, unknown[]> = {}
  for (const table of db.tables) {
    tables[table.name] = await table.toArray()
  }
  const totalRecords = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0)
  await logAudit({ type: 'export-json', label: 'Export JSON complet', recordCount: totalRecords })
  return { version: db.verno, exportedAt: Date.now(), tables }
}
```

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/services/exportService.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/exportService.ts src/services/exportService.test.ts
git commit -m "feat(4h): logAudit et instrumentation de exportAll"
```

---

## Task 3 : Helper CSV (`toCsv`) + export Parcelles

**Files:**
- Modify: `src/services/exportService.ts`
- Modify: `src/services/exportService.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans `src/services/exportService.test.ts` (import `exportParcelsCsv` en plus de `exportAll, logAudit`) :

```ts
  it('exportParcelsCsv génère un CSV avec en-têtes et échappement', async () => {
    await db.parcels.add({ id: 'p1', name: 'Carré nord', areaM2: 12, soil: 'argileux; humide' })
    const csv = await exportParcelsCsv()
    const lines = csv.split('\n')
    expect(lines[0]).toBe('id;name;areaM2;exposure;soil;mulch')
    expect(lines[1]).toBe('p1;Carré nord;12;;"argileux; humide";')
    const entries = await db.auditLog.toArray()
    expect(entries.some((e) => e.type === 'export-csv' && e.label === 'CSV — Parcelles')).toBe(true)
  })
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/services/exportService.test.ts`
Expected: FAIL — `exportParcelsCsv` n'existe pas.

- [ ] **Step 3: Implémenter**

Ajouter dans `src/services/exportService.ts`, après `logAudit` :

```ts
function csvEscape(value: unknown): string {
  if (value === undefined || value === null) return ''
  const str = String(value)
  if (/[;"\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(';'), ...rows.map((row) => row.map(csvEscape).join(';'))]
  return lines.join('\n')
}

export async function exportParcelsCsv(): Promise<string> {
  const parcels = await db.parcels.toArray()
  const csv = toCsv(
    ['id', 'name', 'areaM2', 'exposure', 'soil', 'mulch'],
    parcels.map((p) => [p.id, p.name, p.areaM2, p.exposure, p.soil, p.mulch]),
  )
  await logAudit({ type: 'export-csv', label: 'CSV — Parcelles', recordCount: parcels.length })
  return csv
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run src/services/exportService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/exportService.ts src/services/exportService.test.ts
git commit -m "feat(4h): export CSV des parcelles"
```

---

## Task 4 : Export CSV Cultures (filtre saison)

**Files:**
- Modify: `src/services/exportService.ts`
- Modify: `src/services/exportService.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter (import `exportCropsCsv` en plus) :

```ts
  it('exportCropsCsv filtre par saison et trace l\'audit', async () => {
    await db.crops.add({ id: 'c1', name: 'Tomate', status: 'en_place', plantingDate: '2025-05-01' })
    await db.crops.add({ id: 'c2', name: 'Poireau', status: 'en_place', plantingDate: '2026-03-01' })
    const csv = await exportCropsCsv(2025)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('Tomate')
    const entries = await db.auditLog.toArray()
    expect(entries.some((e) => e.label === 'CSV — Cultures saison 2025')).toBe(true)
  })

  it('exportCropsCsv sans filtre exporte toutes les cultures', async () => {
    await db.crops.add({ id: 'c1', name: 'Tomate', status: 'en_place', plantingDate: '2025-05-01' })
    await db.crops.add({ id: 'c2', name: 'Poireau', status: 'en_place', plantingDate: '2026-03-01' })
    const csv = await exportCropsCsv()
    expect(csv.split('\n')).toHaveLength(3)
  })
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/services/exportService.test.ts`
Expected: FAIL — `exportCropsCsv` n'existe pas.

- [ ] **Step 3: Implémenter**

Ajouter dans `src/services/exportService.ts`, en haut ajouter l'import du type `Crop` :

```ts
import type { AuditLogType, Crop } from '../data/model'
```

Puis après `exportParcelsCsv` :

```ts
function cropYear(crop: Crop): number | undefined {
  const date = crop.plantingDate ?? crop.sowingDate ?? crop.harvestDate
  return date ? Number(date.slice(0, 4)) : undefined
}

export async function exportCropsCsv(season?: number): Promise<string> {
  let crops = await db.crops.toArray()
  if (season !== undefined) crops = crops.filter((c) => cropYear(c) === season)
  const csv = toCsv(
    ['id', 'name', 'variety', 'parcelId', 'status', 'sowingDate', 'plantingDate', 'harvestDate'],
    crops.map((c) => [
      c.id,
      c.name,
      c.variety,
      c.parcelId,
      c.status,
      c.sowingDate,
      c.plantingDate,
      c.harvestDate,
    ]),
  )
  const label = season !== undefined ? `CSV — Cultures saison ${season}` : 'CSV — Cultures (toutes saisons)'
  await logAudit({ type: 'export-csv', label, recordCount: crops.length })
  return csv
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run src/services/exportService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/exportService.ts src/services/exportService.test.ts
git commit -m "feat(4h): export CSV des cultures avec filtre saison"
```

---

## Task 5 : Export CSV Journal (filtre saison + parcelle)

**Files:**
- Modify: `src/services/exportService.ts`
- Modify: `src/services/exportService.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter (import `exportLogCsv`) :

```ts
  it('exportLogCsv filtre par saison et par parcelle', async () => {
    await db.log.add({ id: 'l1', type: 'arrosage', date: '2025-06-01', parcelId: 'p1', createdAt: 1 })
    await db.log.add({ id: 'l2', type: 'arrosage', date: '2025-06-02', parcelId: 'p2', createdAt: 2 })
    await db.log.add({ id: 'l3', type: 'arrosage', date: '2026-06-02', parcelId: 'p1', createdAt: 3 })
    const csv = await exportLogCsv({ season: 2025, parcelId: 'p1' })
    expect(csv.split('\n')).toHaveLength(2)
    expect(csv).toContain('l1')
  })

  it('exportLogCsv sans filtre exporte toutes les entrées', async () => {
    await db.log.add({ id: 'l1', type: 'arrosage', date: '2025-06-01', createdAt: 1 })
    const csv = await exportLogCsv()
    expect(csv.split('\n')).toHaveLength(2)
  })
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/services/exportService.test.ts`
Expected: FAIL — `exportLogCsv` n'existe pas.

- [ ] **Step 3: Implémenter**

Ajouter l'import `GardenLogEntry` :

```ts
import type { AuditLogType, Crop, GardenLogEntry } from '../data/model'
```

Puis après `exportCropsCsv` :

```ts
function entryYear(entry: GardenLogEntry): number {
  return Number(entry.date.slice(0, 4))
}

export async function exportLogCsv(
  filters: { season?: number; parcelId?: string } = {},
): Promise<string> {
  let entries = await db.log.toArray()
  if (filters.season !== undefined) entries = entries.filter((e) => entryYear(e) === filters.season)
  if (filters.parcelId !== undefined) entries = entries.filter((e) => e.parcelId === filters.parcelId)
  const csv = toCsv(
    ['id', 'type', 'date', 'title', 'description', 'parcelId', 'cropId', 'quantityKg', 'volumeLiters'],
    entries.map((e) => [
      e.id,
      e.type,
      e.date,
      e.title,
      e.description,
      e.parcelId,
      e.cropId,
      e.quantityKg,
      e.volumeLiters,
    ]),
  )
  await logAudit({ type: 'export-csv', label: 'CSV — Journal', recordCount: entries.length })
  return csv
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run src/services/exportService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/exportService.ts src/services/exportService.test.ts
git commit -m "feat(4h): export CSV du journal avec filtres saison/parcelle"
```

---

## Task 6 : Export CSV Récoltes (filtre saison)

**Files:**
- Modify: `src/services/exportService.ts`
- Modify: `src/services/exportService.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter (import `exportHarvestsCsv`) :

```ts
  it('exportHarvestsCsv ne garde que les entrées de type recolte, filtrées par saison', async () => {
    await db.log.add({ id: 'l1', type: 'recolte', date: '2025-07-01', quantityKg: 3, createdAt: 1 })
    await db.log.add({ id: 'l2', type: 'arrosage', date: '2025-07-02', createdAt: 2 })
    await db.log.add({ id: 'l3', type: 'recolte', date: '2026-07-02', quantityKg: 2, createdAt: 3 })
    const csv = await exportHarvestsCsv(2025)
    expect(csv.split('\n')).toHaveLength(2)
    expect(csv).toContain('l1')
  })
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/services/exportService.test.ts`
Expected: FAIL — `exportHarvestsCsv` n'existe pas.

- [ ] **Step 3: Implémenter**

Ajouter après `exportLogCsv` :

```ts
export async function exportHarvestsCsv(season?: number): Promise<string> {
  let entries = (await db.log.toArray()).filter((e) => e.type === 'recolte')
  if (season !== undefined) entries = entries.filter((e) => entryYear(e) === season)
  const csv = toCsv(
    ['id', 'date', 'title', 'parcelId', 'cropId', 'quantityKg'],
    entries.map((e) => [e.id, e.date, e.title, e.parcelId, e.cropId, e.quantityKg]),
  )
  const label = season !== undefined ? `CSV — Récoltes saison ${season}` : 'CSV — Récoltes (toutes saisons)'
  await logAudit({ type: 'export-csv', label, recordCount: entries.length })
  return csv
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run src/services/exportService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/exportService.ts src/services/exportService.test.ts
git commit -m "feat(4h): export CSV des récoltes avec filtre saison"
```

---

## Task 7 : `importAll` (fusion par bulkPut)

**Files:**
- Modify: `src/services/exportService.ts`
- Modify: `src/services/exportService.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter (import `importAll` ; helper `file()` à ajouter en haut du fichier de test) :

```ts
function jsonFile(content: unknown): File {
  return new File([JSON.stringify(content)], 'export.json', { type: 'application/json' })
}
```

```ts
  it('importAll fusionne par id, le fichier importé gagne toujours', async () => {
    await db.parcels.add({ id: 'p1', name: 'Ancien nom' })
    await db.parcels.add({ id: 'p2', name: 'Inchangée' })
    const result = await importAll(
      jsonFile({
        version: 11,
        exportedAt: Date.now(),
        tables: { parcels: [{ id: 'p1', name: 'Nouveau nom' }] },
      }),
    )
    const p1 = await db.parcels.get('p1')
    const p2 = await db.parcels.get('p2')
    expect(p1?.name).toBe('Nouveau nom')
    expect(p2?.name).toBe('Inchangée')
    expect(result).toEqual({ tablesImported: ['parcels'], totalRecords: 1 })
  })

  it('importAll ignore les tables inconnues du fichier', async () => {
    const result = await importAll(
      jsonFile({
        version: 11,
        exportedAt: Date.now(),
        tables: { tableInconnue: [{ id: 'x' }], parcels: [{ id: 'p1', name: 'Test' }] },
      }),
    )
    expect(result.tablesImported).toEqual(['parcels'])
    expect(result.totalRecords).toBe(1)
  })

  it('importAll trace une entrée audit de type import', async () => {
    await importAll(jsonFile({ version: 11, exportedAt: Date.now(), tables: { parcels: [{ id: 'p1', name: 'Test' }] } }))
    const entries = await db.auditLog.toArray()
    expect(entries.some((e) => e.type === 'import')).toBe(true)
  })
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/services/exportService.test.ts`
Expected: FAIL — `importAll` n'existe pas.

- [ ] **Step 3: Implémenter**

Ajouter à la fin de `src/services/exportService.ts` :

```ts
export interface ImportResult {
  tablesImported: string[]
  totalRecords: number
}

export async function importAll(file: File): Promise<ImportResult> {
  const text = await file.text()
  const parsed = JSON.parse(text) as PotagerExport
  const knownTables = new Set(db.tables.map((t) => t.name))
  const tablesImported: string[] = []
  let totalRecords = 0

  for (const [name, records] of Object.entries(parsed.tables ?? {})) {
    if (!knownTables.has(name) || !Array.isArray(records) || records.length === 0) continue
    await db.table(name).bulkPut(records)
    tablesImported.push(name)
    totalRecords += records.length
  }

  await logAudit({ type: 'import', label: 'Import (fusion)', recordCount: totalRecords })
  return { tablesImported, totalRecords }
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run src/services/exportService.test.ts`
Expected: PASS (tous les tests du fichier)

- [ ] **Step 5: Commit**

```bash
git add src/services/exportService.ts src/services/exportService.test.ts
git commit -m "feat(4h): importAll, fusion par id, le fichier importé gagne"
```

---

## Task 8 : Composant `ImportButton`

**Files:**
- Create: `src/components/ImportButton.tsx`
- Create: `src/components/ImportButton.test.tsx`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/components/ImportButton.test.tsx` :

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportButton } from './ImportButton'

vi.mock('../services/exportService', () => ({
  importAll: vi.fn(async () => ({ tablesImported: ['parcels', 'crops'], totalRecords: 5 })),
}))

import { importAll } from '../services/exportService'

beforeEach(() => {
  vi.clearAllMocks()
})

function jsonFile(): File {
  return new File(['{}'], 'export.json', { type: 'application/json' })
}

describe('ImportButton', () => {
  it('importe le fichier choisi et affiche le résumé', async () => {
    render(<ImportButton />)
    const user = userEvent.setup()

    await user.upload(screen.getByLabelText('Choisir un fichier à importer'), jsonFile())
    await user.click(screen.getByRole('button', { name: 'Importer' }))

    await waitFor(() => expect(importAll).toHaveBeenCalled())
    expect(await screen.findByText('2 tables, 5 enregistrements importés.')).toBeInTheDocument()
  })

  it("affiche une erreur si le fichier n'est pas un JSON valide", async () => {
    vi.mocked(importAll).mockRejectedValueOnce(new Error('JSON invalide'))
    render(<ImportButton />)
    const user = userEvent.setup()

    await user.upload(screen.getByLabelText('Choisir un fichier à importer'), jsonFile())
    await user.click(screen.getByRole('button', { name: 'Importer' }))

    expect(await screen.findByText("Fichier invalide, import annulé.")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/components/ImportButton.test.tsx`
Expected: FAIL — `ImportButton` n'existe pas.

- [ ] **Step 3: Implémenter**

Créer `src/components/ImportButton.tsx` :

```tsx
import { useState } from 'react'
import { Upload } from 'lucide-react'
import { importAll } from '../services/exportService'

type ImportState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'ok'; tables: number; records: number }
  | { status: 'erreur' }

export function ImportButton() {
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<ImportState>({ status: 'idle' })

  async function handleImport() {
    if (!file) return
    setState({ status: 'busy' })
    try {
      const result = await importAll(file)
      setState({ status: 'ok', tables: result.tablesImported.length, records: result.totalRecords })
    } catch {
      setState({ status: 'erreur' })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm text-green-800">
        Choisir un fichier à importer
        <input
          aria-label="Choisir un fichier à importer"
          type="file"
          accept=".json"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <button
        type="button"
        onClick={handleImport}
        disabled={!file || state.status === 'busy'}
        className="flex items-center gap-2 rounded-lg border border-green-300 px-4 py-2 text-sm font-medium text-green-800 disabled:opacity-60"
      >
        <Upload className="size-4" />
        {state.status === 'busy' ? 'Import en cours…' : 'Importer'}
      </button>
      {state.status === 'ok' && (
        <p className="text-sm text-green-700">
          {state.tables} tables, {state.records} enregistrements importés.
        </p>
      )}
      {state.status === 'erreur' && (
        <p className="text-sm text-red-600">Fichier invalide, import annulé.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run src/components/ImportButton.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ImportButton.tsx src/components/ImportButton.test.tsx
git commit -m "feat(4h): composant ImportButton"
```

---

## Task 9 : Composant `CsvExportPanel`

**Files:**
- Create: `src/components/CsvExportPanel.tsx`
- Create: `src/components/CsvExportPanel.test.tsx`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/components/CsvExportPanel.test.tsx` :

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CsvExportPanel } from './CsvExportPanel'

vi.mock('../services/exportService', () => ({
  exportParcelsCsv: vi.fn(async () => 'id;name\np1;Test'),
  exportCropsCsv: vi.fn(async () => 'id;name\nc1;Tomate'),
  exportLogCsv: vi.fn(async () => 'id;type\nl1;arrosage'),
  exportHarvestsCsv: vi.fn(async () => 'id;date\nl1;2025-06-01'),
}))

import { exportCropsCsv, exportParcelsCsv } from '../services/exportService'

beforeEach(() => {
  vi.clearAllMocks()
  URL.createObjectURL = vi.fn(() => 'blob:fake')
  URL.revokeObjectURL = vi.fn()
})

describe('CsvExportPanel', () => {
  it('exporte les parcelles par défaut', async () => {
    render(<CsvExportPanel />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Télécharger CSV' }))
    expect(exportParcelsCsv).toHaveBeenCalled()
  })

  it('affiche le filtre saison pour les cultures et le transmet', async () => {
    render(<CsvExportPanel />)
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText("Type d'export"), 'cultures')
    await user.type(screen.getByLabelText('Saison (année)'), '2025')
    await user.click(screen.getByRole('button', { name: 'Télécharger CSV' }))
    expect(exportCropsCsv).toHaveBeenCalledWith(2025)
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/components/CsvExportPanel.test.tsx`
Expected: FAIL — `CsvExportPanel` n'existe pas.

- [ ] **Step 3: Implémenter**

Créer `src/components/CsvExportPanel.tsx` :

```tsx
import { useState } from 'react'
import { Download } from 'lucide-react'
import {
  exportCropsCsv,
  exportHarvestsCsv,
  exportLogCsv,
  exportParcelsCsv,
} from '../services/exportService'

type ExportType = 'parcelles' | 'cultures' | 'journal' | 'recoltes'

const TYPE_LABELS: Record<ExportType, string> = {
  parcelles: 'Parcelles',
  cultures: 'Cultures',
  journal: 'Journal',
  recoltes: 'Récoltes',
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function CsvExportPanel() {
  const [type, setType] = useState<ExportType>('parcelles')
  const [season, setSeason] = useState('')
  const [parcelId, setParcelId] = useState('')

  async function handleExport() {
    const seasonValue = season ? Number(season) : undefined
    let csv: string
    switch (type) {
      case 'parcelles':
        csv = await exportParcelsCsv()
        break
      case 'cultures':
        csv = await exportCropsCsv(seasonValue)
        break
      case 'journal':
        csv = await exportLogCsv({ season: seasonValue, parcelId: parcelId || undefined })
        break
      case 'recoltes':
        csv = await exportHarvestsCsv(seasonValue)
        break
    }
    downloadCsv(`${type}-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm text-green-800">
        Type d'export
        <select
          aria-label="Type d'export"
          value={type}
          onChange={(e) => setType(e.target.value as ExportType)}
          className="rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-950"
        >
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {(type === 'cultures' || type === 'journal' || type === 'recoltes') && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Saison (année)
          <input
            aria-label="Saison (année)"
            type="number"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="Toutes les saisons"
            className="rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-950"
          />
        </label>
      )}

      {type === 'journal' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Parcelle (id)
          <input
            aria-label="Parcelle (id)"
            type="text"
            value={parcelId}
            onChange={(e) => setParcelId(e.target.value)}
            placeholder="Toutes les parcelles"
            className="rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-950"
          />
        </label>
      )}

      <button
        type="button"
        onClick={handleExport}
        className="flex items-center gap-2 rounded-lg border border-green-300 px-4 py-2 text-sm font-medium text-green-800"
      >
        <Download className="size-4" />
        Télécharger CSV
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run src/components/CsvExportPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/CsvExportPanel.tsx src/components/CsvExportPanel.test.tsx
git commit -m "feat(4h): composant CsvExportPanel"
```

Note : le filtre "Parcelle (id)" en saisie libre est volontairement minimal (pas de sélecteur de noms) — cohérent avec le périmètre validé en brainstorming (page Réglages uniquement, pas de raccourcis contextuels par page).

---

## Task 10 : Composant `AuditLogPanel`

**Files:**
- Create: `src/components/AuditLogPanel.tsx`
- Create: `src/components/AuditLogPanel.test.tsx`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/components/AuditLogPanel.test.tsx` :

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db, newId } from '../data/db'
import { AuditLogPanel } from './AuditLogPanel'

beforeEach(async () => {
  await db.auditLog.clear()
})

describe('AuditLogPanel', () => {
  it('affiche les entrées du plus récent au plus ancien', async () => {
    await db.auditLog.add({ id: newId(), type: 'export-json', date: 1000, label: 'Ancien export', recordCount: 2 })
    await db.auditLog.add({ id: newId(), type: 'import', date: 2000, label: 'Import récent', recordCount: 5 })

    render(<AuditLogPanel />)

    const rows = await screen.findAllByRole('row')
    // ligne d'en-tête + 2 lignes de données
    expect(rows).toHaveLength(3)
    expect(rows[1]).toHaveTextContent('Import récent')
    expect(rows[2]).toHaveTextContent('Ancien export')
  })

  it("affiche un message si le journal est vide", async () => {
    render(<AuditLogPanel />)
    expect(await screen.findByText('Aucune opération enregistrée.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/components/AuditLogPanel.test.tsx`
Expected: FAIL — `AuditLogPanel` n'existe pas.

- [ ] **Step 3: Implémenter**

Créer `src/components/AuditLogPanel.tsx` :

```tsx
import { useEffect, useState } from 'react'
import { db } from '../data/db'
import type { AuditLogEntry } from '../data/model'

export function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null)

  useEffect(() => {
    void db.auditLog.toArray().then((rows) => {
      setEntries([...rows].sort((a, b) => b.date - a.date))
    })
  }, [])

  if (entries === null) return null

  if (entries.length === 0) {
    return <p className="text-sm text-green-600">Aucune opération enregistrée.</p>
  }

  return (
    <table className="w-full text-sm text-green-900">
      <thead>
        <tr>
          <th className="text-left">Date</th>
          <th className="text-left">Opération</th>
          <th className="text-right">Enregistrements</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id}>
            <td>{new Date(entry.date).toLocaleString('fr-FR')}</td>
            <td>{entry.label}</td>
            <td className="text-right">{entry.recordCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npx vitest run src/components/AuditLogPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/AuditLogPanel.tsx src/components/AuditLogPanel.test.tsx
git commit -m "feat(4h): composant AuditLogPanel"
```

---

## Task 11 : Intégration dans `SettingsPage`

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Ajouter les imports**

Dans `src/pages/SettingsPage.tsx:10`, après `import { ExportButton } from '../components/ExportButton'`, ajouter :

```ts
import { ImportButton } from '../components/ImportButton'
import { CsvExportPanel } from '../components/CsvExportPanel'
import { AuditLogPanel } from '../components/AuditLogPanel'
```

- [ ] **Step 2: Ajouter les sections après "Sauvegarde"**

Dans `src/pages/SettingsPage.tsx`, juste après la section `Sauvegarde` (ligne 209-212, qui contient `<ExportButton />`), ajouter trois nouvelles sections :

```tsx
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-green-900">Importer une sauvegarde</h2>
        <ImportButton />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-green-900">Export CSV</h2>
        <CsvExportPanel />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-green-900">Journal système</h2>
        <AuditLogPanel />
      </section>
```

- [ ] **Step 3: Vérifier que le projet compile et que tous les tests passent**

Run: `npx tsc --noEmit && npx vitest run`
Expected: aucune erreur TypeScript, tous les tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat(4h): intégrer import/export CSV/journal dans Réglages"
```

---

## Task 12 : Vérification finale

**Files:** aucun (vérification uniquement)

- [ ] **Step 1: Lancer la suite complète**

Run: `npx vitest run`
Expected: tous les tests PASS (suite existante + nouveaux tests des tâches 1 à 11)

- [ ] **Step 2: Lancer le typecheck**

Run: `npx tsc --noEmit`
Expected: aucune erreur

- [ ] **Step 3: Lancer le lint si configuré**

Run: `npm run lint`
Expected: aucune erreur (si la commande existe dans `package.json`)
