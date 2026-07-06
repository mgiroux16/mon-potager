import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { auth, firestore } from './firebase'
import type { TableName } from './model'
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

/**
 * Lecture ponctuelle d'une table complete (getDocs, une seule fois). Reserve aux
 * actions manuelles a cout borne (dedoublonnage, export) : les ecrans passent par
 * useCollection. Renvoie [] si deconnecte.
 */
export async function cloudGetAll(table: TableName): Promise<Record<string, unknown>[]> {
  const uid = uidOrNull()
  if (uid === null) {
    console.error(`[cloud] lecture ignoree (deconnecte) ${table}`)
    return []
  }
  const snap = await getDocs(collection(firestore, `users/${uid}/${table}`))
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }))
}

export type CloudBatchOp =
  | { type: 'set'; table: TableName; id: string; data: Record<string, unknown> }
  | { type: 'delete'; table: TableName; id: string }

const BATCH_LIMIT = 500

/**
 * Ecritures en lot (writeBatch, paquets de 500). Contrairement a cloudPut, on
 * attend l'ack serveur : reserve aux operations one-shot lancees en ligne
 * (dedoublonnage, import), jamais au fil de l'eau de l'UI.
 */
export async function cloudBatchWrite(ops: CloudBatchOp[]): Promise<void> {
  const uid = uidOrNull()
  if (uid === null) throw new Error('cloudBatchWrite : utilisateur deconnecte')
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const chunk = ops.slice(i, i + BATCH_LIMIT)
    if (!canWrite()) throw new Error('cloudBatchWrite : disjoncteur quota declenche')
    registerWrites(chunk.length)
    const batch = writeBatch(firestore)
    for (const op of chunk) {
      if (op.type === 'set') {
        batch.set(ref(uid, op.table, op.id), { ...sanitize(op.data), updatedAt: serverTimestamp() }, { merge: true })
      } else {
        batch.delete(ref(uid, op.table, op.id))
      }
    }
    await batch.commit()
  }
}
