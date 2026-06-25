import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import { db } from '../data/db'
import type { LogEntryType } from '../data/model'
import { addLogEntry, type NewLogEntry } from '../services/logService'
import { LOG_TYPE_LABELS } from '../services/logView'
import { LOG_TYPE_ICONS } from '../components/logTypeIcons'
import { PhotoInput } from '../components/PhotoInput'

type TargetKind = 'parcelle' | 'oya' | 'culture' | 'element' | 'none'
type MeasureKind = 'volume' | 'quantite' | 'description' | 'titre_description' | 'none'

interface FormConfig {
  type: LogEntryType
  target: TargetKind
  measure: MeasureKind
  withTime: boolean
}

const FREQUENT: FormConfig[] = [
  { type: 'arrosage', target: 'parcelle', measure: 'volume', withTime: true },
  { type: 'remplissage_oya', target: 'oya', measure: 'volume', withTime: true },
  { type: 'recolte', target: 'culture', measure: 'quantite', withTime: false },
  { type: 'observation', target: 'element', measure: 'description', withTime: false },
  { type: 'probleme', target: 'element', measure: 'description', withTime: false },
]

const OTHER_TYPES: LogEntryType[] = [
  'semis', 'plantation', 'paillage', 'traitement', 'compost',
  'taille', 'depense', 'diagnostic', 'releve_pluie', 'note',
]

function genericConfig(type: LogEntryType): FormConfig {
  return { type, target: 'none', measure: 'titre_description', withTime: false }
}

