import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '../data/db'
import { SeasonSummaryPage } from './SeasonSummaryPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('SeasonSummaryPage', () => {
  it('affiche un message si aucune donnee pour l annee courante', async () => {
    render(<SeasonSummaryPage />)
    await waitFor(() => {
      expect(screen.getByText(/Rien à montrer pour/)).toBeInTheDocument()
    })
  })

  it('affiche le bilan par culture et par parcelle', async () => {
    const parcelId = await db.parcels.add({ name: 'Carré nord', areaM2: 8 })
    const cropId = await db.crops.add({
      name: 'Tomates',
      status: 'en_recolte',
      parcelId,
      pricePerKg: 3,
    })
    const year = new Date().getFullYear()
    await db.log.add({
      type: 'recolte',
      date: `${year}-06-01`,
      cropId,
      parcelId,
      quantityKg: 4,
      createdAt: Date.now(),
    })

    render(<SeasonSummaryPage />)
    await waitFor(() => {
      expect(screen.getAllByText('Tomates').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Carré nord').length).toBeGreaterThan(0)
      expect(screen.getAllByText(/4 kg/).length).toBeGreaterThan(0)
    })
  })

  it('permet de saisir une note de culture et une note de parcelle, et les persiste', async () => {
    const parcelId = await db.parcels.add({ name: 'Carré nord', areaM2: 8 })
    const cropId = await db.crops.add({
      name: 'Tomates',
      status: 'en_recolte',
      parcelId,
      pricePerKg: 3,
    })
    const year = new Date().getFullYear()
    await db.log.add({
      type: 'recolte',
      date: `${year}-06-01`,
      cropId,
      parcelId,
      quantityKg: 4,
      createdAt: Date.now(),
    })

    render(<SeasonSummaryPage />)

    const cropNoteField = await screen.findByLabelText('À refaire ou à changer pour Tomates')
    fireEvent.change(cropNoteField, { target: { value: 'Espacer davantage les plants' } })
    fireEvent.blur(cropNoteField)

    const parcelNoteField = await screen.findByLabelText('Météo marquante pour Carré nord')
    fireEvent.change(parcelNoteField, { target: { value: 'Sécheresse en juillet' } })
    fireEvent.blur(parcelNoteField)

    await waitFor(async () => {
      const rows = await db.seasonNotes.toArray()
      expect(rows).toHaveLength(2)
      expect(rows.find((r) => r.cropId === cropId)?.text).toBe('Espacer davantage les plants')
      expect(rows.find((r) => r.parcelId === parcelId)?.text).toBe('Sécheresse en juillet')
    })
  })
})
