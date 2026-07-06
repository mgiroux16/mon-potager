import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { newId } from '../data/db'
import {
  setCollectionData,
  getCollectionData,
  clearCollectionData,
} from '../test/firestoreHooksMock'
import { GardenMapPage } from './GardenMapPage'

vi.mock('../data/firestoreHooks', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreHooksMock
})
vi.mock('../data/firestoreWrites', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreWritesMock
})

// Equivalents de l'ancien db.parcels : seed et lecture du store cloud mocke.
function seedParcel(row: Record<string, unknown>): string {
  const id = (row.id as string | undefined) ?? newId()
  setCollectionData('parcels', [...getCollectionData('parcels'), { ...row, id }])
  return id
}

function getParcel(id: string): Record<string, unknown> | undefined {
  return getCollectionData('parcels').find((r) => r.id === id)
}

function allParcels(): Record<string, unknown>[] {
  return getCollectionData('parcels')
}

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

beforeEach(() => {
  clearCollectionData()
  mockNavigate.mockClear()
})

describe('GardenMapPage', () => {
  it('affiche la grille', async () => {
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    expect(await screen.findByTestId('garden-map-grid')).toBeInTheDocument()
  })

  it('affiche un bloc pour chaque parcelle placee sur la carte', async () => {
    const id = seedParcel({
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
    const id = seedParcel({ id: newId(), name: 'Rang pommes de terre' })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    expect(await screen.findByText('Rang pommes de terre')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Placer sur la carte'))
    await waitFor(async () => {
      const parcel = getParcel(id)
      expect(parcel?.mapWidth).toBe(2)
      expect(parcel?.mapHeight).toBe(2)
    })
  })

  it('un clic simple (sans deplacement) selectionne le bloc et affiche les actions', async () => {
    const id = seedParcel({ id: newId(), name: 'Planche tomates', mapX: 0, mapY: 0, mapWidth: 2, mapHeight: 2 })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    const block = await screen.findByTestId(`map-block-${id}`)
    fireEvent.mouseDown(block, { clientX: 10, clientY: 10 })
    fireEvent.mouseUp(screen.getByTestId('garden-map-grid'), { clientX: 10, clientY: 10 })
    expect(screen.getByText('Rotation')).toBeInTheDocument()
    expect(screen.getByText('Arroser')).toBeInTheDocument()
  })

  it('la selection d une tuile affiche le menu d actions ancre dessus', async () => {
    const id = seedParcel({ id: newId(), name: 'Planche tomates', mapX: 0, mapY: 0, mapWidth: 2, mapHeight: 2 })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    const block = await screen.findByTestId(`map-block-${id}`)
    expect(screen.queryByTestId('parcel-context-menu')).not.toBeInTheDocument()

    fireEvent.mouseDown(block, { clientX: 10, clientY: 10 })
    fireEvent.mouseUp(screen.getByTestId('garden-map-grid'), { clientX: 10, clientY: 10 })

    expect(screen.getByTestId('parcel-context-menu')).toBeInTheDocument()
    expect(screen.getByText('Rotation')).toBeInTheDocument()
  })

  it('le clic droit sur une tuile ouvre le menu et bloque le menu natif', async () => {
    const id = seedParcel({ id: newId(), name: 'Planche tomates', mapX: 0, mapY: 0, mapWidth: 2, mapHeight: 2 })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    const block = await screen.findByTestId(`map-block-${id}`)

    const event = fireEvent.contextMenu(block)

    expect(event).toBe(false) // preventDefault() appele => l evenement est marque annule
    expect(screen.getByTestId('parcel-context-menu')).toBeInTheDocument()
  })

  it('un clic en dehors de la tuile et du menu ferme le menu', async () => {
    const id = seedParcel({ id: newId(), name: 'Planche tomates', mapX: 0, mapY: 0, mapWidth: 2, mapHeight: 2 })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    const block = await screen.findByTestId(`map-block-${id}`)
    fireEvent.mouseDown(block, { clientX: 10, clientY: 10 })
    fireEvent.mouseUp(screen.getByTestId('garden-map-grid'), { clientX: 10, clientY: 10 })
    expect(screen.getByTestId('parcel-context-menu')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)

    expect(screen.queryByTestId('parcel-context-menu')).not.toBeInTheDocument()
  })

  it('le bouton Arroser navigue vers le formulaire d arrosage preremplit', async () => {
    const id = seedParcel({ id: newId(), name: 'Planche tomates', mapX: 0, mapY: 0, mapWidth: 2, mapHeight: 2 })
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
    const id = seedParcel({
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
      const parcel = getParcel(id)
      expect(parcel?.mapRotation).toBe(90)
    })
  })

  it('Dupliquer cree une copie avec un nom suffixe', async () => {
    const id = seedParcel({ id: newId(), name: 'Planche tomates', mapX: 0, mapY: 0, mapWidth: 2, mapHeight: 2 })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    const block = await screen.findByTestId(`map-block-${id}`)
    fireEvent.mouseDown(block, { clientX: 10, clientY: 10 })
    fireEvent.mouseUp(screen.getByTestId('garden-map-grid'), { clientX: 10, clientY: 10 })
    fireEvent.click(screen.getByText('Dupliquer'))
    await waitFor(async () => {
      const all = allParcels()
      expect(all.some((p) => p.name === 'Planche tomates (copie)')).toBe(true)
    })
  })

  it('un glisser-deposer met a jour la position de la parcelle', async () => {
    const id = seedParcel({ id: newId(), name: 'Planche tomates', mapX: 0, mapY: 0, mapWidth: 2, mapHeight: 2 })
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    const block = await screen.findByTestId(`map-block-${id}`)
    const grid = screen.getByTestId('garden-map-grid')
    fireEvent.mouseDown(block, { clientX: 0, clientY: 0 })
    fireEvent.mouseMove(grid, { clientX: 64, clientY: 32 })
    fireEvent.mouseUp(grid, { clientX: 64, clientY: 32 })
    await waitFor(async () => {
      const parcel = getParcel(id)
      expect(parcel?.mapX).toBe(2)
      expect(parcel?.mapY).toBe(1)
    })
  })

  it('+ Nouvelle parcelle ajoute un bloc 2x2 directement place', async () => {
    render(<GardenMapPage />, { wrapper: MemoryRouter })
    fireEvent.click(await screen.findByText('+ Nouvelle parcelle'))
    await waitFor(async () => {
      const all = allParcels()
      expect(all.some((p) => p.name === 'Nouvelle zone' && p.mapWidth === 2)).toBe(true)
    })
  })
})
