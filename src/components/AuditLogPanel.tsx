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
