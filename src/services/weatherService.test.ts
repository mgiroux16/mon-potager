import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchTodaySnapshot, fetchDailyHistory, __clearWeatherCache } from './weatherService'

function mockFetchOnce(payload: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status: ok ? 200 : 500, statusText: 'err', json: async () => payload })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  __clearWeatherCache()
})

describe('fetchTodaySnapshot', () => {
  it('mappe la réponse Open-Meteo en WeatherSnapshot', async () => {
    mockFetchOnce({
      current: { temperature_2m: 36.3, precipitation: 0 },
      daily: { time: ['2026-06-25'], temperature_2m_max: [40.6], temperature_2m_min: [26.4], precipitation_sum: [0] },
    })
    const snap = await fetchTodaySnapshot(45.72, 0.19)
    expect(snap?.source).toBe('open-meteo')
    expect(snap?.tempC).toBe(36.3)
    expect(snap?.tempMaxC).toBe(40.6)
    expect(snap?.tempMinC).toBe(26.4)
    expect(snap?.rainMm).toBe(0)
    expect(typeof snap?.capturedAt).toBe('number')
  })

  it('renvoie null si le réseau échoue (ne lève jamais)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await fetchTodaySnapshot(45.72, 0.19)).toBeNull()
  })

  it('renvoie null sur réponse HTTP en erreur', async () => {
    mockFetchOnce({}, false)
    expect(await fetchTodaySnapshot(45.72, 0.19)).toBeNull()
  })
})

describe('fetchDailyHistory', () => {
  it('mappe les tableaux quotidiens en DailyWeather[]', async () => {
    mockFetchOnce({
      daily: {
        time: ['2026-06-24', '2026-06-25'],
        temperature_2m_max: [42.9, 40.6],
        temperature_2m_min: [24.4, 26.4],
        precipitation_sum: [0.1, 0],
      },
    })
    const hist = await fetchDailyHistory(45.72, 0.19, 30)
    expect(hist).toEqual([
      { date: '2026-06-24', tempMaxC: 42.9, tempMinC: 24.4, rainMm: 0.1 },
      { date: '2026-06-25', tempMaxC: 40.6, tempMinC: 26.4, rainMm: 0 },
    ])
  })

  it('met en cache : un deuxième appel ne refait pas de fetch', async () => {
    const f = vi.fn(async () => ({
      ok: true, status: 200, statusText: 'ok',
      json: async () => ({ daily: { time: ['2026-06-25'], temperature_2m_max: [40], temperature_2m_min: [26], precipitation_sum: [0] } }),
    }))
    vi.stubGlobal('fetch', f)
    await fetchDailyHistory(45.72, 0.19, 30)
    await fetchDailyHistory(45.72, 0.19, 30)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('renvoie null si le réseau échoue', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await fetchDailyHistory(45.72, 0.19, 30)).toBeNull()
  })
})
