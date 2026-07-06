import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { db, newId } from '../data/db'
import { setCollectionData, getCollectionData, clearCollectionData } from '../test/firestoreHooksMock'
import { WaterPage } from './WaterPage'

vi.mock('../data/firestoreHooks', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreHooksMock
})

function seedLog(entry: Record<string, unknown>): void {
  setCollectionData('log', [...getCollectionData('log'), { id: newId(), createdAt: Date.now(), ...entry }])
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  clearCollectionData()
})

describe('WaterPage', () => {
  it('affiche un message si aucun arrosage chiffré', async () => {
    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText("Pas encore d'arrosage enregistré")).toBeInTheDocument()
    })
  })

  it('affiche le cumul par parcelle pour les fenetres glissantes et l annee', async () => {
    const parcelId = await db.parcels.add({ id: newId(), name: 'Carrés du fond' })
    seedLog({
      type: 'arrosage',
      date: new Date().toISOString().slice(0, 10),
      parcelId,
      volumeLiters: 5,
    })

    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getAllByText('Carrés du fond').length).toBeGreaterThan(0)
      expect(screen.getByText(/7j : 5 L · 14j : 5 L · 30j : 5 L/)).toBeInTheDocument()
      expect(screen.getByText(/Année : 5 L/)).toBeInTheDocument()
    })
  })

  it('affiche plusieurs parcelles', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const p1 = await db.parcels.add({ id: newId(), name: 'Carrés du fond' })
    const p2 = await db.parcels.add({ id: newId(), name: 'Allée' })
    seedLog({ type: 'arrosage', date: today, parcelId: p1, volumeLiters: 5 })
    seedLog({ type: 'arrosage', date: today, parcelId: p2, volumeLiters: 8 })

    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getAllByText('Carrés du fond').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Allée').length).toBeGreaterThan(0)
    })
  })

  it('affiche la reserve totale et l autonomie en jours', async () => {
    await db.tanks.bulkAdd([
      { id: newId(), name: 'Cuve 1', capacityLiters: 500, estimatedLiters: 300 },
      { id: newId(), name: 'Cuve 2', capacityLiters: 500, estimatedLiters: 200 },
    ])
    const parcelId = await db.parcels.add({ id: newId(), name: 'Carrés du fond' })
    const today = new Date().toISOString().slice(0, 10)
    seedLog({ type: 'arrosage', date: today, parcelId, volumeLiters: 35 })

    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText("Réserve d'eau : 500 / 1000 L")).toBeInTheDocument()
      expect(screen.getByText('Autonomie : 100 jours')).toBeInTheDocument()
    })
  })

  it('affiche autonomie illimitee sans consommation recente', async () => {
    await db.tanks.bulkAdd([{ id: newId(), name: 'Cuve 1', capacityLiters: 500, estimatedLiters: 300 }])

    render(<WaterPage />)
    await waitFor(() => {
      expect(screen.getByText('Autonomie : illimitée')).toBeInTheDocument()
    })
  })

  it('permet d editer le niveau d une cuve et persiste la valeur', async () => {
    const tankId = await db.tanks.add({ id: newId(), name: 'Cuve 1', capacityLiters: 500, estimatedLiters: 300 })

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
