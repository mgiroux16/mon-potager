import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../data/db'
import { getSettings } from '../services/settingsService'
import { SettingsPage } from './SettingsPage'

vi.mock('../services/geminiService', () => ({
  testGeminiConnection: vi.fn(),
}))
import { testGeminiConnection } from '../services/geminiService'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  vi.clearAllMocks()
})

describe('SettingsPage', () => {
  it('charge et affiche les valeurs par défaut', async () => {
    render(<SettingsPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Nom du lieu')).toHaveValue('Champniers (16430)'),
    )
  })

  it('enregistre une modification de localisation', async () => {
    render(<SettingsPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Nom du lieu')).toHaveValue('Champniers (16430)'),
    )
    const user = userEvent.setup()
    const champ = screen.getByLabelText('Nom du lieu')
    await user.clear(champ)
    await user.type(champ, 'Mon jardin')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(async () => {
      const s = await getSettings()
      expect(s.locationName).toBe('Mon jardin')
    })
  })

  it('teste la connexion et affiche le succès', async () => {
    vi.mocked(testGeminiConnection).mockResolvedValue({ ok: true })
    render(<SettingsPage />)
    await waitFor(() => expect(screen.getByLabelText('Nom du lieu')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Clé Gemini'), 'AIza-test')
    await user.click(screen.getByRole('button', { name: 'Tester la connexion' }))

    await waitFor(() => expect(screen.getByText('Connexion OK')).toBeInTheDocument())
    expect(vi.mocked(testGeminiConnection)).toHaveBeenCalledWith('AIza-test')
  })

  it('affiche le message d\'erreur si la connexion échoue', async () => {
    vi.mocked(testGeminiConnection).mockResolvedValue({ ok: false, error: 'Clé invalide' })
    render(<SettingsPage />)
    await waitFor(() => expect(screen.getByLabelText('Nom du lieu')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Clé Gemini'), 'mauvaise')
    await user.click(screen.getByRole('button', { name: 'Tester la connexion' }))

    await waitFor(() => expect(screen.getByText(/Clé invalide/)).toBeInTheDocument())
  })

  it('permet de modifier les mois de debut et fin de saison', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)
    const startInput = await screen.findByLabelText('Mois de début de saison')
    const endInput = await screen.findByLabelText('Mois de fin de saison')
    await user.selectOptions(startInput, '4')
    await user.selectOptions(endInput, '10')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(async () => {
      const saved = await db.settings.get(1)
      expect(saved?.seasonStartMonth).toBe(4)
      expect(saved?.seasonEndMonth).toBe(10)
    })
  })
})
