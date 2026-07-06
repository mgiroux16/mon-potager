import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { setCollectionData, clearCollectionData } from '../test/firestoreHooksMock'
import { ArgentPage } from './ArgentPage'

vi.mock('../data/firestoreHooks', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreHooksMock
})
vi.mock('../data/firestoreWrites', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreWritesMock
})

beforeEach(() => {
  clearCollectionData()
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
    setCollectionData('expenses', [
      {
        id: 'e1',
        label: 'Bâche',
        amountEuros: 80,
        date: `${YEAR}-04-01`,
        amortization: 'durable',
        lifespanYears: 5,
        recurrence: 'ponctuelle',
      },
    ])

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
