import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  getDocs,
  query,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { firestore } from './firebase'
import type { TableName } from './syncHooks'
import { canWrite, registerWrites } from './writeGuard'

export function tableCollectionPath(uid: string, table: TableName): string {
  return `users/${uid}/${table}`
}

// Hors-ligne, un setDoc s'empile dans la file persistante du SDK et rejoue au
// prochain demarrage (backlog du 04/07 : ~10 k mutations rejouees a l'ouverture,
// quota brule). On ne pousse qu'en ligne : runInitialSync re-derive les ecarts
// depuis les curseurs updatedAt au prochain lancement connecte, rien n'est perdu.
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

// Ecriture brute, sans disjoncteur : reservee au repli de pushRecords (les
// ecritures du lot sont deja comptees, un repli ne doit pas double-compter).
async function pushRecordRaw(
  uid: string,
  table: TableName,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  await setDoc(doc(firestore, tableCollectionPath(uid, table), id), data, { merge: true })
}

export async function pushRecord(
  uid: string,
  table: TableName,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (isOffline()) return
  if (!canWrite()) return
  registerWrites(1)
  await pushRecordRaw(uid, table, id, data)
}

const BATCH_SIZE = 500

export async function pushRecords(
  uid: string,
  table: TableName,
  items: { id: string; data: Record<string, unknown> }[],
): Promise<void> {
  if (isOffline()) return
  if (!canWrite()) return
  if (items.length === 0) return
  // On compte AVANT l'envoi, volontairement : une ecriture partie vers la file
  // du SDK est une ecriture engagee, meme si le batch echoue ensuite.
  registerWrites(items.length)
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE)
    const batch = writeBatch(firestore)
    for (const { id, data } of chunk) {
      batch.set(doc(firestore, tableCollectionPath(uid, table), id), data, { merge: true })
    }
    try {
      await batch.commit()
    } catch {
      // Batch failed (ex : doc > 1 Mo) : retomber sur les pushes individuels
      for (const { id, data } of chunk) {
        try {
          await pushRecordRaw(uid, table, id, data)
        } catch (err) {
          console.error(`[sync] enregistrement ignore ${table}/${id}`, err)
        }
      }
    }
  }
}

export async function fetchAllRecords(
  uid: string,
  table: TableName,
): Promise<Record<string, unknown>[]> {
  const snapshot = await getDocs(collection(firestore, tableCollectionPath(uid, table)))
  return snapshot.docs.map((d) => ({ ...d.data(), id: d.id }))
}

export async function fetchRecordsSince(
  uid: string,
  table: TableName,
  sinceMs: number,
): Promise<Record<string, unknown>[]> {
  const q = query(
    collection(firestore, tableCollectionPath(uid, table)),
    where('updatedAt', '>', sinceMs),
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ ...d.data(), id: d.id }))
}

export type DocChange = {
  type: 'added' | 'modified' | 'removed'
  record: Record<string, unknown>
}

export function watchTable(
  uid: string,
  table: TableName,
  onChange: (changes: DocChange[]) => void,
): Unsubscribe {
  return onSnapshot(collection(firestore, tableCollectionPath(uid, table)), (snapshot) => {
    const changes = snapshot.docChanges().map((change) => ({
      type: change.type,
      record: { ...change.doc.data(), id: change.doc.id },
    }))
    if (changes.length > 0) onChange(changes)
  })
}
