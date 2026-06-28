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

  it('affiche un message si le journal est vide', async () => {
    render(<AuditLogPanel />)
    expect(await screen.findByText('Aucune opération enregistrée.')).toBeInTheDocument()
  })
})
