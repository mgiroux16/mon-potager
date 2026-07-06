import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { db, newId } from '../data/db'
import { setCollectionData, clearCollectionData } from '../test/firestoreHooksMock'
import { HarvestPage } from './HarvestPage'

vi.mock('../data/firestoreHooks', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreHooksMock
})

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  clearCollectionData()
})

describe('HarvestPage', () => {
  it('affiche un message si aucune récolte', async () => {
    render(<HarvestPage />)
    await waitFor(() => {
      expect(screen.getByText('Pas encore de récolte enregistrée')).toBeInTheDocument()
    })
  })

  it('affiche le bilan groupé par légume avec le total en kg et en euros', async () => {
    const cropId = await db.crops.add({ id: newId(), name: 'Tomates', status: 'en_recolte', pricePerKg: 3 })
    setCollectionData('log', [
      {
        id: newId(), type: 'recolte',
        date: '2026-06-01',
        cropId,
        quantityKg: 4,
        createdAt: Date.now(),
      },
    ])

    render(<HarvestPage />)
    await waitFor(() => {
      expect(screen.getByText('Tomates')).toBeInTheDocument()
      expect(screen.getAllByText(/4 kg/).length).toBeGreaterThan(0)
      expect(screen.getByText(/· 12\s?€/)).toBeInTheDocument()
    })
  })
})
