import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  CloudRain,
  Droplets,
  Leaf,
  PackageOpen,
  Snowflake,
  Sprout,
  Sun,
  TreePine,
  Wheat,
} from 'lucide-react'
import { db } from '../data/db'
import { getSettings } from '../services/settingsService'
import {
  fetchCurrentDetail,
  fetchDailyHistory,
  fetchForecastDetail,
  weatherCodeLabel,
  type CurrentWeatherDetail,
  type DailyWeather,
  type DailyWeatherDetail,
} from '../services/weatherService'
import { getTodayAgenda, type AgendaItem, type AgendaItemKind } from '../services/todayAgendaService'
import { summarizeTankAutonomy } from '../services/tankAutonomyService'
import { summarizeHarvests } from '../services/harvestService'
import type { NewLogEntry } from '../services/logService'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ——— Icône et couleur par type d'agenda ———
function agendaIcon(kind: AgendaItemKind) {
  switch (kind) {
    case 'alerte_gel': return <Snowflake className="size-4 text-blue-500" />
    case 'cuve_basse': return <PackageOpen className="size-4 text-blue-600" />
    case 'arrosage':   return <Droplets className="size-4 text-blue-500" />
    case 'recolte':    return <Wheat className="size-4 text-amber-500" />
    case 'semis':      return <Sprout className="size-4 text-green-600" />
    case 'plantation': return <TreePine className="size-4 text-green-700" />
  }
}

function agendaBorderColor(priority: 1 | 2 | 3): string {
  if (priority === 1) return 'border-l-red-400'
  if (priority === 2) return 'border-l-blue-300'
  return 'border-l-green-300'
}

function agendaActionDraft(item: AgendaItem): Partial<NewLogEntry> | undefined {
  if (item.kind === 'arrosage' && item.parcelId) {
    return { type: 'arrosage', parcelId: item.parcelId }
  }
  if (item.kind === 'recolte' && item.cropId) {
    return { type: 'recolte', cropId: item.cropId }
  }
  if (item.kind === 'semis') return { type: 'semis' }
  if (item.kind === 'plantation') return { type: 'plantation' }
  return undefined
}

// ——— Composant carte métrique ———
function MetricCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-green-100 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs text-green-700/60">
        {icon}
        {label}
      </div>
      <span className="text-lg font-semibold text-green-900 leading-none">{value}</span>
      {sub && <span className="text-xs text-green-700/50">{sub}</span>}
    </div>
  )
}

