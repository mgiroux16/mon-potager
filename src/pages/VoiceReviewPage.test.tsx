import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../data/db'
import { listLog } from '../services/logService'
import { VoiceReviewPage } from './VoiceReviewPage'

const h = vi.hoisted(() => ({ navigateSpy: vi.fn() }))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => h.navigateSpy }
})

vi.mock('../services/weatherService', () => ({
  fetchTodaySnapshot: vi.fn(async () => null),
  fetchDailyHistory: vi.fn(async () => null),
}))

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  h.navigateSpy.mockClear()
})

function renderReview(voiceDrafts: unknown[]) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/revue-vocale', state: { voiceDrafts } }]}>
      <VoiceReviewPage />
    </MemoryRouter>,
  )
}

describe('VoiceReviewPage', () => {
  it('affiche une carte resumee par action detectee', () => {
    renderReview([
      { type: 'recolte', quantityKg: 3 },
      { type: 'arrosage', volumeLiters: 20 },
    ])

    expect(screen.getByText('Récolte')).toBeInTheDocument()
    expect(screen.getByText('3 kg')).toBeInTheDocument()
    expect(screen.getByText('Arrosage')).toBeInTheDocument()
    expect(screen.getByText('20 L')).toBeInTheDocument()
  })

  it('Valider ecrit l entree en base et retire la carte', async () => {
    const user = userEvent.setup()
    renderReview([
      { type: 'recolte', quantityKg: 3, date: '2026-06-20' },
      { type: 'arrosage', volumeLiters: 20, date: '2026-06-20' },
    ])

    await user.click(screen.getAllByRole('button', { name: 'Valider' })[0])

    await waitFor(async () => {
      const all = await listLog()
      expect(all).toHaveLength(1)
    })
    const [entry] = await listLog()
    expect(entry.type).toBe('recolte')
    expect(entry.quantityKg).toBe(3)
    expect(screen.queryByText('3 kg')).not.toBeInTheDocument()
    expect(screen.getByText('Arrosage')).toBeInTheDocument()
  })

  it('Supprimer retire la carte sans rien ecrire en base', async () => {
    const user = userEvent.setup()
    renderReview([
      { type: 'recolte', quantityKg: 3, date: '2026-06-20' },
      { type: 'arrosage', volumeLiters: 20, date: '2026-06-20' },
    ])

    await user.click(screen.getAllByRole('button', { name: 'Supprimer' })[0])

    expect(screen.queryByText('3 kg')).not.toBeInTheDocument()
    const all = await listLog()
    expect(all).toHaveLength(0)
  })

  it('Modifier ouvre EntryForm preremplie ; sauvegarder retire la carte', async () => {
    const user = userEvent.setup()
    renderReview([{ type: 'arrosage', volumeLiters: 15, date: '2026-06-20' }])

    await user.click(screen.getByRole('button', { name: 'Modifier' }))
    expect(screen.getByLabelText('Volume (litres)')).toHaveValue(15)

    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(async () => {
      const all = await listLog()
      expect(all).toHaveLength(1)
    })
    expect((await listLog())[0].volumeLiters).toBe(15)
  })

  it('derniere carte traitee navigue vers le journal', async () => {
    const user = userEvent.setup()
    renderReview([{ type: 'recolte', quantityKg: 3, date: '2026-06-20' }])

    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(() => {
      expect(h.navigateSpy).toHaveBeenCalledWith('/journal', { replace: true })
    })
  })

  it('Modifier puis Retour laisse la carte intacte dans la liste', async () => {
    const user = userEvent.setup()
    renderReview([
      { type: 'arrosage', volumeLiters: 15, date: '2026-06-20' },
      { type: 'recolte', quantityKg: 3, date: '2026-06-20' },
    ])

    await user.click(screen.getAllByRole('button', { name: 'Modifier' })[0])
    expect(screen.getByLabelText('Volume (litres)')).toHaveValue(15)

    await user.click(screen.getByRole('button', { name: 'Retour' }))

    expect(screen.getByText('15 L')).toBeInTheDocument()
    expect(screen.getByText('3 kg')).toBeInTheDocument()
    const all = await listLog()
    expect(all).toHaveLength(0)
  })

  it('Valider sauvegarde une date par defaut quand le brouillon n en a pas', async () => {
    const user = userEvent.setup()
    renderReview([{ type: 'observation', description: 'tout va bien' }])

    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(async () => {
      const all = await listLog()
      expect(all).toHaveLength(1)
    })
    const [entry] = await listLog()
    expect(typeof entry.date).toBe('string')
    expect(entry.date.length).toBeGreaterThan(0)
  })
})
