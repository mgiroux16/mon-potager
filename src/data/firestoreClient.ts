import { collection, doc, setDoc, onSnapshot, getDocs, type Unsubscribe } from 'firebase/firestore'
import { firestore } from './firebase'
import type { TableName } from './syncHooks'

export function tableCollectionPath(uid: string, table: TableName): string {
  return `users/${uid}/${table}`
}

export async function pushRecord(
  uid: string,
  table: TableName,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  await setDoc(doc(firestore, tableCollectionPath(uid, table), id), data, { merge: true })
}

export async function fetchAllRecords(
  uid: string,
  table: TableName,
): Promise<Record<string, unknown>[]> {
  const snapshot = await getDocs(collection(firestore, tableCollectionPath(uid, table)))
  return snapshot.docs.map((d) => ({ ...d.data(), id: d.id }))
}

export function watchTable(
  uid: string,
  table: TableName,
  onChange: (records: Record<string, unknown>[]) => void,
): Unsubscribe {
  return onSnapshot(collection(firestore, tableCollectionPath(uid, table)), (snapshot) => {
    onChange(snapshot.docs.map((d) => ({ ...d.data(), id: d.id })))
  })
}
