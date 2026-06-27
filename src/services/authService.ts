import {
  getRedirectResult,
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

// A appeler une fois au demarrage : recupere le resultat d'un signInWithRedirect
// en cours et, surtout, fait remonter l'erreur si la redirection a echoue
// silencieusement (ex: stockage tiers bloque entre ce domaine et authDomain).
export async function consumeRedirectResult(): Promise<void> {
  try {
    await getRedirectResult(auth)
  } catch (err) {
    console.error('[auth] echec de consumeRedirectResult', err)
  }
}
