import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({ uid: null as string | null }))

vi.mock('../data/firebase', () => ({
  auth: {
    get currentUser() {
      return h.uid ? { uid: h.uid } : null
    },
  },
}))

vi.mock('../data/reconciliation', () => ({
  reconcileAll: vi.fn(),
}))

import { reconcileAll } from '../data/reconciliation'
import { ReconciliationDevPage } from './ReconciliationDevPage'

beforeEach(() => {
  h.uid = null
  vi.clearAllMocks()
})

describe('ReconciliationDevPage', () => {
  it('désactive le bouton et affiche un message si non connecté', () => {
    render(<ReconciliationDevPage />)
    expect(screen.getByText('Non connecté : impossible de lancer la réconciliation.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lancer la réconciliation' })).toBeDisabled()
    expect(reconcileAll).not.toHaveBeenCalled()
  })

  it('lance la réconciliation au clic et affiche le rapport par table', async () => {
    h.uid = 'alice'
    vi.mocked(reconcileAll).mockResolvedValue([
      {
        table: 'log',
        localActive: 3,
        localTombstoned: 0,
        serverTotal: 2,
        serverActive: 2,
        serverTombstoned: 0,
        localOnlyIds: ['e1'],
        serverOnlyIds: [],
        pushedIds: ['e1'],
      },
    ])

    const user = userEvent.setup()
    render(<ReconciliationDevPage />)
    await user.click(screen.getByRole('button', { name: 'Lancer la réconciliation' }))

    expect(reconcileAll).toHaveBeenCalledWith('alice')
    await waitFor(() => expect(screen.getByText('log')).toBeInTheDocument())
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it("n'appelle pas la réconciliation sans uid meme si on force le clic", async () => {
    const user = userEvent.setup()
    render(<ReconciliationDevPage />)
    await user.click(screen.getByRole('button', { name: 'Lancer la réconciliation' }))
    expect(reconcileAll).not.toHaveBeenCalled()
  })

  it('affiche une erreur si la réconciliation échoue', async () => {
    h.uid = 'alice'
    vi.mocked(reconcileAll).mockRejectedValue(new Error('offline'))

    const user = userEvent.setup()
    render(<ReconciliationDevPage />)
    await user.click(screen.getByRole('button', { name: 'Lancer la réconciliation' }))

    await waitFor(() => expect(screen.getByText('Erreur : offline')).toBeInTheDocument())
  })
})
