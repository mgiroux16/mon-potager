import {
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { auth, googleProvider } from '../data/firebase'

export function signInWithGoogle(): Promise<void> {
  return signInWithRedirect(auth, googleProvider)
}

export function signOutUser(): Promise<void> {
  return signOut(auth)
}

// PWA installee : une popup peut etre fermee sans retour possible, le redirect
// est le seul flux fiable une fois l'app ajoutee a l'ecran d'accueil.
export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback)
}
