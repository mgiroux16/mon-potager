import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPublishedVersion, isUpdateAvailable } from './versionService'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) }
}

describe('fetchPublishedVersion', () => {
  it('renvoie la version publiée quand version.json est valide', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ hash: 'abc1234', builtAt: '2026-07-05T20:00:00Z' }))
    expect(await fetchPublishedVersion()).toEqual({
      hash: 'abc1234',
      builtAt: '2026-07-05T20:00:00Z',
    })
  })

  it('contourne les caches (no-store + parametre horodate)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ hash: 'abc1234', builtAt: '' }))
    await fetchPublishedVersion()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/version\.json\?t=\d+/)
    expect(init.cache).toBe('no-store')
  })

  it('renvoie null si la reponse est en erreur (404 en dev)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false))
    expect(await fetchPublishedVersion()).toBeNull()
  })

  it('renvoie null si le contenu est invalide (pas de hash)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ builtAt: 'x' }))
    expect(await fetchPublishedVersion()).toBeNull()
  })

  it('renvoie null hors-ligne (fetch rejette)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await fetchPublishedVersion()).toBeNull()
  })
})

describe('isUpdateAvailable', () => {
  it('faux sans info de version publiée', () => {
    expect(isUpdateAvailable(null)).toBe(false)
  })

  it("faux quand la version publiée est celle de l'app", () => {
    expect(isUpdateAvailable({ hash: __APP_BUILD_HASH__, builtAt: '' })).toBe(false)
  })

  it('vrai quand la version publiée diffère', () => {
    expect(isUpdateAvailable({ hash: 'zzz9999', builtAt: '' })).toBe(true)
  })
})