function configForType(type: LogEntryType): FormConfig {
  return FREQUENT.find((c) => c.type === type) ?? genericConfig(type)
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nowHM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

type View = 'grid' | 'autre' | FormConfig

type TargetField = 'parcelle' | 'culture' | 'oya' | 'arbre'

function visibleTargets(config: FormConfig, initial?: Partial<NewLogEntry>): Set<TargetField> {
  const s = new Set<TargetField>()
  if (config.target === 'parcelle') s.add('parcelle')
  if (config.target === 'oya') s.add('oya')
  if (config.target === 'culture') s.add('culture')
  if (config.target === 'element') {
    s.add('parcelle')
    s.add('culture')
    s.add('arbre')
  }
  if (initial?.parcelId != null) s.add('parcelle')
  if (initial?.cropId != null) s.add('culture')
  if (initial?.oyaId != null) s.add('oya')
  if (initial?.treeId != null) s.add('arbre')
  return s
}

function EntryForm({ config, initial, onSaved, onCancel }: {
  config: FormConfig
  initial?: Partial<NewLogEntry>
  onSaved: () => void
  onCancel: () => void
}) {
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const oyas = useLiveQuery(() => db.oyas.toArray(), [], [])
  const trees = useLiveQuery(() => db.trees.toArray(), [], [])

  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [time, setTime] = useState(initial?.time ?? nowHM())
  const [parcelId, setParcelId] = useState(initial?.parcelId != null ? String(initial.parcelId) : '')
  const [cropId, setCropId] = useState(initial?.cropId != null ? String(initial.cropId) : '')
  const [oyaId, setOyaId] = useState(initial?.oyaId != null ? String(initial.oyaId) : '')
  const [treeId, setTreeId] = useState(initial?.treeId != null ? String(initial.treeId) : '')
  const [elementValue, setElementValue] = useState('')
  const [volume, setVolume] = useState(initial?.volumeLiters != null ? String(initial.volumeLiters) : '')
  const [quantity, setQuantity] = useState(initial?.quantityKg != null ? String(initial.quantityKg) : '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [photos, setPhotos] = useState<string[]>(initial?.photoUrls ?? [])

  // En saisie manuelle d'une observation/probleme (config 'element' sans brouillon), on garde
  // le selecteur combine d'origine. Des qu'un brouillon porte une cible, on bascule sur des
  // selecteurs individuels (parcelle ET culture possibles simultanement).
  const hasDraftTarget =
    initial != null &&
    (initial.parcelId != null ||
      initial.cropId != null ||
      initial.oyaId != null ||
      initial.treeId != null)
  const useLegacyElement = config.target === 'element' && !hasDraftTarget
  const visible = visibleTargets(config, initial)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const entry: NewLogEntry = { type: config.type, date }
    if (config.withTime) entry.time = time

    if (useLegacyElement) {
      if (elementValue) {
        const [kind, id] = elementValue.split(':')
        if (kind === 'parcelle') entry.parcelId = Number(id)
        else if (kind === 'culture') entry.cropId = Number(id)
        else if (kind === 'arbre') entry.treeId = Number(id)
      }
    } else {
      if (visible.has('parcelle') && parcelId) entry.parcelId = Number(parcelId)
      if (visible.has('culture') && cropId) entry.cropId = Number(cropId)
      if (visible.has('oya') && oyaId) entry.oyaId = Number(oyaId)
      if (visible.has('arbre') && treeId) entry.treeId = Number(treeId)
    }

    if (config.measure === 'volume' && volume) entry.volumeLiters = Number(volume)
    if (config.measure === 'quantite' && quantity) entry.quantityKg = Number(quantity)
    if (config.measure === 'description' && description) entry.description = description
    if (config.measure === 'titre_description') {
      if (title) entry.title = title
      if (description) entry.description = description
    }

    if (photos.length) entry.photoUrls = photos

    await addLogEntry(entry)
    onSaved()
  }

  const fieldClass =
    'w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-950'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1 self-start text-sm text-green-700"
      >
        <ArrowLeft className="size-4" /> Retour
      </button>

      <h1 className="text-xl font-semibold text-green-950">{LOG_TYPE_LABELS[config.type]}</h1>

      {!useLegacyElement && visible.has('parcelle') && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Parcelle
          <select
            aria-label="Parcelle"
            value={parcelId}
            onChange={(e) => setParcelId(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucune)</option>
            {parcels.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </label>
      )}

      {!useLegacyElement && visible.has('culture') && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Culture
          <select
            aria-label="Culture"
            value={cropId}
            onChange={(e) => setCropId(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucune)</option>
            {crops.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      {!useLegacyElement && visible.has('oya') && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Oya
          <select
            aria-label="Oya"
            value={oyaId}
            onChange={(e) => setOyaId(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucune)</option>
            {oyas.map((o) => (
              <option key={o.id} value={String(o.id)}>{o.name}</option>
            ))}
          </select>
        </label>
      )}

      {!useLegacyElement && visible.has('arbre') && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Arbre
          <select
            aria-label="Arbre"
            value={treeId}
            onChange={(e) => setTreeId(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucun)</option>
            {trees.map((t) => (
              <option key={t.id} value={String(t.id)}>{t.name}</option>
            ))}
          </select>
        </label>
      )}

      {useLegacyElement && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Élément concerné (optionnel)
          <select
            aria-label="Élément concerné"
            value={elementValue}
            onChange={(e) => setElementValue(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucun)</option>
            <optgroup label="Parcelles">
              {parcels.map((p) => (
                <option key={`p${p.id}`} value={`parcelle:${p.id}`}>{p.name}</option>
              ))}
            </optgroup>
            <optgroup label="Cultures">
              {crops.map((c) => (
                <option key={`c${c.id}`} value={`culture:${c.id}`}>{c.name}</option>
              ))}
            </optgroup>
            <optgroup label="Arbres">
              {trees.map((t) => (
                <option key={`t${t.id}`} value={`arbre:${t.id}`}>{t.name}</option>
              ))}
            </optgroup>
          </select>
        </label>
      )}

      {config.measure === 'volume' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Volume (litres)
          <input
            aria-label="Volume (litres)"
            type="number"
            inputMode="numeric"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className={fieldClass}
          />
        </label>
      )}

      {config.measure === 'quantite' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Quantité (kg)
          <input
            aria-label="Quantité (kg)"
            type="number"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={fieldClass}
          />
        </label>
      )}

      {config.measure === 'titre_description' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Titre
          <input
            aria-label="Titre"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={fieldClass}
          />
        </label>
      )}

      {(config.measure === 'description' || config.measure === 'titre_description') && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Description
          <textarea
            aria-label="Description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={fieldClass}
          />
        </label>
      )}

      <PhotoInput photos={photos} onChange={setPhotos} />

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm text-green-800">
          Date
          <input
            aria-label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={fieldClass}
          />
        </label>
        {config.withTime && (
          <label className="flex flex-1 flex-col gap-1 text-sm text-green-800">
            Heure
            <input
              aria-label="Heure"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={fieldClass}
            />
          </label>
        )}
      </div>

      <button
        type="submit"
        className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white"
      >
        Valider
      </button>
    </form>
  )
}

