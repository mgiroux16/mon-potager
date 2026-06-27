import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sprout, Trees, MapPin, Pencil, Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { db } from '../data/db'
import type { Crop, VegetableFamily } from '../data/model'
import { getInactiveParcels, getHarvestReminders, getRotationReminders } from '../services/reminderService'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatPrice(price: number): string {
  return `${price.toLocaleString('fr-FR')} €/kg`
}

const FAMILY_LABELS: Record<VegetableFamily, string> = {
  solanacees: 'solanacées',
  cucurbitacees: 'cucurbitacées',
  fabacees: 'fabacées',
  brassicacees: 'brassicacées',
  alliacees: 'alliacées',
  apiacees: 'apiacées',
  asteracees: 'astéracées',
  chenopodiacees: 'chénopodiacées',
  autres: 'autres',
}

function CropPrice({ crop }: { crop: Crop }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(crop.pricePerKg != null ? String(crop.pricePerKg) : '')

  async function save() {
    setEditing(false)
    const parsed = value.trim() === '' ? undefined : Number(value.replace(',', '.'))
    if (crop.id != null && parsed != null && !Number.isNaN(parsed)) {
      await db.crops.update(crop.id, { pricePerKg: parsed })
    }
  }

  if (editing) {
    return (
      <input
        aria-label="Prix au kg en euros"
        type="number"
        step="0.01"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        className="ml-2 w-20 rounded border border-green-300 px-1 text-sm"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label="Renseigner le prix au kg"
      className="ml-2 inline-flex items-center gap-1 text-sm text-gray-500"
    >
      {crop.pricePerKg != null ? formatPrice(crop.pricePerKg) : <Pencil size={14} />}
    </button>
  )
}

export function GardenPage() {
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const trees = useLiveQuery(() => db.trees.toArray(), [], [])
  const log = useLiveQuery(() => db.log.toArray(), [], [])
  const catalog = useLiveQuery(() => db.catalog.toArray(), [], [])

  const today = todayISO()
  const inactiveParcels = getInactiveParcels(parcels, log, today)
  const harvestReminders = getHarvestReminders(crops, catalog, log, today)
  const rotationReminders = getRotationReminders(parcels, crops, catalog, today)
  const hasReminders =
    inactiveParcels.length > 0 || harvestReminders.length > 0 || rotationReminders.length > 0

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-green-800">Mon jardin</h1>

      {hasReminders ? (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-green-700">
            <Bell size={18} /> Rappels
          </h2>
          <ul className="mt-2 space-y-1">
            {inactiveParcels.map((r) => (
              <li key={`parcel-${r.parcel.id}`} className="rounded bg-amber-50 px-3 py-2 text-sm">
                {r.parcel.name} : rien noté depuis{' '}
                {r.daysSinceLastEntry == null ? 'jamais' : `${r.daysSinceLastEntry} j`}
              </li>
            ))}
            {harvestReminders.map((r) => (
              <li key={`harvest-${r.crop.id}`} className="rounded bg-amber-50 px-3 py-2 text-sm">
                {r.vegetable} : {r.referenceKind === 'semis' ? 'semé(e)' : 'planté(e)'} il y a{' '}
                {r.daysSinceReference} j, récolte possible
              </li>
            ))}
            {rotationReminders.map((r) => (
              <li key={`rotation-${r.crop.id}`} className="rounded bg-amber-50 px-3 py-2 text-sm">
                {r.parcel.name} : {FAMILY_LABELS[r.family]} déjà cultivées ici l'an dernier, attention à
                la rotation
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-green-700">
          <MapPin size={18} /> Parcelles
        </h2>
        <ul className="mt-2 space-y-1">
          {parcels.map((p) => (
            <li key={p.id} className="rounded bg-green-50 px-3 py-2">
              <span className="font-medium">{p.name}</span>
              {p.areaM2 ? <span className="text-sm text-gray-500"> · {p.areaM2} m²</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-green-700">
          <Sprout size={18} /> Cultures
        </h2>
        <ul className="mt-2 space-y-1">
          {crops.map((c) => (
            <li key={c.id} className="flex items-center rounded bg-green-50 px-3 py-2">
              <span>{c.name}</span>
              <CropPrice crop={c} />
            </li>
          ))}
        </ul>
        <Link to="/recoltes" className="mt-2 inline-block text-sm font-medium text-green-700">
          Voir le bilan des récoltes →
        </Link>
        <Link to="/bilan" className="mt-2 inline-block text-sm font-medium text-green-700">
          Voir le bilan de saison →
        </Link>
        <Link to="/calendrier" className="mt-2 block text-sm font-medium text-green-700">
          Voir le calendrier du mois →
        </Link>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-green-700">
          <Trees size={18} /> Verger
        </h2>
        <ul className="mt-2 space-y-1">
          {trees.map((t) => (
            <li key={t.id} className="rounded bg-green-50 px-3 py-2">
              {t.name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
