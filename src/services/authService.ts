import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { auth, googleProvider } from '../data/firebase'

// L'app (mgiroux16.github.io) et l'authDomain (potager-764af.firebaseapp.com)
// sont sur deux origines differentes. signInWithRedirect a besoin de relire un
// etat stocke cote firebaseapp.com au retour, ce que les navigateurs recents
// bloquent (stockage tiers) : la connexion aboutit chez Google puis "rebondit"
// sur l'ecran de login. La popup n'a pas ce handshake tiers, on la prefere donc.
// Repli sur le redirect si la popup est bloquee (ex: PWA installee en standalone).
export async function signInWithGoogle(): Promise<void> {
  try {
    await signInWithPopup(auth, googleProvider)
  } catch (err) {
    const code = (err as { code?: string }).code
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment' ||
      code === 'auth/cancelled-popup-request'
    ) {
      await signInWithRedirect(auth, googleProvider)
      return
    }
    throw err
  }
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
