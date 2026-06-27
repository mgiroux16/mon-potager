import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../data/db'
import { GardenMapPage } from './GardenMapPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

beforeEach(async () => {
  await db.parcels.clear()
  mockNavigate.mockClear()
})

describe('GardenMapPage', () => {
  it('affiche le contour du terrain', async () => {
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    expect(await screen.findByTestId('garden-map-surface')).toBeInTheDocument()
  })

  it('affiche les zones des parcelles ayant un mapPolygon', async () => {
    const id = await db.parcels.add({
      name: 'Planche tomates',
      mapPolygon: [{ x: 0.4, y: 0.3 }, { x: 0.6, y: 0.3 }, { x: 0.6, y: 0.5 }, { x: 0.4, y: 0.5 }],
    })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByTestId(`map-zone-${id}`)).toBeInTheDocument()
      expect(screen.getByText('Planche tomates')).toBeInTheDocument()
    })
  })

  it('tap sur une zone navigue vers le formulaire d arrosage preremplit', async () => {
    const id = await db.parcels.add({
      name: 'Planche tomates',
      mapPolygon: [{ x: 0.4, y: 0.3 }, { x: 0.6, y: 0.3 }, { x: 0.6, y: 0.5 }, { x: 0.4, y: 0.5 }],
    })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    const zone = await screen.findByTestId(`map-zone-${id}`)
    fireEvent.click(zone)
    expect(mockNavigate).toHaveBeenCalledWith('/ajouter', {
      state: { voiceDraft: { type: 'arrosage', parcelId: id } },
    })
  })

  it('permet de tracer une nouvelle zone et de l associer a une parcelle existante', async () => {
    const id = await db.parcels.add({ name: 'Rang pommes de terre' })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    fireEvent.click(await screen.findByText('+ Nouvelle zone'))
    fireEvent.click(screen.getByText('Rectangle'))
    fireEvent.click(screen.getByText('Valider la forme'))

    const select = await screen.findByLabelText('Parcelle existante')
    fireEvent.change(select, { target: { value: String(id) } })
    fireEvent.click(screen.getByText('Enregistrer'))

    await waitFor(async () => {
      const parcel = await db.parcels.get(id)
      expect(parcel?.mapPolygon?.length).toBe(4)
    })
  })

  it('permet de creer une nouvelle parcelle directement depuis la carte', async () => {
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    fireEvent.click(await screen.findByText('+ Nouvelle zone'))
    fireEvent.click(screen.getByText('Triangle'))
    fireEvent.click(screen.getByText('Valider la forme'))

    const input = await screen.findByLabelText('Nouvelle parcelle')
    fireEvent.change(input, { target: { value: 'Zone fraisiers' } })
    fireEvent.click(screen.getByText('Enregistrer'))

    await waitFor(async () => {
      const all = await db.parcels.toArray()
      expect(all.some((p) => p.name === 'Zone fraisiers' && p.mapPolygon?.length === 3)).toBe(true)
    })
  })
})
