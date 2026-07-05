// Disjoncteur d'ecritures Firestore.
//
// Pourquoi : le SDK traite resource-exhausted comme retryable. Pendant un
// epuisement de quota (en ligne, donc navigator.onLine ne detecte rien),
// chaque setDoc s'empile dans la file persistante et rejoue a CHAQUE
// ouverture (incident du 04/07 : ~10 000 ecritures rejouees, quota brule).
// Un usage mono-utilisateur normal produit des dizaines d'ecritures par jour.
// Si on depasse WRITE_GUARD_LIMIT dans la journee, quelque chose boucle :
// on coupe les pushes et on pose un drapeau persistant.
//
// Rearmement : automatique au changement de jour calendaire (le quota Spark
// se reinitialise chaque jour), ou manuel via resetWriteGuard (bouton
// Reglages). Ce module doit SURVIVRE au demontage de la couche maison
// (Lot 5) : il protegera alors firestoreWrites.ts.

export const WRITE_GUARD_LIMIT = 500

const STORAGE_KEY = 'writeGuard:trippedOn'

let sessionWrites = 0

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Nombre d'ecritures comptees dans la session (pour affichage Reglages). */
export function sessionWriteCount(): number {
  return sessionWrites
}

/** A appeler avant chaque push : true si les ecritures sont autorisees. */
export function canWrite(): boolean {
  const trippedOn = localStorage.getItem(STORAGE_KEY)
  if (trippedOn !== null) {
    if (trippedOn === today()) return false
    // Jour suivant : le quota est reparti, on rearme.
    localStorage.removeItem(STORAGE_KEY)
    sessionWrites = 0
  }
  return true
}

/** Comptabilise n ecritures ; declenche le disjoncteur au-dela du seuil. */
export function registerWrites(n: number): void {
  sessionWrites += n
  if (sessionWrites > WRITE_GUARD_LIMIT && localStorage.getItem(STORAGE_KEY) === null) {
    localStorage.setItem(STORAGE_KEY, today())
    console.error(
      `[writeGuard] disjoncteur declenche : ${sessionWrites} ecritures dans la session ` +
        `(seuil ${WRITE_GUARD_LIMIT}). Pushes suspendus jusqu'a demain ou rearmement manuel.`,
    )
  }
}

/** Vrai si le disjoncteur est actuellement declenche. */
export function isTripped(): boolean {
  return !canWrite()
}

/** Rearmement manuel (bouton Reglages) et remise a zero du compteur. */
export function resetWriteGuard(): void {
  localStorage.removeItem(STORAGE_KEY)
  sessionWrites = 0
}
