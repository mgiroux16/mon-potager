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
