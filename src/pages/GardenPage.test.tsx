import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db, newId } from '../data/db'
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
      expect(screen.getAllByText('Planche tomates').length).toBeGreaterThan(0)
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

  it('affiche une section Rappels pour les parcelles jamais touchees du jardin seede', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Rappels' })).toBeInTheDocument()
    })
    expect(screen.getAllByText('Planche tomates').length).toBeGreaterThan(0)
  })

  it('n affiche pas la section Rappels quand toutes les parcelles ont une activite recente et aucune culture n est mure', async () => {
    await db.parcels.clear()
    await db.crops.clear()
    const parcelId = await db.parcels.add({ id: newId(), name: 'Carré test' })
    await db.log.add({
      id: newId(), type: 'observation',
      date: new Date().toISOString().slice(0, 10),
      parcelId,
      createdAt: Date.now(),
    })
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('Carré test')).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { name: 'Rappels' })).not.toBeInTheDocument()
  })

  it('permet de creer une nouvelle parcelle par son nom', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getAllByText('Planche tomates').length).toBeGreaterThan(0)
    })
    fireEvent.click(screen.getByRole('button', { name: '+ Nouvelle parcelle' }))
    const input = screen.getByLabelText('Nom de la nouvelle parcelle')
    fireEvent.change(input, { target: { value: 'Carré nouvelle parcelle' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(screen.getAllByText('Carré nouvelle parcelle').length).toBeGreaterThan(0)
    })
  })
})
