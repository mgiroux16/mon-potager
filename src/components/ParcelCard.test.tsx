import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db, newId } from '../data/db'
import { ParcelCard } from './ParcelCard'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

beforeEach(async () => {
  await db.parcels.clear()
  mockNavigate.mockClear()
})

describe('ParcelCard', () => {
  it('affiche le nom seul en repli sans photo ni polygone', async () => {
    const id = await db.parcels.add({ id: newId(), name: 'Carré sans photo' })
    const parcel = (await db.parcels.get(id))!
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    expect(screen.getByText('Carré sans photo')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('affiche la photo et la zone cliquable quand photoUrl et polygon sont presents', async () => {
    const id = await db.parcels.add({
      id: newId(), name: 'Planche tomates',
      photoUrl: 'data:image/jpeg;base64,X',
      polygon: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.5, y: 0.9 }],
    })
    const parcel = (await db.parcels.get(id))!
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    expect(screen.getByRole('img', { name: 'Planche tomates' })).toBeInTheDocument()
  })

  it('tap dans la zone navigue vers le formulaire d arrosage preremplit', async () => {
    const id = await db.parcels.add({
      id: newId(), name: 'Planche tomates',
      photoUrl: 'data:image/jpeg;base64,X',
      polygon: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.5, y: 0.9 }],
    })
    const parcel = (await db.parcels.get(id))!
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    const zone = screen.getByTestId('parcel-zone')
    zone.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    fireEvent.click(zone, { clientX: 100, clientY: 50 })
    expect(mockNavigate).toHaveBeenCalledWith('/ajouter', {
      state: { voiceDraft: { type: 'arrosage', parcelId: id } },
    })
  })

  it('tap hors de la zone ne navigue pas', async () => {
    const id = await db.parcels.add({
      id: newId(), name: 'Planche tomates',
      photoUrl: 'data:image/jpeg;base64,X',
      polygon: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.2, y: 0.3 }],
    })
    const parcel = (await db.parcels.get(id))!
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    const zone = screen.getByTestId('parcel-zone')
    zone.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    fireEvent.click(zone, { clientX: 190, clientY: 95 })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('permet de renommer la parcelle', async () => {
    const id = await db.parcels.add({ id: newId(), name: 'Ancien nom' })
    const parcel = (await db.parcels.get(id))!
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByText('Ancien nom'))
    const input = screen.getByDisplayValue('Ancien nom')
    fireEvent.change(input, { target: { value: 'Nouveau nom' } })
    fireEvent.blur(input)
    await waitFor(async () => {
      expect((await db.parcels.get(id))?.name).toBe('Nouveau nom')
    })
  })

  it('permet de supprimer la parcelle apres confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const id = await db.parcels.add({ id: newId(), name: 'A supprimer' })
    const parcel = (await db.parcels.get(id))!
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByLabelText('Supprimer la parcelle'))
    await waitFor(async () => {
      expect(await db.parcels.get(id)).toBeUndefined()
    })
    vi.restoreAllMocks()
  })

  it('n efface pas la parcelle si la confirmation est annulee', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const id = await db.parcels.add({ id: newId(), name: 'A garder' })
    const parcel = (await db.parcels.get(id))!
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByLabelText('Supprimer la parcelle'))
    await waitFor(async () => {
      expect(await db.parcels.get(id)).toBeDefined()
    })
    vi.restoreAllMocks()
  })
})