// ——— Widget météo condensé ———
function WeatherCondensed({
  current,
  today,
}: {
  current: CurrentWeatherDetail | null
  today: DailyWeatherDetail | null
}) {
  const [open, setOpen] = useState(false)

  if (!current && !today) return null

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2 text-sm text-blue-900">
          <Sun className="size-4 text-amber-500 shrink-0" />
          <span className="font-medium">
            {current?.tempC != null ? `${Math.round(current.tempC)} °C` : ''}
            {today && (
              <span className="ml-2 font-normal text-blue-700/70">
                {Math.round(today.tempMinC)}° / {Math.round(today.tempMaxC)}°
              </span>
            )}
          </span>
          {today && today.rainMm > 0 && (
            <span className="flex items-center gap-1 text-blue-700/70">
              <CloudRain className="size-3.5" />
              {today.rainMm} mm
            </span>
          )}
          {today && (
            <span className="text-blue-700/60 hidden sm:inline">
              {weatherCodeLabel(today.weatherCode)}
            </span>
          )}
        </div>
        <ChevronDown
          className={`size-4 text-blue-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && today && (
        <div className="border-t border-blue-100 px-3 pb-3 pt-2">
          <ForecastDetail />
        </div>
      )}
    </div>
  )
}

function ForecastDetail() {
  const [forecast, setForecast] = useState<DailyWeatherDetail[] | null>(null)
  const settings = useLiveQuery(() => getSettings(), [], undefined)

  useEffect(() => {
    if (!settings) return
    fetchForecastDetail(settings.latitude, settings.longitude, 15).then(setForecast)
  }, [settings])

  if (!forecast) return <p className="text-xs text-blue-700/60">Chargement prévisions…</p>

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {forecast.slice(1).map((d) => (
        <div
          key={d.date}
          className="flex shrink-0 flex-col items-center gap-0.5 rounded-lg bg-white/70 px-2 py-1.5 text-xs text-blue-900"
        >
          <span className="font-medium">{formatDayLabel(d.date)}</span>
          <span className="text-blue-700/70">
            {Math.round(d.tempMinC)}° / {Math.round(d.tempMaxC)}°
          </span>
          <span className="text-center text-blue-700/60">{weatherCodeLabel(d.weatherCode)}</span>
          {d.rainMm > 0 && (
            <span className="flex items-center gap-0.5 text-blue-600">
              <CloudRain className="size-3" />
              {d.rainMm}mm
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ——— Page principale ———
export function DashboardPage() {
  const today = todayISO()
  const navigate = useNavigate()

  // Données locales
  const settings = useLiveQuery(() => getSettings(), [], undefined)
  const parcels = useLiveQuery(() => db.parcels.toArray(), [], [])
  const crops = useLiveQuery(() => db.crops.toArray(), [], [])
  const catalog = useLiveQuery(() => db.catalog.toArray(), [], [])
  const tanks = useLiveQuery(() => db.tanks.toArray(), [], [])
  const log = useLiveQuery(() => db.log.toArray(), [], [])

  // Données météo (async, peuvent être null si hors-ligne)
  const [current, setCurrent] = useState<CurrentWeatherDetail | null>(null)
  const [todayForecast, setTodayForecast] = useState<DailyWeatherDetail | null>(null)
  const [weatherHistory, setWeatherHistory] = useState<DailyWeather[] | null | undefined>(undefined)
  const [todayTempMinC, setTodayTempMinC] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (!settings) return
    const { latitude, longitude } = settings

    Promise.all([
      fetchCurrentDetail(latitude, longitude),
      fetchForecastDetail(latitude, longitude, 1),
      fetchDailyHistory(latitude, longitude, 2),
    ]).then(([cur, forecast, history]) => {
      setCurrent(cur)
      if (forecast?.[0]) {
        setTodayForecast(forecast[0])
        setTodayTempMinC(forecast[0].tempMinC)
      }
      setWeatherHistory(history)
    })
  }, [settings])

  // Agenda
  const agendaItems = getTodayAgenda({
    parcels: parcels ?? [],
    crops: crops ?? [],
    catalog: catalog ?? [],
    tanks: tanks ?? [],
    log: log ?? [],
    today,
    weatherHistory,
    todayTempMinC,
  })

  // Métriques
  const tankSummary = summarizeTankAutonomy(tanks ?? [], log ?? [], today)

  const currentYear = new Date(today).getFullYear()
  const currentMonth = today.slice(0, 7) // 'YYYY-MM'
  const waterMonth = (log ?? [])
    .filter(
      (e) =>
        e.type === 'arrosage' &&
        e.volumeLiters != null &&
        e.date.startsWith(currentMonth),
    )
    .reduce((sum, e) => sum + (e.volumeLiters ?? 0), 0)

  const harvestRows = summarizeHarvests(log ?? [], crops ?? [])
  const totalKgSeason = harvestRows
    .filter((r) => r.year === currentYear)
    .reduce((sum, r) => sum + r.totalKg, 0)

  function handleAgendaClick(item: AgendaItem) {
    const draft = agendaActionDraft(item)
    navigate('/ajouter', draft ? { state: { voiceDraft: draft } } : undefined)
  }

  return (
    <section className="flex flex-col gap-5">
      {/* ——— Bloc 1 : Héros « À faire aujourd'hui » ——— */}
      <div>
        <h1 className="mb-3 text-xl font-semibold text-green-950">À faire aujourd'hui</h1>

        {agendaItems.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-green-100 bg-white p-4 shadow-sm">
            <Leaf className="size-5 shrink-0 text-green-500" />
            <p className="text-sm text-green-700">Tout est sous contrôle, profite de ton jardin !</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {agendaItems.map((item, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => handleAgendaClick(item)}
                  className={`flex w-full items-start gap-3 rounded-xl border-l-4 bg-white px-4 py-3 shadow-sm text-left transition-colors hover:bg-green-50 ${agendaBorderColor(item.priority)}`}
                >
                  <span className="mt-0.5 shrink-0">{agendaIcon(item.kind)}</span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-green-900">{item.label}</span>
                    {item.detail && (
                      <span className="text-xs text-green-700/60">{item.detail}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ——— Bloc 2 : Métriques ——— */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-green-700/60 uppercase tracking-wide">
          En un coup d'œil
        </h2>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MetricCard
            label="Eau ce mois"
            value={waterMonth > 0 ? `${Math.round(waterMonth)} L` : '—'}
            icon={<Droplets className="size-3.5" />}
          />
          <MetricCard
            label="Récoltes saison"
            value={totalKgSeason > 0 ? `${totalKgSeason.toFixed(1)} kg` : '—'}
            icon={<Wheat className="size-3.5" />}
          />
          <MetricCard
            label="Cuves"
            value={
              tankSummary.autonomyDays != null
                ? `${tankSummary.autonomyDays} j`
                : tankSummary.totalEstimatedLiters > 0
                  ? `${Math.round(tankSummary.totalEstimatedLiters)} L`
                  : '—'
            }
            sub={tankSummary.autonomyDays != null ? 'avant vide' : undefined}
            icon={<PackageOpen className="size-3.5" />}
          />
          <MetricCard
            label="€ saison"
            value="—"
            sub="Phase 1C"
            icon={<BarChart3 className="size-3.5" />}
          />
        </div>
      </div>

      {/* ——— Bloc 3 : Météo condensée ——— */}
      {(current || todayForecast) && settings && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-green-700/60 uppercase tracking-wide">
            Météo
          </h2>
          <WeatherCondensed current={current} today={todayForecast} />
        </div>
      )}

      {!settings && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="size-4 shrink-0" />
          Configure tes coordonnées GPS dans les Réglages pour activer la météo et les alertes.
        </div>
      )}
    </section>
  )
}
