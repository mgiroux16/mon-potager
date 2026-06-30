import type { Crop, Expense, GardenLogEntry, Parcel, Variety } from '../data/model'
import type { LogRefs } from './logView'
import { describeLogEntry } from './logView'
import type { HarvestRow } from './harvestService'
import type { CropSeasonRow, ParcelSeasonRow } from './seasonSummaryService'

export type AttachmentKind = 'journal' | 'culture' | 'saison' | 'depenses'

/** Une pièce jointe sélectionnable : texte compact prêt à joindre au prompt Gemini. */
export interface Attachment {
  kind: AttachmentKind
  label: string
  text: string
}

function formatEuros(value: number): string {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`
}

/** Extrait du journal sur une période [from, to] (dates ISO incluses). */
export function buildJournalAttachment({
  entries,
  refs,
  from,
  to,
}: {
  entries: GardenLogEntry[]
  refs: LogRefs
  from: string
  to: string
}): Attachment {
  const inRange = entries
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))

  const lines = inRange.map((e) => {
    const view = describeLogEntry(e, refs)
    const parts = [view.typeLabel]
    if (view.target) parts.push(view.target)
    if (view.detail) parts.push(view.detail)
    return `${e.date} : ${parts.join(' · ')}`
  })

  const text =
    lines.length > 0
      ? `Journal du ${from} au ${to} :\n${lines.join('\n')}`
      : `Journal du ${from} au ${to} : aucune entrée.`

  return { kind: 'journal', label: `Journal (${from} → ${to})`, text }
}

/** Fiche d'une culture : infos de base + récoltes connues. */
export function buildCropAttachment({
  crop,
  harvestRows,
  variety,
  parcel,
}: {
  crop: Crop
  harvestRows: HarvestRow[]
  variety?: Variety
  parcel?: Parcel
}): Attachment {
  const lines = [`Culture : ${crop.name}`]
  if (variety) lines.push(`Variété : ${variety.name}`)
  if (parcel) lines.push(`Parcelle : ${parcel.name}`)
  if (crop.status) lines.push(`Statut : ${crop.status}`)
  if (crop.sowingDate) lines.push(`Semis : ${crop.sowingDate}`)
  if (crop.plantingDate) lines.push(`Plantation : ${crop.plantingDate}`)
  if (crop.plantCount != null) lines.push(`Nombre de plants : ${crop.plantCount}`)
  if (crop.notes) lines.push(`Notes : ${crop.notes}`)

  const cropHarvests = harvestRows.filter((h) => h.cropId === crop.id)
  if (cropHarvests.length > 0) {
    lines.push('Récoltes par année :')
    for (const h of cropHarvests) {
      const euros = h.totalEuros != null ? ` (${formatEuros(h.totalEuros)})` : ''
      lines.push(`- ${h.year} : ${h.totalKg} kg${euros}`)
    }
  }

  return { kind: 'culture', label: `Fiche culture : ${crop.name}`, text: lines.join('\n') }
}

/** Synthèse de saison : lignes par culture et par parcelle (services/seasonSummaryService). */
export function buildSeasonAttachment({
  cropRows,
  parcelRows,
  year,
}: {
  cropRows: CropSeasonRow[]
  parcelRows: ParcelSeasonRow[]
  year: number
}): Attachment {
  const lines = [`Synthèse de saison ${year}`]

  if (cropRows.length > 0) {
    lines.push('Par culture :')
    for (const r of cropRows) {
      const net = r.netEuros != null ? ` · net ${formatEuros(r.netEuros)}` : ''
      lines.push(`- ${r.cropName} (${r.varietyName ?? 'non précisée'}) : ${r.totalKg} kg${net}`)
    }
  }

  if (parcelRows.length > 0) {
    lines.push('Par parcelle :')
    for (const r of parcelRows) {
      const net = r.netEuros != null ? ` · net ${formatEuros(r.netEuros)}` : ''
      lines.push(
        `- ${r.parcelName} : ${r.totalKg} kg${net} · ${r.totalWaterLiters} L arrosés · ${r.totalRainLiters} L de pluie`,
      )
    }
  }

  if (cropRows.length === 0 && parcelRows.length === 0) {
    lines.push('Rien à montrer pour cette année.')
  }

  return { kind: 'saison', label: `Synthèse de saison ${year}`, text: lines.join('\n') }
}

/** Liste des dépenses d'une année. */
export function buildExpensesAttachment({
  expenses,
  year,
}: {
  expenses: Expense[]
  year: number
}): Attachment {
  const yearExpenses = expenses
    .filter((e) => e.date.startsWith(String(year)))
    .sort((a, b) => a.date.localeCompare(b.date))

  const lines = yearExpenses.map(
    (e) => `${e.date} : ${e.label} · ${formatEuros(e.amountEuros)}${e.category ? ` · ${e.category}` : ''}`,
  )

  const total = yearExpenses.reduce((sum, e) => sum + e.amountEuros, 0)

  const text =
    lines.length > 0
      ? `Dépenses ${year} (total ${formatEuros(total)}) :\n${lines.join('\n')}`
      : `Dépenses ${year} : aucune dépense enregistrée.`

  return { kind: 'depenses', label: `Dépenses ${year}`, text }
}
