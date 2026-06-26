import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import { addLogEntry, type NewLogEntry } from '../services/logService'
import { LOG_TYPE_LABELS, resolveDetail, resolveTargetName, type LogRefs } from '../services/logView'
import { LOG_TYPE_ICONS } from '../components/logTypeIcons'
import { configForType, EntryForm } from './QuickAddPage'

interface DraftCard {
  key: string
  draft: Partial<NewLogEntry>
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const actionButtonClass =
  'flex-1 rounded-lg px-3 py-2 text-sm font-medium'

export function VoiceReviewPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const oyas = useLiveQuery(() => db.oyas.toArray(), [], [])
  const trees = useLiveQuery(() => db.trees.toArray(), [], [])

  const voiceDrafts = (location.state as { voiceDrafts?: Partial<NewLogEntry>[] } | null)
    ?.voiceDrafts

  // Brouillons consommes une seule fois : on capture a l'init, puis on nettoie le router
  // state pour qu'un retour arriere ou un rafraichissement ne rouvre pas la revue.
  const initialCards = useRef(
    (voiceDrafts ?? []).map((draft, i) => ({ key: `d${i}`, draft })),
  ).current
  const [cards, setCards] = useState<DraftCard[]>(initialCards)
  const [editingKey, setEditingKey] = useState<string | null>(null)

  useEffect(() => {
    if (voiceDrafts) {
      navigate(location.pathname, { replace: true, state: null })
    }
    // On ne veut nettoyer qu'une fois, a l'arrivee des brouillons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refs: LogRefs = {
    parcels: new Map(parcels.map((p) => [p.id!, p] as [number, typeof p])),
    crops: new Map(crops.map((c) => [c.id!, c] as [number, typeof c])),
    oyas: new Map(oyas.map((o) => [o.id!, o] as [number, typeof o])),
    trees: new Map(trees.map((t) => [t.id!, t] as [number, typeof t])),
  }

  function removeCard(key: string) {
    const next = cards.filter((c) => c.key !== key)
    setCards(next)
    if (next.length === 0) navigate('/journal', { replace: true })
  }

  async function valider(card: DraftCard) {
    const entry: NewLogEntry = {
      type: card.draft.type ?? 'note',
      date: card.draft.date ?? todayISO(),
      ...card.draft,
    }
    await addLogEntry(entry)
    removeCard(card.key)
  }

  const editingCard = cards.find((c) => c.key === editingKey)

  if (editingCard) {
    return (
      <section className="flex flex-col gap-4">
        <EntryForm
          config={configForType(editingCard.draft.type ?? 'note')}
          initial={editingCard.draft}
          onSaved={() => {
            setEditingKey(null)
            removeCard(editingCard.key)
          }}
          onCancel={() => setEditingKey(null)}
        />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-green-950">Plusieurs actions détectées</h1>
      <p className="text-sm text-green-800">
        Valide, modifie ou supprime chaque action avant de continuer.
      </p>
      <ul className="flex flex-col gap-3">
        {cards.map((card) => {
          const type = card.draft.type ?? 'note'
          const Icon = LOG_TYPE_ICONS[type]
          const target = resolveTargetName(card.draft, refs)
          const detail = resolveDetail(card.draft)
          return (
            <li key={card.key} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-green-100 text-green-700">
                  <Icon className="size-4.5" />
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-green-950">
                    {LOG_TYPE_LABELS[type]}
                    {target ? ` · ${target}` : ''}
                  </span>
                  {detail && <span className="text-xs text-green-700">{detail}</span>}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void valider(card)}
                  className={`${actionButtonClass} bg-green-600 text-white`}
                >
                  Valider
                </button>
                <button
                  type="button"
                  onClick={() => setEditingKey(card.key)}
                  className={`${actionButtonClass} bg-green-100 text-green-800`}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => removeCard(card.key)}
                  className={`${actionButtonClass} bg-red-50 text-red-700`}
                >
                  Supprimer
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
