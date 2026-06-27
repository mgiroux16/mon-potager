import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db, newId } from '../data/db'
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
  it('affiche la grille', async () => {
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    expect(await screen.findByTestId('garden-map-grid')).toBeInTheDocument()
  })

  it('affiche un bloc pour chaque parcelle placee sur la carte', async () => {
    const id = await db.parcels.add({
      id: newId(), name: 'Planche tomates',
      mapX: 0,
      mapY: 0,
      mapWidth: 2,
      mapHeight: 2,
      mapRotation: 0,
    })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    expect(await screen.findByTestId(`map-block-${id}`)).toHaveTextContent('Planche tomates')
  })

  it('liste les parcelles non placees a part, avec un bouton pour les placer', async () => {
    const id = await db.parcels.add({ id: newId(), name: 'Rang pommes de terre' })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    expect(await screen.findByText('Rang pommes de terre')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Placer sur la carte'))
    await waitFor(async () => {
      const parcel = await db.parcels.get(id)
      expect(parcel?.mapWidth).toBe(2)
      expect(parcel?.mapHeight).toBe(2)
    })
  })

  it('un clic simple (sans deplacement) selectionne le bloc et affiche les actions', async () => {
    const id = await db.parcels.add({ id: newId(), name: 'Planche tomates', mapX: 0, mapY: 0, mapWidth: 2, mapHeight: 2 })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    const block = await screen.findByTestId(`map-block-${id}`)
    fireEvent.mouseDown(block, { clientX: 10, clientY: 10 })
    fireEvent.mouseUp(screen.getByTestId('garden-map-grid'), { clientX: 10, clientY: 10 })
    expect(screen.getByText('Rotation')).toBeInTheDocument()
    expect(screen.getByText('Arroser')).toBeInTheDocument()
  })

  it('le bouton Arroser navigue vers le formulaire d arrosage preremplit', async () => {
    const id = await db.parcels.add({ id: newId(), name: 'Planche tomates', mapX: 0, mapY: 0, mapWidth: 2, mapHeight: 2 })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    const block = await screen.findByTestId(`map-block-${id}`)
    fireEvent.mouseDown(block, { clientX: 10, clientY: 10 })
    fireEvent.mouseUp(screen.getByTestId('garden-map-grid'), { clientX: 10, clientY: 10 })
    fireEvent.click(screen.getByText('Arroser'))
    expect(mockNavigate).toHaveBeenCalledWith('/ajouter', {
      state: { voiceDraft: { type: 'arrosage', parcelId: id } },
    })
  })

  it('Rotation fait avancer la rotation de 90 degres', async () => {
    const id = await db.parcels.add({
      id: newId(), name: 'Planche tomates',
      mapX: 0,
      mapY: 0,
      mapWidth: 2,
      mapHeight: 2,
      mapRotation: 0,
    })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    const block = await screen.findByTestId(`map-block-${id}`)
    fireEvent.mouseDown(block, { clientX: 10, clientY: 10 })
    fireEvent.mouseUp(screen.getByTestId('garden-map-grid'), { clientX: 10, clientY: 10 })
    fireEvent.click(screen.getByText('Rotation'))
    await waitFor(async () => {
      const parcel = await db.parcels.get(id)
      expect(parcel?.mapRotation).toBe(90)
    })
  })

  it('Dupliquer cree une copie avec un nom suffixe', async () => {
    const id = await db.parcels.add({ id: newId(), name: 'Planche tomates', mapX: 0, mapY: 0, mapWidth: 2, mapHeight: 2 })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    const block = await screen.findByTestId(`map-block-${id}`)
    fireEvent.mouseDown(block, { clientX: 10, clientY: 10 })
    fireEvent.mouseUp(screen.getByTestId('garden-map-grid'), { clientX: 10, clientY: 10 })
    fireEvent.click(screen.getByText('Dupliquer'))
    await waitFor(async () => {
      const all = await db.parcels.toArray()
      expect(all.some((p) => p.name === 'Planche tomates (copie)')).toBe(true)
    })
  })

  it('un glisser-deposer met a jour la position de la parcelle', async () => {
    const id = await db.parcels.add({ id: newId(), name: 'Planche tomates', mapX: 0, mapY: 0, mapWidth: 2, mapHeight: 2 })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    const block = await screen.findByTestId(`map-block-${id}`)
    const grid = screen.getByTestId('garden-map-grid')
    fireEvent.mouseDown(block, { clientX: 0, clientY: 0 })
    fireEvent.mouseMove(grid, { clientX: 64, clientY: 32 })
    fireEvent.mouseUp(grid, { clientX: 64, clientY: 32 })
    await waitFor(async () => {
      const parcel = await db.parcels.get(id)
      expect(parcel?.mapX).toBe(2)
      expect(parcel?.mapY).toBe(1)
    })
  })

  it('+ Nouvelle parcelle ajoute un bloc 2x2 directement place', async () => {
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    fireEvent.click(await screen.findByText('+ Nouvelle parcelle'))
    await waitFor(async () => {
      const all = await db.parcels.toArray()
      expect(all.some((p) => p.name === 'Nouvelle zone' && p.mapWidth === 2)).toBe(true)
    })
  })
})
