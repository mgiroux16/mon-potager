import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const googleProvider = new GoogleAuthProvider()
export const firestore = initializeFirestore(firebaseApp, {
  // Cache persistant multi-onglets : sur desktop, ouvrir un 2e onglet avec le
  // gestionnaire single-tab (defaut de persistentLocalCache()) fait echouer la
  // persistance dans l'onglet secondaire. persistentMultipleTabManager coordonne
  // le cache entre tous les onglets d'une meme origine. Prealable a la bascule
  // cloud-first (Firestore source de verite, offline via ce cache natif).
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  // Le modele est plein de champs optionnels (photoUrl?, areaM2?, notes?...). Sans
  // cette option, le moindre champ a `undefined` fait lever "Unsupported field value:
  // undefined" au premier setDoc, ce qui faisait planter toute la synchro.
  ignoreUndefinedProperties: true,
})

// Convention de timestamps figee pour la migration cloud-first (voir docs/audit/).
// NON encore appliquee aux ecritures a ce stade (Etape 0 : preparation seulement).
//
//   updatedAt   -> serverTimestamp() a l'ecriture. Horloge du serveur Firestore,
//                  fiable entre appareils, base du last-write-wins natif. Remplace
//                  le buffer anti-decalage d'horloge de la synchro maison. Valeur
//                  momentanement nulle dans le cache local avant confirmation serveur.
//   createdAt   -> Date.now() (horloge locale). Valeur affichee, figee a la creation.
//   date        -> Date.now() / date saisie par l'utilisateur. Valeur metier affichee.
//
// La bascule des ecritures vers serverTimestamp() se fera table par table lors des
// etapes suivantes, jamais ici.
