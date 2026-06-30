import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db, newId } from '../data/db'
import { ArgentPage } from './ArgentPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

const YEAR = new Date().getFullYear()

describe('ArgentPage', () => {
  it('affiche un état vide quand il n’y a pas de dépense', async () => {
    render(<ArgentPage />)
    await waitFor(() => {
      expect(screen.getByText(/Aucune dépense variable/)).toBeInTheDocument()
    })
  })

  it('affiche une bâche durable à 16 €/an dans l’onglet Amortissements', async () => {
    await db.expenses.add({
      id: newId(),
      label: 'Bâche',
      amountEuros: 80,
      date: `${YEAR}-04-01`,
      amortization: 'durable',
      lifespanYears: 5,
      recurrence: 'ponctuelle',
    })

    render(<ArgentPage />)

    // Bascule sur l'onglet Amortissements
    await waitFor(() => screen.getByText(/Amortissements/))
    fireEvent.click(screen.getByText(/Amortissements/))

    await waitFor(() => {
      expect(screen.getByText('Bâche')).toBeInTheDocument()
      expect(screen.getByText(/16 €\/an/)).toBeInTheDocument()
    })
  })
})
