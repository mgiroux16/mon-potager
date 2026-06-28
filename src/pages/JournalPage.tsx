import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { NotebookPen } from 'lucide-react'
import { db } from '../data/db'
import { listLog } from '../services/logService'
import {
  describeLogEntry,
  formatLogDate,
  formatSnapshotTemp,
  LOG_TYPE_LABELS,
  resolveTargetName,
  type LogRefs,
} from '../services/logView'
import { searchLogEntries } from '../services/logSearch'
import { fetchDailyHistory, type DailyWeather } from '../services/weatherService'
import {
  summarizeWeather,
  describeWeatherContext,
  countArrosagesBetween,
} from '../services/weatherSummary'
import { getSettings } from '../services/settingsService'
import { callGemini } from '../services/geminiService'
import {
  buildDiagnosticPrompt,
  parseDiagnosticResponse,
  createDiagnostic,
} from '../services/diagnosticService'
import { buildSeasonHistoryLines } from '../services/diagnosticContext'
import { LOG_TYPE_ICONS } from '../components/logTypeIcons'
import { PhotoThumbs } from '../components/PhotoThumbs'
import { WeatherContextBanner } from '../components/WeatherContextBanner'
import type { Diagnostic, GardenLogEntry, LogEntryType, SeasonNote } from '../data/model'

function chipClass(active: boolean): string {
  return [
    'rounded-full px-3 py-1 text-sm font-medium transition-colors',
    active ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800 hover:bg-green-200',
  ].join(' ')
}

