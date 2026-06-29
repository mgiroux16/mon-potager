import type { WeatherSnapshot } from '../data/model'

// Codes WMO renvoyés par Open-Meteo (weather_code), regroupés en libellés FR.
const WEATHER_CODE_LABELS: Record<number, string> = {
  0: 'Ciel dégagé',
  1: 'Plutôt dégagé',
  2: 'Partiellement nuageux',
  3: 'Couvert',
  45: 'Brouillard',
  48: 'Brouillard givrant',
  51: 'Bruine légère',
  53: 'Bruine',
  55: 'Bruine dense',
  61: 'Pluie légère',
  63: 'Pluie',
  65: 'Pluie forte',
  71: 'Neige légère',
  73: 'Neige',
  75: 'Neige forte',
  77: 'Grains de neige',
  80: 'Averses légères',
  81: 'Averses',
  82: 'Averses violentes',
  85: 'Averses de neige légères',
  86: 'Averses de neige fortes',
  95: 'Orage',
  96: 'Orage avec grêle',
  99: 'Orage violent avec grêle',
}

export function weatherCodeLabel(code: number): string {
  return WEATHER_CODE_LABELS[code] ?? 'Conditions inconnues'
}

const BASE = 'https://api.open-meteo.com/v1/forecast'
const DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_sum'

export interface DailyWeather {
  date: string // 'YYYY-MM-DD'
  tempMaxC: number
  tempMinC: number
  rainMm: number
}

export interface DailyWeatherDetail extends DailyWeather {
  weatherCode: number
  windMaxKmh: number
  uvIndexMax: number
  sunrise: string | null // ISO local
  sunset: string | null // ISO local
}

export interface CurrentWeatherDetail {
  tempC: number | null
  humidityPct: number | null
  windKmh: number | null
  weatherCode: number | null
}

interface ForecastResponse {
  current?: {
    temperature_2m?: number
    precipitation?: number
    relative_humidity_2m?: number
    wind_speed_10m?: number
    weather_code?: number
  }
  daily?: {
    time?: string[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_sum?: number[]
    weather_code?: number[]
    wind_speed_10m_max?: number[]
    uv_index_max?: number[]
    sunrise?: string[]
    sunset?: string[]
  }
}

const DAILY_DETAIL =
  'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max,uv_index_max,sunrise,sunset'
const CURRENT_DETAIL = 'temperature_2m,precipitation,relative_humidity_2m,wind_speed_10m,weather_code'

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

export async function fetchCurrentDetail(
  latitude: number,
  longitude: number,
): Promise<CurrentWeatherDetail | null> {
  const params =
    `latitude=${latitude}&longitude=${longitude}` +
    `&current=${CURRENT_DETAIL}&forecast_days=1&timezone=auto`
  const data = await getForecast(params)
  if (!data?.current) return null
  return {
    tempC: data.current.temperature_2m ?? null,
    humidityPct: data.current.relative_humidity_2m ?? null,
    windKmh: data.current.wind_speed_10m ?? null,
    weatherCode: data.current.weather_code ?? null,
  }
}

export async function fetchForecastDetail(
  latitude: number,
  longitude: number,
  days: number,
): Promise<DailyWeatherDetail[] | null> {
  const params =
    `latitude=${latitude}&longitude=${longitude}` +
    `&daily=${DAILY_DETAIL}&forecast_days=${days}&timezone=auto`
  const data = await getForecast(params)
  const time = data?.daily?.time
  if (!data || !time) return null
  const daily = data.daily!
  return time.map((date, i) => ({
    date,
    tempMaxC: daily.temperature_2m_max?.[i] ?? 0,
    tempMinC: daily.temperature_2m_min?.[i] ?? 0,
    rainMm: daily.precipitation_sum?.[i] ?? 0,
    weatherCode: daily.weather_code?.[i] ?? 0,
    windMaxKmh: daily.wind_speed_10m_max?.[i] ?? 0,
    uvIndexMax: daily.uv_index_max?.[i] ?? 0,
    sunrise: daily.sunrise?.[i] ?? null,
    sunset: daily.sunset?.[i] ?? null,
  }))
}

export async function fetchForecast(
  latitude: number,
  longitude: number,
  days: number,
): Promise<DailyWeather[] | null> {
  const params =
    `latitude=${latitude}&longitude=${longitude}` +
    `&daily=${DAILY}&forecast_days=${days}&timezone=auto`
  const data = await getForecast(params)
  const time = data?.daily?.time
  if (!data || !time) return null
  const daily = data.daily!
  return time.map((date, i) => ({
    date,
    tempMaxC: daily.temperature_2m_max?.[i] ?? 0,
    tempMinC: daily.temperature_2m_min?.[i] ?? 0,
    rainMm: daily.precipitation_sum?.[i] ?? 0,
  }))
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
