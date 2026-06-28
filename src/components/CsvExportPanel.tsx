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
        Type d&apos;export
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
