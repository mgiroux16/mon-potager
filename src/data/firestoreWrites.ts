import { deleteDoc, deleteField, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, firestore } from './firebase'
import type { TableName } from './syncHooks'
import { canWrite, registerWrites } from './writeGuard'

// Ecritures cloud-first. Convention de timestamps (voir firebase.ts) :
//   updatedAt -> serverTimestamp() (horloge serveur, base du last-write-wins natif)
//   createdAt/date -> Date.now() ou saisie utilisateur, poses par l'appelant.
//
// IMPORTANT : ne jamais await le setDoc jusqu'au serveur. Avec le cache persistant,
// la promesse ne se resout qu'a l'ack serveur : hors-ligne, elle pendrait pour
// toujours et gelerait l'UI. L'ecriture est appliquee au cache local immediatement
// et l'ecran se met a jour via onSnapshot. On log seulement l'erreur eventuelle.

function uidOrNull(): string | null {
  return auth.currentUser?.uid ?? null
}

function ref(uid: string, table: TableName, id: string) {
  return doc(firestore, `users/${uid}/${table}`, id)
}

// Firestore rejette la valeur `undefined`. Les appelants s'en servent pour
// effacer un champ (ex: variete d'arbre videe) : en merge, deleteField()
// supprime reellement le champ du document.
function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    out[key] = value === undefined ? deleteField() : value
  }
  return out
}

/** Cree ou met a jour partiellement un document (merge). */
export function cloudPut(table: TableName, id: string, data: Record<string, unknown>): void {
  const uid = uidOrNull()
  if (uid === null) {
    console.error(`[cloud] ecriture ignoree (deconnecte) ${table}/${id}`)
    return
  }
  if (!canWrite()) return
  registerWrites(1)
  void setDoc(ref(uid, table, id), { ...sanitize(data), updatedAt: serverTimestamp() }, { merge: true }).catch(
    (err: unknown) => console.error(`[cloud] echec setDoc ${table}/${id}`, err),
  )
}

/** Cree un document avec un id genere, le renvoie immediatement. */
export function cloudAdd(table: TableName, data: Record<string, unknown>): string {
  const id = crypto.randomUUID()
  cloudPut(table, id, { ...data, id })
  return id
}

/** Vraie suppression (plus de tombstone cote cloud-first). */
export function cloudDelete(table: TableName, id: string): void {
  const uid = uidOrNull()
  if (uid === null) {
    console.error(`[cloud] suppression ignoree (deconnecte) ${table}/${id}`)
    return
  }
  if (!canWrite()) return
  registerWrites(1)
  void deleteDoc(ref(uid, table, id)).catch((err: unknown) =>
    console.error(`[cloud] echec deleteDoc ${table}/${id}`, err),
  )
}
