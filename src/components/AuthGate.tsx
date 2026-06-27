import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { onAuthChange } from '../services/authService'
import { LoginPage } from '../pages/LoginPage'

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => onAuthChange(setUser), [])

  if (user === undefined) {
    return <div className="flex min-h-screen items-center justify-center bg-green-50" />
  }

  if (user === null) {
    return <LoginPage />
  }

  return children
}
