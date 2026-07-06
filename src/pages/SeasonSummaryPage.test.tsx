import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { newId } from '../data/db'
import { setCollectionData, getCollectionData, clearCollectionData } from '../test/firestoreHooksMock'
import { SeasonSummaryPage } from './SeasonSummaryPage'

vi.mock('../data/firestoreHooks', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreHooksMock
})
vi.mock('../data/firestoreWrites', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreWritesMock
})

beforeEach(() => {
  clearCollectionData()
})

// Le bilan contient un <Link> vers /pilotage/argent : il faut un contexte Router.
function renderPage() {
  return render(
    <MemoryRouter>
      <SeasonSummaryPage />
    </MemoryRouter>,
  )
}


function seedRow(table: string, row: Record<string, unknown>): string {
  const id = (row.id as string | undefined) ?? newId()
  setCollectionData(table, [...getCollectionData(table), { ...row, id }])
  return id
}

describe('SeasonSummaryPage', () => {
  it('affiche un message si aucune donnee pour l annee courante', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Rien à montrer pour/)).toBeInTheDocument()
    })
  })

  it('affiche le bilan par culture et par parcelle', async () => {
    const parcelId = seedRow('parcels', { id: newId(), name: 'Carré nord', areaM2: 8 })
    const cropId = seedRow('crops', {
      id: newId(), name: 'Tomates',
      status: 'en_recolte',
      parcelId,
      pricePerKg: 3,
    })
    const year = new Date().getFullYear()
    setCollectionData('log', [
      { id: newId(), type: 'recolte', date: `${year}-06-01`, cropId, parcelId, quantityKg: 4, createdAt: Date.now() },
    ])

    renderPage()
    await waitFor(() => {
      expect(screen.getAllByText('Tomates').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Carré nord').length).toBeGreaterThan(0)
      expect(screen.getAllByText(/4 kg/).length).toBeGreaterThan(0)
    })
  })

  it('permet de saisir une note de culture et une note de parcelle, et les persiste', async () => {
    const parcelId = seedRow('parcels', { id: newId(), name: 'Carré nord', areaM2: 8 })
    const cropId = seedRow('crops', {
      id: newId(), name: 'Tomates',
      status: 'en_recolte',
      parcelId,
      pricePerKg: 3,
    })
    const year = new Date().getFullYear()
    setCollectionData('log', [
      { id: newId(), type: 'recolte', date: `${year}-06-01`, cropId, parcelId, quantityKg: 4, createdAt: Date.now() },
    ])

    renderPage()

    const cropNoteField = await screen.findByLabelText('À refaire ou à changer pour Tomates')
    fireEvent.change(cropNoteField, { target: { value: 'Espacer davantage les plants' } })
    fireEvent.blur(cropNoteField)

    const parcelNoteField = await screen.findByLabelText('Météo marquante pour Carré nord')
    fireEvent.change(parcelNoteField, { target: { value: 'Sécheresse en juillet' } })
    fireEvent.blur(parcelNoteField)

    await waitFor(() => {
      const rows = getCollectionData('seasonNotes')
      expect(rows).toHaveLength(2)
      expect(rows.find((r) => r.cropId === cropId)?.text).toBe('Espacer davantage les plants')
      expect(rows.find((r) => r.parcelId === parcelId)?.text).toBe('Sécheresse en juillet')
    })
  })
})