export function QuickAddPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const voiceDraft = (location.state as { voiceDraft?: Partial<NewLogEntry> } | null)?.voiceDraft

  // Brouillon consomme une seule fois : on capture a l'init, puis on nettoie le router state
  // pour qu'un retour arriere ou un rafraichissement ne rouvre pas le formulaire prerempli.
  const initialDraft = useRef(voiceDraft).current
  const [view, setView] = useState<View>(() =>
    initialDraft ? configForType(initialDraft.type ?? 'note') : 'grid',
  )
  const [draft, setDraft] = useState<Partial<NewLogEntry> | undefined>(initialDraft)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  useEffect(() => {
    if (voiceDraft) {
      navigate(location.pathname, { replace: true, state: null })
    }
    // On ne veut nettoyer qu'une fois, a l'arrivee du brouillon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function backToGrid() {
    setDraft(undefined)
    setView('grid')
  }

  if (view === 'autre') {
    return (
      <section className="flex flex-col gap-4">
        <button
          type="button"
          onClick={backToGrid}
          className="flex items-center gap-1 self-start text-sm text-green-700"
        >
          <ArrowLeft className="size-4" /> Retour
        </button>
        <h1 className="text-xl font-semibold text-green-950">Autre type d'entrée</h1>
        <ul className="flex flex-col gap-2">
          {OTHER_TYPES.map((type) => {
            const Icon = LOG_TYPE_ICONS[type]
            return (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => setView(genericConfig(type))}
                  className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left shadow-sm"
                >
                  <span className="grid size-9 place-items-center rounded-lg bg-green-100 text-green-700">
                    <Icon className="size-4.5" />
                  </span>
                  <span className="text-sm font-medium text-green-950">{LOG_TYPE_LABELS[type]}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  if (view !== 'grid') {
    return (
      <EntryForm
        config={view}
        initial={draft}
        onSaved={() => {
          setConfirmation('Entrée ajoutée au journal.')
          backToGrid()
        }}
        onCancel={backToGrid}
      />
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-green-950">Saisie rapide</h1>
      {confirmation && (
        <p className="rounded-lg bg-green-100 px-3 py-2 text-sm text-green-800">{confirmation}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {FREQUENT.map((config) => {
          const Icon = LOG_TYPE_ICONS[config.type]
          return (
            <button
              key={config.type}
              type="button"
              onClick={() => {
                setConfirmation(null)
                setDraft(undefined)
                setView(config)
              }}
              className="flex flex-col items-center gap-2 rounded-2xl bg-white px-3 py-5 shadow-sm"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-green-100 text-green-700">
                <Icon className="size-6" />
              </span>
              <span className="text-sm font-medium text-green-950">{LOG_TYPE_LABELS[config.type]}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => {
            setConfirmation(null)
            setDraft(undefined)
            setView('autre')
          }}
          className="flex flex-col items-center gap-2 rounded-2xl bg-white px-3 py-5 shadow-sm"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-green-100 text-green-700">
            <MoreHorizontal className="size-6" />
          </span>
          <span className="text-sm font-medium text-green-950">Autre…</span>
        </button>
      </div>
    </section>
  )
}
