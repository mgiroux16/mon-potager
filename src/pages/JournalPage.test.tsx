import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db, newId } from '../data/db'
import { addLogEntry } from '../services/logService'
import { JournalPage } from './JournalPage'

vi.mock('../services/weatherService', () => ({
  fetchDailyHistory: vi.fn(async () => [
    { date: '2026-06-23', tempMaxC: 43.3, tempMinC: 26.1, rainMm: 0 },
    { date: '2026-06-24', tempMaxC: 42.9, tempMinC: 24.4, rainMm: 0 },
    { date: '2026-06-25', tempMaxC: 40.6, tempMinC: 26.4, rainMm: 0 },
  ]),
  fetchTodaySnapshot: vi.fn(async () => null),
  __clearWeatherCache: vi.fn(),
}))

const callGemini = vi.fn(async () => '[{"text":"h","indices":"i","confidence":"faible"}]')
const callGeminiVision = vi.fn(async () => '[{"text":"h","indices":"i","confidence":"faible"}]')
vi.mock('../services/geminiService', () => ({
  callGemini: (...args: unknown[]) => callGemini(...(args as [])),
  callGeminiVision: (...args: unknown[]) => callGeminiVision(...(args as [])),
}))

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

function renderJournal() {
  return render(
    <MemoryRouter>
      <JournalPage />
    </MemoryRouter>,
  )
}

describe('JournalPage', () => {
  it('affiche les entrées du journal', async () => {
    await addLogEntry({ type: 'arrosage', date: '2026-06-24', volumeLiters: 30 })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    renderJournal()
    await waitFor(() => {
      expect(screen.getByText('30 L')).toBeInTheDocument()
      expect(screen.getByText('2 kg')).toBeInTheDocument()
    })
  })

  it('un filtre de type masque les entrées des autres types', async () => {
    await addLogEntry({ type: 'arrosage', date: '2026-06-24', volumeLiters: 30 })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    renderJournal()
    await waitFor(() => expect(screen.getByText('30 L')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Récolte' }))

    expect(screen.queryByText('30 L')).not.toBeInTheDocument()
    expect(screen.getByText('2 kg')).toBeInTheDocument()
  })

  it('le filtre Arrosage masque les entrées des autres types', async () => {
    await addLogEntry({ type: 'arrosage', date: '2026-06-24', volumeLiters: 30 })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    renderJournal()
    await waitFor(() => expect(screen.getByText('2 kg')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Arrosage' }))

    expect(screen.getByText('30 L')).toBeInTheDocument()
    expect(screen.queryByText('2 kg')).not.toBeInTheDocument()
  })

  it('supprime une entrée (softDelete) : elle disparaît, les autres restent', async () => {
    await addLogEntry({ type: 'arrosage', date: '2026-06-24', volumeLiters: 30 })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderJournal()
    await waitFor(() => expect(screen.getByText('30 L')).toBeInTheDocument())

    const user = userEvent.setup()
    const arrosageItem = screen.getByText('30 L').closest('li') as HTMLElement
    await user.click(within(arrosageItem).getByRole('button', { name: 'Supprimer cette entrée' }))

    await waitFor(() => expect(screen.queryByText('30 L')).not.toBeInTheDocument())
    expect(screen.getByText('2 kg')).toBeInTheDocument()
  })

  it('la recherche restreint la liste affichée', async () => {
    await addLogEntry({ type: 'observation', date: '2026-06-24', description: 'feuilles jaunes' })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    renderJournal()
    await waitFor(() => expect(screen.getByText('feuilles jaunes')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Rechercher'), 'jaunes')

    expect(screen.getByText('feuilles jaunes')).toBeInTheDocument()
    expect(screen.queryByText('2 kg')).not.toBeInTheDocument()
  })

  it('la recherche est insensible aux accents via le libellé de type', async () => {
    await addLogEntry({ type: 'observation', date: '2026-06-24', description: 'feuilles jaunes' })
    await addLogEntry({ type: 'recolte', date: '2026-06-24', quantityKg: 2 })
    renderJournal()
    await waitFor(() => expect(screen.getByText('2 kg')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Rechercher'), 'recolte')

    expect(screen.getByText('2 kg')).toBeInTheDocument()
    expect(screen.queryByText('feuilles jaunes')).not.toBeInTheDocument()
  })

  it('affiche les vignettes des photos d\'une entrée', async () => {
    await addLogEntry({
      type: 'observation',
      date: '2026-06-24',
      description: 'feuilles jaunes',
      photoUrls: ['data:image/jpeg;base64,A'],
    })
    renderJournal()
    await waitFor(() => expect(screen.getByText('feuilles jaunes')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Agrandir la photo 1' })).toBeInTheDocument()
  })

  it('envoie la photo a callGeminiVision si l entree probleme en a une', async () => {
    callGemini.mockClear()
    callGeminiVision.mockClear()
    await db.settings.put({ id: 'settings', geminiApiKey: 'AIza-x' } as never)
    await addLogEntry({
      type: 'probleme',
      date: '2026-06-24',
      description: 'taches sur les feuilles',
      photoUrls: ['data:image/jpeg;base64,QUJD'],
    })
    renderJournal()
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('taches sur les feuilles')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Diagnostiquer' }))

    await waitFor(() => expect(callGeminiVision).toHaveBeenCalledTimes(1))
    expect(callGeminiVision).toHaveBeenCalledWith(
      expect.any(String),
      { data: 'QUJD', mimeType: 'image/jpeg' },
      'AIza-x',
    )
    expect(callGemini).not.toHaveBeenCalled()
  })

  it('affiche le badge température sur une entrée qui porte un snapshot', async () => {
    await db.log.add({
      id: newId(), type: 'observation',
      date: '2026-06-25',
      description: 'feuilles flétries',
      createdAt: 1,
      weather: { capturedAt: 1, source: 'open-meteo', tempC: 36.3 },
    })
    renderJournal()
    expect(await screen.findByText('36 °C')).toBeInTheDocument()
  })

  it('affiche le bandeau de contexte météo sous une observation', async () => {
    await db.log.add({
      id: newId(), type: 'observation',
      date: '2026-06-25',
      description: 'tomates à l arrêt',
      createdAt: 2,
    })
    renderJournal()
    expect(await screen.findByText(/forte chaleur/)).toBeInTheDocument()
  })
})
