import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db } from '../data/db'
import { WaterPage } from './WaterPage'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('WaterPage', () => {
  it('affiche un message si aucun arrosage chiffré', async () => {
    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText("Pas encore d'arrosage enregistré")).toBeInTheDocument()
    })
  })

  it('affiche le cumul par parcelle pour les fenetres glissantes et l annee', async () => {
    const parcelId = await db.parcels.add({ name: 'Carrés du fond' })
    await db.log.add({
      type: 'arrosage',
      date: new Date().toISOString().slice(0, 10),
      parcelId,
      volumeLiters: 5,
      createdAt: Date.now(),
    })

    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText('Carrés du fond')).toBeInTheDocument()
      expect(screen.getByText(/7j : 5 L/)).toBeInTheDocument()
      expect(screen.getByText(/14j : 5 L/)).toBeInTheDocument()
      expect(screen.getByText(/30j : 5 L/)).toBeInTheDocument()
      expect(screen.getByText(/Année : 5 L/)).toBeInTheDocument()
    })
  })

  it('affiche plusieurs parcelles', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const p1 = await db.parcels.add({ name: 'Carrés du fond' })
    const p2 = await db.parcels.add({ name: 'Allée' })
    await db.log.add({ type: 'arrosage', date: today, parcelId: p1, volumeLiters: 5, createdAt: Date.now() })
    await db.log.add({ type: 'arrosage', date: today, parcelId: p2, volumeLiters: 8, createdAt: Date.now() })

    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText('Carrés du fond')).toBeInTheDocument()
      expect(screen.getByText('Allée')).toBeInTheDocument()
    })
  })

  it('affiche la reserve totale et l autonomie en jours', async () => {
    await db.tanks.bulkAdd([
      { name: 'Cuve 1', capacityLiters: 500, estimatedLiters: 300 },
      { name: 'Cuve 2', capacityLiters: 500, estimatedLiters: 200 },
    ])
    const parcelId = await db.parcels.add({ name: 'Carrés du fond' })
    const today = new Date().toISOString().slice(0, 10)
    await db.log.add({ type: 'arrosage', date: today, parcelId, volumeLiters: 35, createdAt: Date.now() })

    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText("Réserve d'eau : 500 / 1000 L")).toBeInTheDocument()
      expect(screen.getByText('Autonomie : 100 jours')).toBeInTheDocument()
    })
  })

  it('affiche autonomie illimitee sans consommation recente', async () => {
    await db.tanks.bulkAdd([{ name: 'Cuve 1', capacityLiters: 500, estimatedLiters: 300 }])

    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText('Autonomie : illimitée')).toBeInTheDocument()
    })
  })

  it('permet d editer le niveau d une cuve et persiste la valeur', async () => {
    const tankId = await db.tanks.add({ name: 'Cuve 1', capacityLiters: 500, estimatedLiters: 300 })

    render(<WaterPage />)
    const input = await screen.findByLabelText('Niveau de Cuve 1 en litres')
    fireEvent.change(input, { target: { value: '450' } })
    fireEvent.blur(input)

    await waitFor(async () => {
      const updated = await db.tanks.get(tankId)
      expect(updated?.estimatedLiters).toBe(450)
    })
  })

  it('n affiche pas de section cuves si la table tanks est vide', async () => {
    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText("Réserve d'eau : 0 / 0 L")).toBeInTheDocument()
    })
    expect(screen.queryByLabelText(/Niveau de .* en litres/)).not.toBeInTheDocument()
  })
})
