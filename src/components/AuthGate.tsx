import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { onAuthChange } from '../services/authService'
import { setSyncUid } from '../data/syncHooks'
import { runInitialSync, startRealtimeSync, stopRealtimeSync } from '../services/syncService'
import { LoginPage } from '../pages/LoginPage'

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => onAuthChange(setUser), [])

  useEffect(() => {
    if (user == null) {
      setSyncUid(null)
      stopRealtimeSync()
      return
    }
    setSyncUid(user.uid)
    void runInitialSync(user.uid).then(() => startRealtimeSync(user.uid))
    return () => stopRealtimeSync()
  }, [user])

  if (user === undefined) {
    return <div className="flex min-h-screen items-center justify-center bg-green-50" />
  }

  if (user === null) {
    return <LoginPage />
  }

  return children
}
