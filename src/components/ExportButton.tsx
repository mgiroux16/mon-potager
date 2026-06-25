import { useState } from 'react'
import { Download } from 'lucide-react'
import { exportAll } from '../services/exportService'

export function ExportButton() {
  const [busy, setBusy] = useState(false)

  async function handleExport() {
    setBusy(true)
    try {
      const dump = await exportAll()
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mon-potager-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={busy}
      className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
    >
      <Download className="size-4" />
      {busy ? 'Export en cours…' : 'Exporter mes données (JSON)'}
    </button>
  )
}
