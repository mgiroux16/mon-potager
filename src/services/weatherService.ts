import type { WeatherSnapshot } from '../data/model'

const BASE = 'https://api.open-meteo.com/v1/forecast'
const DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_sum'

export interface DailyWeather {
  date: string // 'YYYY-MM-DD'
  tempMaxC: number
  tempMinC: number
  rainMm: number
}

interface ForecastResponse {
  current?: { temperature_2m?: number; precipitation?: number }
  daily?: {
    time?: string[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_sum?: number[]
  }
}

// Cache mémoire court : un seul appel d'historique réseau par fenêtre, partagé par tous
// les bandeaux de contexte du journal. TTL 30 min, invalidé par changement de coordonnées.
const HISTORY_TTL_MS = 30 * 60 * 1000
let historyCache: { key: string; at: number; data: DailyWeather[] } | null = null

// Réservé aux tests : repartir d'un cache vide.
export function __clearWeatherCache(): void {
  historyCache = null
}

async function getForecast(params: string): Promise<ForecastResponse | null> {
  try {
    const res = await fetch(`${BASE}?${params}`)
    if (!res.ok) return null
    return (await res.json()) as ForecastResponse
  } catch {
    return null
  }
}

export async function fetchTodaySnapshot(
  latitude: number,
  longitude: number,
): Promise<WeatherSnapshot | null> {
  const params =
    `latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,precipitation&daily=${DAILY}` +
    `&forecast_days=1&timezone=auto`
  const data = await getForecast(params)
  if (!data) return null
  const snap: WeatherSnapshot = { capturedAt: Date.now(), source: 'open-meteo' }
  if (data.current?.temperature_2m != null) snap.tempC = data.current.temperature_2m
  if (data.daily?.temperature_2m_max?.[0] != null) snap.tempMaxC = data.daily.temperature_2m_max[0]
  if (data.daily?.temperature_2m_min?.[0] != null) snap.tempMinC = data.daily.temperature_2m_min[0]
  if (data.daily?.precipitation_sum?.[0] != null) snap.rainMm = data.daily.precipitation_sum[0]
  return snap
}

export async function fetchDailyHistory(
  latitude: number,
  longitude: number,
  pastDays: number,
): Promise<DailyWeather[] | null> {
  const key = `${latitude},${longitude},${pastDays}`
  if (historyCache && historyCache.key === key && Date.now() - historyCache.at < HISTORY_TTL_MS) {
    return historyCache.data
  }
  const params =
    `latitude=${latitude}&longitude=${longitude}` +
    `&daily=${DAILY}&past_days=${pastDays}&forecast_days=1&timezone=auto`
  const data = await getForecast(params)
  const time = data?.daily?.time
  if (!data || !time) return null
  const daily = data.daily!
  const out: DailyWeather[] = time.map((date, i) => ({
    date,
    tempMaxC: daily.temperature_2m_max?.[i] ?? 0,
    tempMinC: daily.temperature_2m_min?.[i] ?? 0,
    rainMm: daily.precipitation_sum?.[i] ?? 0,
  }))
  historyCache = { key, at: Date.now(), data: out }
  return out
}
