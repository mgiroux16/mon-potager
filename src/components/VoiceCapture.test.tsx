import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

type Handlers = {
  onReady: (audio: { data: string; mimeType: string }) => void
  onError: (r: string) => void
}

const h = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  handlers: { current: null as Handlers | null },
  session: { stop: vi.fn(), cancel: vi.fn() },
  callGeminiAudio: vi.fn(),
  getSettings: vi.fn(),
}))

vi.mock('../services/audioRecordService', () => ({
  isRecordingSupported: vi.fn(),
  startRecording: vi.fn(async (handlers: Handlers) => {
    h.handlers.current = handlers
    return h.session
  }),
}))

vi.mock('../services/geminiService', () => ({
  callGeminiAudio: h.callGeminiAudio,
}))

vi.mock('../services/settingsService', () => ({
  getSettings: h.getSettings,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => h.navigateSpy }
})

import { isRecordingSupported } from '../services/audioRecordService'
import { VoiceCapture } from './VoiceCapture'

const mockedSupported = vi.mocked(isRecordingSupported)

function renderCapture() {
  return render(
    <MemoryRouter>
      <VoiceCapture />
    </MemoryRouter>,
  )
}

const audio = { data: 'QUJD', mimeType: 'audio/webm' }

afterEach(() => {
  vi.clearAllMocks()
  h.handlers.current = null
})

describe('VoiceCapture', () => {
  it('ne rend pas le bouton quand l enregistrement n est pas supporte', () => {
    mockedSupported.mockReturnValue(false)
    renderCapture()
    expect(screen.queryByRole('button', { name: 'Dicter une entrée' })).not.toBeInTheDocument()
  })

  it('rend le bouton et ouvre l overlay d ecoute quand supporte', async () => {
    mockedSupported.mockReturnValue(true)
    const user = userEvent.setup()
    renderCapture()

    const button = screen.getByRole('button', { name: 'Dicter une entrée' })
    expect(button).toBeInTheDocument()

    await user.click(button)
    expect(screen.getByText(/J'écoute/i)).toBeInTheDocument()
  })

  it('affiche une erreur si aucune cle Gemini n est configuree', async () => {
    mockedSupported.mockReturnValue(true)
    h.getSettings.mockResolvedValue({ geminiApiKey: '' })
    const user = userEvent.setup()
    renderCapture()
    await user.click(screen.getByRole('button', { name: 'Dicter une entrée' }))

    await act(async () => {
      h.handlers.current?.onReady(audio)
    })

    await waitFor(() => expect(screen.getByText(/clé Gemini/i)).toBeInTheDocument())
    expect(h.callGeminiAudio).not.toHaveBeenCalled()
  })

  it('n ouvre pas le formulaire si on ferme l overlay pendant l appel Gemini', async () => {
    mockedSupported.mockReturnValue(true)
    h.getSettings.mockResolvedValue({ geminiApiKey: 'fake-key' })
    let resolveGemini: (v: string) => void = () => {}
    h.callGeminiAudio.mockReturnValue(
      new Promise<string>((res) => {
        resolveGemini = res
      }),
    )

    const user = userEvent.setup()
    renderCapture()
    await user.click(screen.getByRole('button', { name: 'Dicter une entrée' }))

    // Audio pret : finalize part, l'overlay passe en "Je range..." et Gemini est appele.
    await act(async () => {
      h.handlers.current?.onReady(audio)
    })
    await waitFor(() => expect(h.callGeminiAudio).toHaveBeenCalled())
    expect(screen.getByText(/Je range/i)).toBeInTheDocument()

    // L'utilisateur ferme l'overlay avant que Gemini reponde.
    await user.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(h.session.cancel).toHaveBeenCalled()

    // Gemini repond apres la fermeture : la dictee est annulee, on ne navigue pas.
    await act(async () => {
      resolveGemini('{"type":"note","description":"x"}')
    })

    expect(h.navigateSpy).not.toHaveBeenCalled()
  })
})
