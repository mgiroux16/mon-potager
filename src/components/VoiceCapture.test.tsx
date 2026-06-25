import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

type Handlers = {
  onInterim: (t: string) => void
  onFinal: (t: string) => void
  onError: (r: string) => void
}

const h = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  handlers: { current: null as Handlers | null },
  callGemini: vi.fn(),
  getSettings: vi.fn(),
}))

vi.mock('../services/speechService', () => ({
  isSpeechSupported: vi.fn(),
  createSpeechSession: vi.fn((handlers: Handlers) => {
    h.handlers.current = handlers
    return { stop: vi.fn() }
  }),
}))

vi.mock('../services/geminiService', () => ({
  callGemini: h.callGemini,
}))

vi.mock('../services/settingsService', () => ({
  getSettings: h.getSettings,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => h.navigateSpy }
})

import { isSpeechSupported } from '../services/speechService'
import { VoiceCapture } from './VoiceCapture'

const mockedSupported = vi.mocked(isSpeechSupported)

function renderCapture() {
  return render(
    <MemoryRouter>
      <VoiceCapture />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.clearAllMocks()
  h.handlers.current = null
})

describe('VoiceCapture', () => {
  it('ne rend pas le bouton quand la reconnaissance vocale n est pas supportee', () => {
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

  it('n ouvre pas le formulaire si on ferme l overlay pendant l appel Gemini', async () => {
    mockedSupported.mockReturnValue(true)
    h.getSettings.mockResolvedValue({ geminiApiKey: 'fake-key' })
    let resolveGemini: (v: string) => void = () => {}
    h.callGemini.mockReturnValue(
      new Promise<string>((res) => {
        resolveGemini = res
      }),
    )

    const user = userEvent.setup()
    renderCapture()
    await user.click(screen.getByRole('button', { name: 'Dicter une entrée' }))

    // Phrase finale dictee : finalize part, l'overlay passe en "Je range..." et Gemini est appele.
    await act(async () => {
      h.handlers.current?.onFinal('j ai arrose la parcelle')
    })
    await waitFor(() => expect(h.callGemini).toHaveBeenCalled())
    expect(screen.getByText(/Je range/i)).toBeInTheDocument()

    // L'utilisateur ferme l'overlay avant que Gemini reponde.
    await user.click(screen.getByRole('button', { name: 'Fermer' }))

    // Gemini repond apres la fermeture : la dictee est annulee, on ne navigue pas.
    await act(async () => {
      resolveGemini('{"type":"note","description":"x"}')
    })

    expect(h.navigateSpy).not.toHaveBeenCalled()
  })
})
