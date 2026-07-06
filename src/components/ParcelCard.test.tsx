import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { newId } from '../data/db'
import {
  setCollectionData,
  getCollectionData,
  clearCollectionData,
} from '../test/firestoreHooksMock'
import type { Parcel } from '../data/model'
import { ParcelCard } from './ParcelCard'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../data/firestoreHooks', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreHooksMock
})
vi.mock('../data/firestoreWrites', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreWritesMock
})

function seedParcel(row: Record<string, unknown>): Parcel {
  const parcel = { id: newId(), ...row } as Parcel
  setCollectionData('parcels', [
    ...getCollectionData('parcels'),
    parcel as unknown as Record<string, unknown>,
  ])
  return parcel
}

function getParcel(id: string): Record<string, unknown> | undefined {
  return getCollectionData('parcels').find((p) => p.id === id)
}

beforeEach(() => {
  clearCollectionData()
  mockNavigate.mockClear()
})

describe('ParcelCard', () => {
  it('affiche le nom seul en repli sans photo ni polygone', () => {
    const parcel = seedParcel({ name: 'Carré sans photo' })
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    expect(screen.getByText('Carré sans photo')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('affiche la photo et la zone cliquable quand photoUrl et polygon sont presents', () => {
    const parcel = seedParcel({
      name: 'Planche tomates',
      photoUrl: 'data:image/jpeg;base64,X',
      polygon: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.5, y: 0.9 }],
    })
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    expect(screen.getByRole('img', { name: 'Planche tomates' })).toBeInTheDocument()
  })

  it('tap dans la zone navigue vers le formulaire d arrosage preremplit', () => {
    const parcel = seedParcel({
      name: 'Planche tomates',
      photoUrl: 'data:image/jpeg;base64,X',
      polygon: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.5, y: 0.9 }],
    })
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    const zone = screen.getByTestId('parcel-zone')
    zone.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    fireEvent.click(zone, { clientX: 100, clientY: 50 })
    expect(mockNavigate).toHaveBeenCalledWith('/ajouter', {
      state: { voiceDraft: { type: 'arrosage', parcelId: parcel.id } },
    })
  })

  it('tap hors de la zone ne navigue pas', () => {
    const parcel = seedParcel({
      name: 'Planche tomates',
      photoUrl: 'data:image/jpeg;base64,X',
      polygon: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }, { x: 0.2, y: 0.3 }],
    })
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    const zone = screen.getByTestId('parcel-zone')
    zone.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect
    fireEvent.click(zone, { clientX: 190, clientY: 95 })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('permet de renommer la parcelle', async () => {
    const parcel = seedParcel({ name: 'Ancien nom' })
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByText('Ancien nom'))
    const input = screen.getByDisplayValue('Ancien nom')
    fireEvent.change(input, { target: { value: 'Nouveau nom' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(getParcel(parcel.id as string)?.name).toBe('Nouveau nom')
    })
  })

  it('permet de dupliquer la parcelle', async () => {
    const parcel = seedParcel({ name: 'Butte courges', areaM2: 12 })
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByLabelText('Dupliquer la parcelle'))
    await waitFor(() => {
      const copy = getCollectionData('parcels').find((p) => p.name === 'Butte courges (copie)')
      expect(copy).toBeDefined()
      expect(copy?.areaM2).toBe(12)
    })
  })

  it('permet de supprimer la parcelle apres confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const parcel = seedParcel({ name: 'A supprimer' })
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByLabelText('Supprimer la parcelle'))
    await waitFor(() => {
      expect(getParcel(parcel.id as string)).toBeUndefined()
    })
    vi.restoreAllMocks()
  })

  it('n efface pas la parcelle si la confirmation est annulee', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const parcel = seedParcel({ name: 'A garder' })
    render(<ParcelCard parcel={parcel} />, { wrapper: MemoryRouter })
    fireEvent.click(screen.getByLabelText('Supprimer la parcelle'))
    await waitFor(() => {
      expect(getParcel(parcel.id as string)).toBeDefined()
    })
    vi.restoreAllMocks()
  })
})
