import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
})
