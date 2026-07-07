import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const h = vi.hoisted(() => ({
  callGeminiChat: vi.fn(async (_history: { role: 'user' | 'model'; text: string }[], _apiKey: string) => 'Réponse'),
}))

vi.mock('../services/geminiService', () => ({
  callGeminiChat: h.callGeminiChat,
}))

vi.mock('../services/settingsService', () => ({
  useSettings: () => ({ geminiApiKey: 'AIza-x' }),
}))

vi.mock('../data/firestoreHooks', () => ({
  useCollection: () => ({ data: [] }),
}))

import { AssistantPage } from './AssistantPage'

function renderAssistant() {
  return render(
    <MemoryRouter>
      <AssistantPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('AssistantPage', () => {
  it('un 2e envoi inclut l historique du 1er échange dans callGeminiChat', async () => {
    const user = userEvent.setup()
    renderAssistant()

    const input = screen.getByLabelText('Ta question')
    await user.type(input, 'Comment va mon jardin ?')
    await user.click(screen.getByLabelText('Envoyer'))

    expect(h.callGeminiChat).toHaveBeenCalledTimes(1)
    expect(h.callGeminiChat.mock.calls[0][0]).toEqual([
      { role: 'user', text: 'Comment va mon jardin ?' },
    ])

    await screen.findByText('Réponse')

    await user.type(input, 'Et mes tomates ?')
    await user.click(screen.getByLabelText('Envoyer'))

    expect(h.callGeminiChat).toHaveBeenCalledTimes(2)
    expect(h.callGeminiChat.mock.calls[1][0]).toEqual([
      { role: 'user', text: 'Comment va mon jardin ?' },
      { role: 'model', text: 'Réponse' },
      { role: 'user', text: 'Et mes tomates ?' },
    ])
  })
})
