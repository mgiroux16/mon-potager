import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '../data/db'
import { seedDatabase } from '../data/seed'
import { GardenPage } from './GardenPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await seedDatabase(db)
})

describe('GardenPage', () => {
  it('affiche les parcelles chargées', async () => {
    render(<GardenPage />)
    await waitFor(() => {
      expect(screen.getByText('Planche tomates')).toBeInTheDocument()
    })
  })

  it('affiche une culture et un arbre du vrai jardin', async () => {
    render(<GardenPage />)
    await waitFor(() => {
      expect(screen.getByText('Pommes de terre Agata')).toBeInTheDocument()
      expect(screen.getByText('Pommier Belchard')).toBeInTheDocument()
    })
  })
})
