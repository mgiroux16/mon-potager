import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { AuthGate } from './AuthGate'

const mockOnAuthChange = vi.fn()
vi.mock('../services/authService', () => ({
  onAuthChange: (cb: (user: User | null) => void) => mockOnAuthChange(cb),
  signInWithGoogle: vi.fn(),
  consumeRedirectResult: vi.fn().mockResolvedValue(undefined),
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
})