function DiagnoseButton({
  entry,
  history,
  entries,
  seasonNotes,
  diagnostics,
  geminiApiKey,
}: {
  entry: GardenLogEntry
  history: DailyWeather[] | null
  entries: GardenLogEntry[]
  seasonNotes: SeasonNote[]
  diagnostics: Diagnostic[]
  geminiApiKey: string | undefined
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const existing = diagnostics.find((d) => d.problemEntryId === entry.id)
  if (existing) {
    return (
      <Link to="/diagnostics" className="text-xs font-medium text-green-700">
        Voir le diagnostic →
      </Link>
    )
  }

  async function diagnose() {
    if (!geminiApiKey) {
      setStatus('error')
      setError('Aucune clé Gemini configurée dans les réglages.')
      return
    }
    setStatus('loading')
    setError(null)
    try {
      const cutoff = new Date(entry.date)
      cutoff.setDate(cutoff.getDate() - 14)
      const cutoffISO = cutoff.toISOString().slice(0, 10)
      const recentEntries = entries.filter(
        (e) =>
          e.date >= cutoffISO &&
          e.date <= entry.date &&
          (e.cropId === entry.cropId || e.parcelId === entry.parcelId),
      )
      const weatherSummary = history
        ? `Pluie cumulee 14 jours : ${history
            .slice(-14)
            .reduce((sum, d) => sum + d.rainMm, 0)
            .toFixed(1)} mm. Temperature max recente : ${Math.max(
            ...history.slice(-14).map((d) => d.tempMaxC),
          )} °C.`
        : 'Donnees meteo indisponibles.'
      const seasonHistory = buildSeasonHistoryLines({ cropId: entry.cropId, notes: seasonNotes, diagnostics })
      const prompt = buildDiagnosticPrompt({ problemEntry: entry, recentEntries, weatherSummary, seasonHistory })
      const raw = await callGemini(prompt, geminiApiKey)
      const hypotheses = parseDiagnosticResponse(raw)
      await createDiagnostic({
        problemEntryId: entry.id as string,
        cropId: entry.cropId,
        parcelId: entry.parcelId,
        treeId: entry.treeId,
        hypotheses,
      })
      setStatus('idle')
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={diagnose}
        disabled={status === 'loading'}
        className="text-xs font-medium text-green-700 disabled:opacity-50"
      >
        {status === 'loading' ? 'Analyse en cours…' : 'Diagnostiquer'}
      </button>
      {status === 'error' && error && (
        <p className="mt-1 text-xs text-red-700">
          {error}{' '}
          <button type="button" onClick={diagnose} className="font-medium underline">
            Réessayer
          </button>
        </p>
      )}
    </div>
  )
}

export function JournalPage() {
  const entries = useLiveQuery(() => listLog(), [], [])
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const oyas = useLiveQuery(() => db.oyas.toArray(), [], [])
  const trees = useLiveQuery(() => db.trees.toArray(), [], [])
  const [filter, setFilter] = useState<LogEntryType | 'tout'>('tout')
  const [query, setQuery] = useState('')
  const settings = useLiveQuery(() => getSettings(), [], undefined)
  const seasonNotes = useLiveQuery(() => db.seasonNotes.toArray(), [], [])
  const diagnostics = useLiveQuery(() => db.diagnostics.toArray(), [], [])
  const [history, setHistory] = useState<DailyWeather[] | null>(null)

  useEffect(() => {
    if (!settings) return
    let alive = true
    fetchDailyHistory(settings.latitude, settings.longitude, 30).then((h) => {
      if (alive) setHistory(h)
    })
    return () => {
      alive = false
    }
  }, [settings])

  function contextFor(entry: GardenLogEntry): string | null {
    if (!history || !settings) return null
    if (entry.type !== 'observation' && entry.type !== 'probleme') return null
    const opts = {
      heatThresholdC: settings.heatThresholdC,
      significantRainMm: settings.significantRainMm,
    }
    const summary = summarizeWeather(history, entry.date, opts)
    const start = history.length > 0 ? history[Math.max(0, history.length - 14)].date : entry.date
    const arrosages = countArrosagesBetween(entries, start, entry.date)
    return describeWeatherContext(summary, arrosages)
  }

  const refs: LogRefs = {
    parcels: new Map(parcels.map((p) => [p.id!, p] as [string, typeof p])),
    crops: new Map(crops.map((c) => [c.id!, c] as [string, typeof c])),
    oyas: new Map(oyas.map((o) => [o.id!, o] as [string, typeof o])),
    trees: new Map(trees.map((t) => [t.id!, t] as [string, typeof t])),
  }

  if (entries.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        <header className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-green-100 text-green-700">
            <NotebookPen className="size-5" />
          </span>
          <h1 className="text-xl font-semibold text-green-950">Journal</h1>
        </header>
        <div className="rounded-2xl border border-dashed border-green-300 bg-white/60 p-6 text-center">
          <p className="text-sm font-medium text-green-800">Rien encore, note ta première action.</p>
          <Link
            to="/ajouter"
            className="mt-3 inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white"
          >
            Ajouter une entrée
          </Link>
        </div>
      </section>
    )
  }

  const presentTypes = [...new Set(entries.map((e) => e.type))]
  const typeFiltered = filter === 'tout' ? entries : entries.filter((e) => e.type === filter)
  const shown = searchLogEntries(typeFiltered, query, (e) => resolveTargetName(e, refs))
  const now = new Date()

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-green-950">Journal</h1>

      <input
        type="search"
        aria-label="Rechercher"
        placeholder="Rechercher"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-950"
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setFilter('tout')} className={chipClass(filter === 'tout')}>
          Tout
        </button>
        {presentTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setFilter(type)}
            className={chipClass(filter === type)}
          >
            {LOG_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {shown.map((entry) => {
          const view = describeLogEntry(entry, refs)
          const Icon = LOG_TYPE_ICONS[entry.type]
          return (
            <li
              key={entry.id}
              className="flex items-start gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm"
            >
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-green-100 text-green-700">
                <Icon className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-green-950">
                  {view.typeLabel}
                  {view.target ? ` · ${view.target}` : ''}
                </p>
                {view.detail && <p className="truncate text-sm text-green-700/80">{view.detail}</p>}
                <WeatherContextBanner text={contextFor(entry)} />
                {entry.photoUrls && entry.photoUrls.length > 0 && (
                  <PhotoThumbs urls={entry.photoUrls} />
                )}
                {entry.type === 'probleme' && (
                  <DiagnoseButton
                    entry={entry}
                    history={history}
                    entries={entries}
                    seasonNotes={seasonNotes}
                    diagnostics={diagnostics}
                    geminiApiKey={settings?.geminiApiKey}
                  />
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs text-green-700/60">{formatLogDate(entry, now)}</span>
                {formatSnapshotTemp(entry.weather) && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                    {formatSnapshotTemp(entry.weather)}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
