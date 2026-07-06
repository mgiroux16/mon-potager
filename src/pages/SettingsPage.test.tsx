import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../data/db'
import { clearCollectionData, getCollectionData } from '../test/firestoreHooksMock'
import { SettingsPage } from './SettingsPage'

vi.mock('../data/firestoreHooks', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreHooksMock
})
vi.mock('../data/firestoreWrites', async () => {
  return (await import('../test/firestoreHooksMock')).firestoreWritesMock
})

vi.mock('../services/geminiService', () => ({
  testGeminiConnection: vi.fn(),
}))
import { testGeminiConnection } from '../services/geminiService'

vi.mock('../services/syncService', () => ({
  getSyncStatus: vi.fn(() => 'synced'),
}))
import { getSyncStatus } from '../services/syncService'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  clearCollectionData()
  vi.clearAllMocks()
  localStorage.removeItem('writeGuard:trippedOn')
})

describe('SettingsPage', () => {
  it('charge et affiche les valeurs par défaut', async () => {
    render(<SettingsPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Nom du lieu')).toHaveValue("278 rue de l'Arbalétrier, Champniers (16430)"),
    )
  })

  it('enregistre une modification de localisation', async () => {
    render(<SettingsPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Nom du lieu')).toHaveValue("278 rue de l'Arbalétrier, Champniers (16430)"),
    )
    const user = userEvent.setup()
    const champ = screen.getByLabelText('Nom du lieu')
    await user.clear(champ)
    await user.type(champ, 'Mon jardin')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => {
      const s = getCollectionData('settings')[0]
      expect(s?.locationName).toBe('Mon jardin')
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

    await waitFor(() => {
      const saved = getCollectionData('settings')[0]
      expect(saved?.seasonStartMonth).toBe(4)
      expect(saved?.seasonEndMonth).toBe(10)
    })
  })

  it('affiche "Synchronisé" quand le statut est synced', async () => {
    vi.mocked(getSyncStatus).mockReturnValue('synced')
    render(<SettingsPage />)
    await waitFor(() => expect(screen.getByText('Synchronisé')).toBeInTheDocument())
  })

  it('affiche "Synchronisation…" quand le statut est syncing', async () => {
    vi.mocked(getSyncStatus).mockReturnValue('syncing')
    render(<SettingsPage />)
    await waitFor(() => expect(screen.getByText('Synchronisation…')).toBeInTheDocument())
  })

  it('affiche "Hors ligne" quand le statut est offline', async () => {
    vi.mocked(getSyncStatus).mockReturnValue('offline')
    render(<SettingsPage />)
    await waitFor(() => expect(screen.getByText('Hors ligne')).toBeInTheDocument())
  })

  it('affiche "Erreur de synchronisation" quand le statut est error', async () => {
    vi.mocked(getSyncStatus).mockReturnValue('error')
    render(<SettingsPage />)
    await waitFor(() => expect(screen.getByText('Erreur de synchronisation')).toBeInTheDocument())
  })

  it('affiche la suspension quota et rearme via le bouton quand le disjoncteur est declenche', async () => {
    localStorage.setItem('writeGuard:trippedOn', new Date().toISOString().slice(0, 10))
    render(<SettingsPage />)
    await waitFor(() =>
      expect(screen.getByText(/Synchronisation suspendue/)).toBeInTheDocument(),
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Réactiver maintenant' }))

    expect(screen.queryByText(/Synchronisation suspendue/)).not.toBeInTheDocument()
    expect(localStorage.getItem('writeGuard:trippedOn')).toBeNull()
    expect(screen.getByText(/Écritures cloud cette session/)).toBeInTheDocument()
  })

  it("affiche le compteur d'ecritures quand le disjoncteur est au repos", async () => {
    render(<SettingsPage />)
    await waitFor(() =>
      expect(screen.getByText(/Écritures cloud cette session : \d+/)).toBeInTheDocument(),
    )
    expect(screen.queryByText(/Synchronisation suspendue/)).not.toBeInTheDocument()
  })
})
