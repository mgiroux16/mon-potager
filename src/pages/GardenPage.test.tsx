import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db, newId } from '../data/db'
import { seedDatabase } from '../data/seed'
import { setCollectionData, getCollectionData, clearCollectionData } from '../test/firestoreHooksMock'
import { GardenPage } from './GardenPage'
import { describeLogEntry, type LogRefs } from '../services/logView'

vi.mock('../data/firestoreHooks', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreHooksMock
})

function seedLog(entry: Record<string, unknown>): Record<string, unknown> {
  const row = { id: newId(), createdAt: Date.now(), ...entry }
  setCollectionData('log', [...getCollectionData('log'), row])
  return row
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  clearCollectionData()
  await seedDatabase(db)
  // trees et catalog sont cloud-first : on recopie le seed Dexie dans le store mocke.
  setCollectionData('trees', (await db.trees.toArray()) as unknown as Record<string, unknown>[])
  setCollectionData('catalog', (await db.catalog.toArray()) as unknown as Record<string, unknown>[])
})

describe('GardenPage', () => {
  it('affiche les parcelles chargées', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getAllByText('Planche tomates').length).toBeGreaterThan(0)
    })
  })

  it('affiche une culture et un arbre du vrai jardin', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('Pommes de terre Agata')).toBeInTheDocument()
      expect(screen.getByText('Pommier Belchard')).toBeInTheDocument()
    })
  })

  it('permet d éditer le prix au kg d une culture', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('Pommes de terre Agata')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByLabelText('Renseigner le prix au kg')
    fireEvent.click(editButtons[0])

    const input = screen.getByLabelText('Prix au kg en euros')
    fireEvent.change(input, { target: { value: '2.5' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(screen.getByText(/2,5\s?€\/kg/)).toBeInTheDocument()
    })
  })

  it('propose un lien vers le bilan de saison', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Voir le bilan de saison/ })).toBeInTheDocument()
    })
  })

  it("n'affiche pas de rappel pour une parcelle jamais touchee (peut etre neuve), jardin seede sans activite", async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getAllByText('Planche tomates').length).toBeGreaterThan(0)
    })
    expect(screen.queryByRole('heading', { name: 'Rappels' })).not.toBeInTheDocument()
  })

  it('affiche une section Rappels pour une parcelle a culture active sans activite depuis 21+ j', async () => {
    const old = new Date()
    old.setDate(old.getDate() - 25)
    seedLog({
      type: 'observation',
      date: old.toISOString().slice(0, 10),
      parcelId: 'parcel-1',
    })
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Rappels' })).toBeInTheDocument()
    })
    expect(screen.getByText('Planche tomates : Rien depuis 25 j')).toBeInTheDocument()
  })

  it('n affiche pas la section Rappels quand toutes les parcelles ont une activite recente et aucune culture n est mure', async () => {
    await db.parcels.clear()
    await db.crops.clear()
    const parcelId = await db.parcels.add({ id: newId(), name: 'Carré test' })
    seedLog({
      type: 'observation',
      date: new Date().toISOString().slice(0, 10),
      parcelId,
    })
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      // present aussi comme option du select de rattachement des arbres
      expect(screen.getAllByText('Carré test').length).toBeGreaterThan(0)
    })
    expect(screen.queryByRole('heading', { name: 'Rappels' })).not.toBeInTheDocument()
  })

  it('supprime une culture en doublon (softDelete) : elle disparait, les logs lies ne plantent pas', async () => {
    const seeded = seedLog({
      type: 'recolte',
      date: '2026-06-24',
      cropId: 'crop-2',
      quantityKg: 3,
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getByText('Pommes de terre Agata')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Supprimer la culture Pommes de terre Agata'))

    await waitFor(() => {
      expect(screen.queryByText('Pommes de terre Agata')).not.toBeInTheDocument()
    })

    // La culture est soft-deleted (tombstone), plus dans crops.toArray() : resolveTargetName
    // doit rester sans planter et simplement ne plus donner de nom pour cette culture.
    const remainingCrops = await db.crops.toArray()
    expect(remainingCrops.some((c) => c.id === 'crop-2')).toBe(false)
    const refs: LogRefs = { parcels: new Map(), crops: new Map(), oyas: new Map(), trees: new Map() }
    const entry = seeded as never
    expect(() => describeLogEntry(entry, refs)).not.toThrow()
    expect(describeLogEntry(entry, refs).target).toBeUndefined()
  })

  it('permet de creer une nouvelle parcelle par son nom', async () => {
    render(<GardenPage />, { wrapper: MemoryRouter })
    await waitFor(() => {
      expect(screen.getAllByText('Planche tomates').length).toBeGreaterThan(0)
    })
    fireEvent.click(screen.getByRole('button', { name: '+ Nouvelle parcelle' }))
    const input = screen.getByLabelText('Nom de la nouvelle parcelle')
    fireEvent.change(input, { target: { value: 'Carré nouvelle parcelle' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => {
      expect(screen.getAllByText('Carré nouvelle parcelle').length).toBeGreaterThan(0)
    })
  })
})
