import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../services/speechService', () => ({
  isSpeechSupported: vi.fn(),
  createSpeechSession: vi.fn(() => ({ stop: vi.fn() })),
}))

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
})
