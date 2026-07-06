import { useEffect, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type OrderByDirection,
  type QueryConstraint,
  type WhereFilterOp,
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, firestore } from './firebase'
import type { TableName } from './model'

// Hooks de lecture temps reel Firestore, prealables a la bascule cloud-first.
// NON branches aux pages a ce stade : Dexie reste la source de verite. Ils
// remplaceront progressivement les useLiveQuery(db.<table>.toArray()), table
// par table, aux etapes suivantes.
//
// Regles de robustesse appliquees ici :
//  - Aucun abonnement tant que l'uid n'est pas resolu (auth en cours) ou si
//    l'utilisateur est deconnecte : un chemin users/<uid>/... sans uid est
//    invalide. Dans ce cas on reste en loading.
//  - includeMetadataChanges: true pour exposer fromCache (cache local Firestore
//    puis serveur), afin qu'un ecran affiche "chargement" plutot que "aucune
//    donnee" sur un cache encore vide.
//  - On ne trie JAMAIS sur updatedAt : avec serverTimestamp(), il est nul tant
//    que le serveur n'a pas confirme l'ecriture. Le tri se fait cote appelant
//    sur des champs stables (date, createdAt).
//  - Filtrage des tombstones (deletedAt) maintenu pendant la transition : les
//    suppressions douces coexistent encore avec la synchro maison.

// uid reactif : les composants n'ont pas de contexte d'auth partage, on
// s'abonne donc directement a l'etat d'authentification.
//   undefined : auth pas encore resolue (au demarrage)
//   null      : deconnecte
//   string    : uid connecte
function useUid(): string | null | undefined {
  const [uid, setUid] = useState<string | null | undefined>(
    () => auth.currentUser?.uid ?? undefined,
  )
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => setUid(user ? user.uid : null))
  }, [])
  return uid
}

export interface CollectionFilter {
  field: string
  op: WhereFilterOp
  value: unknown
}

export interface CollectionSort {
  field: string
  direction?: OrderByDirection
}

export interface UseCollectionOptions {
  where?: CollectionFilter[]
  orderBy?: CollectionSort[]
}

export interface UseCollectionResult<T> {
  data: T[]
  loading: boolean
  error: Error | null
  fromCache: boolean
}

const LOADING_COLLECTION = { data: [], loading: true, error: null, fromCache: true }

function hasDeletedAt(row: Record<string, unknown>): boolean {
  return typeof row.deletedAt === 'number'
}

export function useCollection<T = Record<string, unknown>>(
  table: TableName,
  options?: UseCollectionOptions,
): UseCollectionResult<T> {
  const uid = useUid()
  // Serialisation stable des options : un litteral d'options recree a chaque
  // render aurait une nouvelle reference et re-declencherait l'abonnement. La
  // cle string ne change que si le contenu change.
  const optionsKey = JSON.stringify(options ?? {})

  const [state, setState] = useState<UseCollectionResult<T>>(() => ({ ...LOADING_COLLECTION }))

  useEffect(() => {
    if (typeof uid !== 'string') {
      setState({ ...LOADING_COLLECTION })
      return
    }
    setState((prev) => ({ ...prev, loading: true, error: null }))

    const opts = JSON.parse(optionsKey) as UseCollectionOptions
    const constraints: QueryConstraint[] = []
    for (const w of opts.where ?? []) constraints.push(where(w.field, w.op, w.value))
    for (const o of opts.orderBy ?? []) constraints.push(orderBy(o.field, o.direction))

    const ref = collection(firestore, `users/${uid}/${table}`)
    const q = constraints.length > 0 ? query(ref, ...constraints) : ref

    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        const rows = snapshot.docs
          .map((d) => ({ ...d.data(), id: d.id }) as Record<string, unknown>)
          .filter((row) => !hasDeletedAt(row))
        setState({
          data: rows as T[],
          loading: false,
          error: null,
          fromCache: snapshot.metadata.fromCache,
        })
      },
      (err) => {
        setState({ data: [], loading: false, error: err, fromCache: false })
      },
    )
    return unsubscribe
  }, [uid, table, optionsKey])

  return state
}

export interface UseDocResult<T> {
  data: T | null
  loading: boolean
  error: Error | null
  fromCache: boolean
}

const LOADING_DOC = { data: null, loading: true, error: null, fromCache: true }

export function useDoc<T = Record<string, unknown>>(
  table: TableName,
  id: string | null | undefined,
): UseDocResult<T> {
  const uid = useUid()

  const [state, setState] = useState<UseDocResult<T>>(() => ({ ...LOADING_DOC }))

  useEffect(() => {
    if (typeof uid !== 'string' || !id) {
      setState({ ...LOADING_DOC })
      return
    }
    setState((prev) => ({ ...prev, loading: true, error: null }))

    const ref = doc(firestore, `users/${uid}/${table}`, id)
    const unsubscribe = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snapshot) => {
        const fromCache = snapshot.metadata.fromCache
        if (!snapshot.exists()) {
          setState({ data: null, loading: false, error: null, fromCache })
          return
        }
        const row = { ...snapshot.data(), id: snapshot.id } as Record<string, unknown>
        setState({
          data: hasDeletedAt(row) ? null : (row as T),
          loading: false,
          error: null,
          fromCache,
        })
      },
      (err) => {
        setState({ data: null, loading: false, error: err, fromCache: false })
      },
    )
    return unsubscribe
  }, [uid, table, id])

  return state
}
