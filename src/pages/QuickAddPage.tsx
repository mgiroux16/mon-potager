import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Euro, MoreHorizontal } from 'lucide-react'
import { useCollection } from '../data/firestoreHooks'
import type { CatalogItem, Crop, FruitTree, GardenLogEntry, LogEntryType, Oya, Parcel, Variety } from '../data/model'
import { addLogEntry, updateLogEntry, type NewLogEntry } from '../services/logService'
import { findOrCreateVariety } from '../services/varietyService'
import { fetchTodaySnapshot } from '../services/weatherService'
import { useSettings } from '../services/settingsService'
import { LOG_TYPE_LABELS, entryParcelIds } from '../services/logView'
import { LOG_TYPE_ICONS } from '../components/logTypeIcons'
import { PhotoInput } from '../components/PhotoInput'
import { ExpenseForm } from '../components/ExpenseForm'

type TargetKind = 'parcelle' | 'oya' | 'culture' | 'arbre' | 'element' | 'none'
type MeasureKind = 'volume' | 'quantite' | 'description' | 'titre_description' | 'none'

export interface FormConfig {
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

// 'depense' n'est plus ici : le bouton Dépense ouvre le formulaire Expense complet
// (table expenses, une seule source de verite). Les logs 'depense' historiques
// restent affiches dans le Journal mais ne sont plus creables ici.
const OTHER_TYPES: LogEntryType[] = [
  'semis', 'plantation', 'paillage', 'traitement', 'compost',
  'taille', 'diagnostic', 'releve_pluie', 'note',
  'floraison', 'nouaison', 'chute_fruits',
]

const TREE_OBSERVATION_TYPES: LogEntryType[] = ['floraison', 'nouaison', 'chute_fruits']

function genericConfig(type: LogEntryType): FormConfig {
  const target = TREE_OBSERVATION_TYPES.includes(type) ? 'arbre' : 'none'
  return { type, target, measure: 'titre_description', withTime: false }
}

export function configForType(type: LogEntryType): FormConfig {
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

type View = 'grid' | 'autre' | 'depense' | FormConfig

type TargetField = 'parcelle' | 'culture' | 'oya' | 'arbre'

function visibleTargets(config: FormConfig, initial?: Partial<NewLogEntry>): Set<TargetField> {
  const s = new Set<TargetField>()
  if (config.target === 'parcelle') s.add('parcelle')
  if (config.target === 'oya') s.add('oya')
  if (config.target === 'culture') s.add('culture')
  if (config.target === 'arbre') s.add('arbre')
  if (config.target === 'element') {
    s.add('parcelle')
    s.add('culture')
    s.add('arbre')
  }
  if (initial?.parcelId != null || (initial?.parcelIds?.length ?? 0) > 0) s.add('parcelle')
  if (initial?.cropId != null) s.add('culture')
  if (initial?.oyaId != null) s.add('oya')
  if (initial?.treeId != null) s.add('arbre')
  return s
}

export function EntryForm({ config, initial, editId, onSaved, onCancel }: {
  config: FormConfig
  initial?: Partial<NewLogEntry>
  // Present en mode edition : la validation met a jour cette entree au lieu d'en creer une.
  editId?: string
  onSaved: () => void
  onCancel: () => void
}) {
  const { data: parcels } = useCollection<Parcel>('parcels')
  const { data: crops } = useCollection<Crop>('crops')
  const { data: oyas } = useCollection<Oya>('oyas')
  const { data: trees } = useCollection<FruitTree>('trees')
  const { data: varieties } = useCollection<Variety>('varieties')
  const { data: catalog } = useCollection<CatalogItem>('catalog')
  const settings = useSettings()

  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [time, setTime] = useState(initial?.time ?? nowHM())
  const [parcelId, setParcelId] = useState(initial?.parcelId != null ? String(initial.parcelId) : '')
  // Arrosage seulement : plusieurs parcelles possibles (goutte-à-goutte commun).
  const [parcelIds, setParcelIds] = useState<string[]>(
    initial ? entryParcelIds(initial as { parcelId?: string; parcelIds?: string[] }) : [],
  )
  function toggleParcelId(id: string) {
    setParcelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  const [cropId, setCropId] = useState(initial?.cropId != null ? String(initial.cropId) : '')
  const [oyaId, setOyaId] = useState(initial?.oyaId != null ? String(initial.oyaId) : '')
  const [treeId, setTreeId] = useState(initial?.treeId != null ? String(initial.treeId) : '')
  const [varietyId, setVarietyId] = useState(initial?.varietyId != null ? String(initial.varietyId) : '')
  const [newVarietyName, setNewVarietyName] = useState('')
  const [elementValue, setElementValue] = useState('')
  const [volume, setVolume] = useState(initial?.volumeLiters != null ? String(initial.volumeLiters) : '')
  const [duration, setDuration] = useState(
    initial?.durationMinutes != null ? String(initial.durationMinutes) : '',
  )
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
      (initial.parcelIds?.length ?? 0) > 0 ||
      initial.cropId != null ||
      initial.oyaId != null ||
      initial.treeId != null)
  const useLegacyElement = config.target === 'element' && !hasDraftTarget
  const visible = visibleTargets(config, initial)

  const selectedCrop = crops.find((c) => c.id === cropId)
  const cropCatalog = catalog.find((c) => c.id === selectedCrop?.catalogId)
  const cropVegetable = cropCatalog?.vegetable ?? selectedCrop?.name ?? ''
  const cropVarieties = varieties.filter(
    (v) => cropVegetable && v.vegetable.toLowerCase() === cropVegetable.toLowerCase(),
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const entry: NewLogEntry = { type: config.type, date }
    if (config.withTime) entry.time = time

    if (useLegacyElement) {
      if (elementValue) {
        const [kind, id] = elementValue.split(':')
        if (kind === 'parcelle') entry.parcelId = id
        else if (kind === 'culture') entry.cropId = id
        else if (kind === 'arbre') entry.treeId = id
      }
    } else {
      if (visible.has('parcelle') && config.type === 'arrosage') {
        if (parcelIds.length === 1) entry.parcelId = parcelIds[0]
        else if (parcelIds.length > 1) entry.parcelIds = parcelIds
      } else if (visible.has('parcelle') && parcelId) {
        entry.parcelId = parcelId
      }
      if (visible.has('culture') && cropId) entry.cropId = cropId
      if (visible.has('oya') && oyaId) entry.oyaId = oyaId
      if (visible.has('arbre') && treeId) entry.treeId = treeId
    }

    if (config.measure === 'volume' && volume) entry.volumeLiters = Number(volume)
    if (config.measure === 'volume' && duration) entry.durationMinutes = Number(duration)
    if (config.measure === 'quantite' && quantity) entry.quantityKg = Number(quantity)
    if (config.measure === 'description' && description) entry.description = description
    if (config.measure === 'titre_description') {
      if (title) entry.title = title
      if (description) entry.description = description
    }

    if (photos.length) entry.photoUrls = photos

    // Variété : id existant, ou création à la volée si « + Nouvelle variété… »
    if (entry.cropId != null) {
      if (varietyId === '__new' && newVarietyName.trim()) {
        entry.varietyId = findOrCreateVariety(varieties, newVarietyName, cropVegetable || 'Inconnu')
      } else if (varietyId && varietyId !== '__new') {
        entry.varietyId = varietyId
      }
    }

    // Transport depuis un brouillon vocal (phrase d'origine), si présent.
    if (initial?.sourcePhrase) entry.sourcePhrase = initial.sourcePhrase

    // Snapshot météo figé, seulement pour une saisie datée d'aujourd'hui. Jamais bloquant.
    if (date === todayISO() && settings) {
      const snap = await fetchTodaySnapshot(settings.latitude, settings.longitude)
      if (snap) entry.weather = snap
    }

    if (editId) {
      await updateLogEntry(editId, entry)
    } else {
      await addLogEntry(entry)
    }
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

      <h1 className="text-xl font-semibold text-green-950">
        {editId ? 'Modifier : ' : ''}
        {LOG_TYPE_LABELS[config.type]}
      </h1>

      {initial?.sourcePhrase && (
        <blockquote className="rounded-lg border-l-4 border-green-300 bg-green-50 px-3 py-2 text-sm italic text-green-900">
          Tu as dit : « {initial.sourcePhrase} »
        </blockquote>
      )}

      {!useLegacyElement && visible.has('parcelle') && config.type === 'arrosage' && (
        <fieldset className="flex flex-col gap-1.5 text-sm text-green-800">
          <legend className="mb-1">Parcelles arrosées</legend>
          {parcels.length === 0 && <p className="text-xs text-gray-500">Aucune parcelle enregistrée.</p>}
          {parcels.map((p) => (
            <label key={p.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={parcelIds.includes(p.id as string)}
                onChange={() => toggleParcelId(p.id as string)}
              />
              {p.name}
            </label>
          ))}
          {parcelIds.length > 1 && (
            <p className="text-xs text-green-700">
              Goutte-à-goutte commun : {parcelIds.length} parcelles jointes à cette entrée.
            </p>
          )}
        </fieldset>
      )}

      {!useLegacyElement && visible.has('parcelle') && config.type !== 'arrosage' && (
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

      {!useLegacyElement && visible.has('culture') && cropId && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Variété
          <select
            aria-label="Variété"
            value={varietyId}
            onChange={(e) => setVarietyId(e.target.value)}
            className={fieldClass}
          >
            <option value="">(aucune)</option>
            {cropVarieties.map((v) => (
              <option key={v.id} value={String(v.id)}>{v.name}</option>
            ))}
            <option value="__new">+ Nouvelle variété…</option>
          </select>
        </label>
      )}

      {varietyId === '__new' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Nom de la nouvelle variété
          <input
            aria-label="Nom de la nouvelle variété"
            type="text"
            value={newVarietyName}
            onChange={(e) => setNewVarietyName(e.target.value)}
            className={fieldClass}
          />
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
          Volume (litres) — optionnel
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

      {config.measure === 'volume' && (
        <label className="flex flex-col gap-1 text-sm text-green-800">
          Durée (minutes)
          <input
            aria-label="Durée (minutes)"
            type="number"
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
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
        {editId ? 'Enregistrer les modifications' : 'Valider'}
      </button>
    </form>
  )
}

export function QuickAddPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const voiceDraft = (location.state as { voiceDraft?: Partial<NewLogEntry> } | null)?.voiceDraft
  const editEntry = (location.state as { editEntry?: GardenLogEntry } | null)?.editEntry

  // Brouillon/entree a editer consomme une seule fois : on capture a l'init, puis on
  // nettoie le router state pour qu'un retour arriere ou un rafraichissement ne rouvre
  // pas le formulaire prerempli.
  const initialDraft = useRef(voiceDraft).current
  const initialEdit = useRef(editEntry).current
  const [view, setView] = useState<View>(() => {
    if (initialEdit) return configForType(initialEdit.type)
    return initialDraft ? configForType(initialDraft.type ?? 'note') : 'grid'
  })
  const [draft, setDraft] = useState<Partial<NewLogEntry> | undefined>(initialEdit ?? initialDraft)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  useEffect(() => {
    if (voiceDraft || editEntry) {
      navigate(location.pathname, { replace: true, state: null })
    }
    // On ne veut nettoyer qu'une fois, a l'arrivee du brouillon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function backToJournal() {
    navigate('/carnet/journal')
  }

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

  if (view === 'depense') {
    return (
      <section className="flex flex-col gap-4">
        <button
          type="button"
          onClick={backToGrid}
          className="flex items-center gap-1 self-start text-sm text-indigo-700"
        >
          <ArrowLeft className="size-4" /> Retour
        </button>
        <h1 className="text-xl font-semibold text-indigo-950">Dépense</h1>
        <ExpenseForm
          onSaved={() => {
            setConfirmation('Dépense enregistrée.')
            backToGrid()
          }}
        />
      </section>
    )
  }

  if (view !== 'grid') {
    return (
      <EntryForm
        config={view}
        initial={draft}
        editId={initialEdit?.id}
        onSaved={() => {
          if (initialEdit) {
            backToJournal()
          } else {
            setConfirmation('Entrée ajoutée au journal.')
            backToGrid()
          }
        }}
        onCancel={initialEdit ? backToJournal : backToGrid}
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
            setView('depense')
          }}
          className="flex flex-col items-center gap-2 rounded-2xl bg-white px-3 py-5 shadow-sm"
        >
          <span className="grid size-11 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
            <Euro className="size-6" />
          </span>
          <span className="text-sm font-medium text-green-950">Dépense</span>
        </button>
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
