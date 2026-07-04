import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { onAuthChange, consumeRedirectResult } from '../services/authService'
import { setSyncUid } from '../data/syncHooks'
import {
  runInitialSync,
  startRealtimeSync,
  stopRealtimeSync,
  purgeOldTombstones,
} from '../services/syncService'
import { LoginPage } from '../pages/LoginPage'

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  // Single-flight par uid : onAuthStateChanged ré-émet un objet User neuf a
  // chaque refresh de token / reconnexion. Sans ce garde, chaque ré-émission
  // relance toute la chaine de synchro (double lecture + re-push Firestore).
  const syncedUidRef = useRef<string | null>(null)

  useEffect(() => onAuthChange(setUser), [])
  useEffect(() => {
    void consumeRedirectResult()
  }, [])

  useEffect(() => {
    if (user == null) {
      setSyncUid(null)
      stopRealtimeSync()
      syncedUidRef.current = null
      return
    }
    setSyncUid(user.uid)
    // Ré-émission du meme uid : la chaine tourne deja, ne rien relancer.
    if (syncedUidRef.current === user.uid) return
    syncedUidRef.current = user.uid
    void purgeOldTombstones()
      .then(() => runInitialSync(user.uid))
      .then(() => startRealtimeSync(user.uid))
  }, [user])

  if (user === undefined) {
    return <div className="flex min-h-screen items-center justify-center bg-green-50" />
  }

  if (user === null) {
    return <LoginPage />
  }

  return children
}
