import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../data/db'
import { seedDatabase } from '../data/seed'
import { GardenPage } from './GardenPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await seedDatabase(db)
})

describe('GardenPage', () => {
  it('affiche les parcelles chargées', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('Planche tomates')).toBeInTheDocument()
    })
  })

  it('affiche une culture et un arbre du vrai jardin', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('Pommes de terre Agata')).toBeInTheDocument()
      expect(screen.getByText('Pommier Belchard')).toBeInTheDocument()
    })
  })

  it('permet d éditer le prix au kg d une culture', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('Pommes de terre Agata')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByLabelText('Renseigner le prix au kg')
    fireEvent.click(editButtons[0])

    const input = screen.getByLabelText('Prix au kg en euros')
    fireEvent.change(input, { target: { value: '2.5' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(screen.getByText(/2,5\s?€\/kg/)).toBeInTheDocument()
    })
  })

  it('propose un lien vers le bilan de saison', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Voir le bilan de saison/ })).toBeInTheDocument()
    })
  })
})
