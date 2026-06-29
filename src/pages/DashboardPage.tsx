import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { LayoutDashboard, CloudRain, Sun, Wind, Droplets, Sunrise, Sunset } from 'lucide-react'
import { getSettings } from '../services/settingsService'
import {
  fetchCurrentDetail,
  fetchForecastDetail,
  weatherCodeLabel,
  type CurrentWeatherDetail,
  type DailyWeatherDetail,
} from '../services/weatherService'

function formatDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatTime(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function WeatherWidget({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [current, setCurrent] = useState<CurrentWeatherDetail | null>(null)
  const [forecast, setForecast] = useState<DailyWeatherDetail[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      fetchCurrentDetail(latitude, longitude),
      fetchForecastDetail(latitude, longitude, 5),
    ]).then(([cur, days]) => {
      if (!alive) return
      setCurrent(cur)
      setForecast(days)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [latitude, longitude])

  if (loading) {
    return <p className="text-sm text-green-700/70">Chargement météo…</p>
  }

  if (!current && !forecast) {
    return <p className="text-sm text-green-700/70">Météo indisponible (hors ligne ?)</p>
  }

  const today = forecast?.[0]

  return (
    <div className="space-y-3">
      {(current || today) && (
        <div className="rounded-xl bg-blue-50 p-3">
          <div className="flex items-center gap-3">
            <Sun className="size-6 text-amber-500" />
            <div className="text-sm text-blue-900">
              {current?.tempC != null && (
                <span className="text-base font-semibold">{Math.round(current.tempC)}°C</span>
              )}
              {today && (
                <span className="ml-2 text-blue-700/70">
                  {Math.round(today.tempMinC)}° / {Math.round(today.tempMaxC)}°
                </span>
              )}
              {today && (
                <span className="ml-2 text-blue-700/70">{weatherCodeLabel(today.weatherCode)}</span>
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-3 text-xs text-blue-800">
            {today != null && today.rainMm > 0 && (
              <span className="flex items-center gap-1">
                <CloudRain className="size-3.5" />
                {today.rainMm} mm
              </span>
            )}
            {current?.humidityPct != null && (
              <span className="flex items-center gap-1">
                <Droplets className="size-3.5" />
                {Math.round(current.humidityPct)} % humidité
              </span>
            )}
            {current?.windKmh != null && (
              <span className="flex items-center gap-1">
                <Wind className="size-3.5" />
                {Math.round(current.windKmh)} km/h
              </span>
            )}
            {today?.windMaxKmh != null && today.windMaxKmh > 0 && (
              <span className="flex items-center gap-1">
                <Wind className="size-3.5" />
                rafales {Math.round(today.windMaxKmh)} km/h
              </span>
            )}
            {today?.uvIndexMax != null && today.uvIndexMax > 0 && (
              <span>UV max {today.uvIndexMax.toFixed(1)}</span>
            )}
            {formatTime(today?.sunrise ?? null) && (
              <span className="flex items-center gap-1">
                <Sunrise className="size-3.5" />
                {formatTime(today?.sunrise ?? null)}
              </span>
            )}
            {formatTime(today?.sunset ?? null) && (
              <span className="flex items-center gap-1">
                <Sunset className="size-3.5" />
                {formatTime(today?.sunset ?? null)}
              </span>
            )}
          </div>
        </div>
      )}

      {forecast && forecast.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto">
          {forecast.slice(1).map((d) => (
            <li
              key={d.date}
              className="flex shrink-0 flex-col items-center gap-1 rounded-lg bg-green-50 px-2 py-2 text-xs text-green-900"
            >
              <span className="font-medium">{formatDayLabel(d.date)}</span>
              <span>
                {Math.round(d.tempMinC)}° / {Math.round(d.tempMaxC)}°
              </span>
              <span className="text-center text-green-700/70">{weatherCodeLabel(d.weatherCode)}</span>
              {d.rainMm > 0 && (
                <span className="flex items-center gap-0.5 text-blue-700">
                  <CloudRain className="size-3" />
                  {d.rainMm}mm
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function DashboardPage() {
  const settings = useLiveQuery(() => getSettings(), [], undefined)

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-green-100 text-green-700">
          <LayoutDashboard className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-green-950">Tableau de bord</h1>
          <p className="text-sm text-green-700/70">L'essentiel du jour, en un coup d'œil</p>
        </div>
      </header>

      {settings ? (
        <WeatherWidget latitude={settings.latitude} longitude={settings.longitude} />
      ) : (
        <p className="text-sm text-green-700/70">Chargement…</p>
      )}

      <div className="rounded-2xl border border-dashed border-green-300 bg-white/60 p-6 text-center">
        <p className="text-sm font-medium text-green-800">À venir</p>
        <p className="mt-1 text-sm text-green-700/70">
          Palier 5 : litres de la semaine, réserve d'eau et autonomie. Palier 7 : le « à faire
          aujourd'hui ».
        </p>
      </div>
    </section>
  )
}
