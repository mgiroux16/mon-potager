import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { HarvestPage } from './HarvestPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('HarvestPage', () => {
  it('affiche un message si aucune récolte', async () => {
    render(<HarvestPage />)
    await waitFor(() => {
      expect(screen.getByText('Pas encore de récolte enregistrée')).toBeInTheDocument()
    })
  })

  it('affiche le bilan groupé par légume avec le total en kg et en euros', async () => {
    const cropId = await db.crops.add({ name: 'Tomates', status: 'en_recolte', pricePerKg: 3 })
    await db.log.add({
      type: 'recolte',
      date: '2026-06-01',
      cropId,
      quantityKg: 4,
      createdAt: Date.now(),
    })

    render(<HarvestPage />)
    await waitFor(() => {
      expect(screen.getByText('Tomates')).toBeInTheDocument()
      expect(screen.getAllByText(/4 kg/).length).toBeGreaterThan(0)
      expect(screen.getByText(/· 12\s?€/)).toBeInTheDocument()
    })
  })
})
