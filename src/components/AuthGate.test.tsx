import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { AuthGate } from './AuthGate'
import { setSyncUid } from '../data/syncHooks'
import {
  runInitialSync,
  startRealtimeSync,
  stopRealtimeSync,
  purgeOldTombstones,
  dedupeReferenceTables,
} from '../services/syncService'

const mockOnAuthChange = vi.fn()
vi.mock('../services/authService', () => ({
  onAuthChange: (cb: (user: User | null) => void) => mockOnAuthChange(cb),
  signInWithGoogle: vi.fn(),
  consumeRedirectResult: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../data/syncHooks', () => ({ setSyncUid: vi.fn() }))
vi.mock('../services/syncService', () => ({
  runInitialSync: vi.fn().mockResolvedValue(undefined),
  startRealtimeSync: vi.fn(),
  stopRealtimeSync: vi.fn(),
  purgeOldTombstones: vi.fn().mockResolvedValue(undefined),
  dedupeReferenceTables: vi.fn().mockResolvedValue(undefined),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AuthGate', () => {
  it("n'affiche rien de visible pendant le chargement initial", () => {
    mockOnAuthChange.mockImplementation(() => () => {})
    render(
      <AuthGate>
        <div>Contenu protege</div>
      </AuthGate>,
    )
    expect(screen.queryByText('Contenu protege')).not.toBeInTheDocument()
  })

  it("affiche l'ecran de connexion si aucun utilisateur", () => {
    mockOnAuthChange.mockImplementation((cb: (user: User | null) => void) => {
      cb(null)
      return () => {}
    })
    render(
      <AuthGate>
        <div>Contenu protege</div>
      </AuthGate>,
    )
    expect(screen.getByText('Se connecter avec Google')).toBeInTheDocument()
    expect(screen.queryByText('Contenu protege')).not.toBeInTheDocument()
  })

  it('affiche le contenu protege une fois connecte', () => {
    mockOnAuthChange.mockImplementation((cb: (user: User | null) => void) => {
      cb({ uid: '1', email: 'a@b.com' } as User)
      return () => {}
    })
    render(
      <AuthGate>
        <div>Contenu protege</div>
      </AuthGate>,
    )
    expect(screen.getByText('Contenu protege')).toBeInTheDocument()
  })

  it('demarre la synchro quand un utilisateur se connecte', async () => {
    mockOnAuthChange.mockImplementation((cb: (user: User | null) => void) => {
      cb({ uid: 'abc', email: 'a@b.com' } as User)
      return () => {}
    })
    render(
      <AuthGate>
        <div>Contenu protege</div>
      </AuthGate>,
    )
    expect(setSyncUid).toHaveBeenCalledWith('abc')
    expect(purgeOldTombstones).toHaveBeenCalled()
    await waitFor(() => expect(runInitialSync).toHaveBeenCalledWith('abc'))
    await waitFor(() => expect(dedupeReferenceTables).toHaveBeenCalled())
    await waitFor(() => expect(startRealtimeSync).toHaveBeenCalledWith('abc'))
  })

  it("arrete la synchro quand l'utilisateur se deconnecte", () => {
    mockOnAuthChange.mockImplementation((cb: (user: User | null) => void) => {
      cb(null)
      return () => {}
    })
    render(
      <AuthGate>
        <div>Contenu protege</div>
      </AuthGate>,
    )
    expect(setSyncUid).toHaveBeenCalledWith(null)
    expect(stopRealtimeSync).toHaveBeenCalled()
  })
})
