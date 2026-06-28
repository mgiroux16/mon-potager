import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { db, newId } from '../data/db'
import { DiagnosticsPage } from './DiagnosticsPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('DiagnosticsPage', () => {
  it('affiche un message vide quand il n y a aucun diagnostic', async () => {
    render(<DiagnosticsPage />)
    expect(await screen.findByText(/aucun diagnostic/i)).toBeInTheDocument()
  })

  it('affiche les hypotheses avec leur niveau de confiance et permet de cloturer', async () => {
    await db.log.add({
      id: 'entry1',
      type: 'probleme',
      date: '2026-06-20',
      description: 'feuilles jaunes',
      createdAt: 1,
    })
    await db.diagnostics.add({
      id: newId(),
      problemEntryId: 'entry1',
      createdAt: 1,
      hypotheses: [{ text: 'Stress hydrique', indices: 'Peu de pluie', confidence: 'eleve' }],
      status: 'ouvert',
    })

    render(<DiagnosticsPage />)

    expect(await screen.findByText('Stress hydrique')).toBeInTheDocument()
    expect(screen.getByText('eleve')).toBeInTheDocument()
    expect(screen.getByText('feuilles jaunes')).toBeInTheDocument()

    const resultField = screen.getByLabelText(/résultat observé/i)
    fireEvent.change(resultField, { target: { value: 'Feuilles reverdies' } })
    fireEvent.blur(resultField)

    const conclusionField = screen.getByLabelText(/conclusion/i)
    fireEvent.change(conclusionField, { target: { value: 'Arroser plus tot l an prochain' } })
    fireEvent.blur(conclusionField)

    await waitFor(async () => {
      const rows = await db.diagnostics.toArray()
      expect(rows[0].status).toBe('clos')
    })
  })
})
