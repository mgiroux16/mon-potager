import { describe, it, expect, vi, afterEach } from 'vitest'
import { callGemini, testGeminiConnection, GEMINI_MODEL } from './geminiService'

function mockFetchOnce(impl: () => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

function geminiOk(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function geminiError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: { message } }),
    { status, headers: { 'Content-Type': 'application/json' } },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('callGemini', () => {
  it('renvoie le texte extrait de la réponse Gemini', async () => {
    mockFetchOnce(() => geminiOk('Bonjour'))
    const out = await callGemini('Dis bonjour', 'AIza-x')
    expect(out).toBe('Bonjour')
  })

  it('appelle une URL contenant le modèle et la clé', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => geminiOk('OK'))
    vi.stubGlobal('fetch', fetchMock)
    await callGemini('p', 'AIza-secret')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain(GEMINI_MODEL)
    expect(url).toContain('AIza-secret')
  })

  it('lève une erreur lisible sur une réponse HTTP en erreur', async () => {
    mockFetchOnce(() => geminiError(400, 'API key not valid'))
    await expect(callGemini('p', 'mauvaise')).rejects.toThrow(/API key not valid/)
  })
})

describe('testGeminiConnection', () => {
  it('renvoie { ok: true } quand l\'appel réussit', async () => {
    mockFetchOnce(() => geminiOk('OK'))
    expect(await testGeminiConnection('AIza-x')).toEqual({ ok: true })
  })

  it('renvoie { ok: false, error } sur une réponse en erreur, sans lever', async () => {
    mockFetchOnce(() => geminiError(400, 'API key not valid'))
    const res = await testGeminiConnection('mauvaise')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/API key not valid/)
  })

  it('renvoie { ok: false, error } quand le réseau échoue, sans lever', async () => {
    mockFetchOnce(() => Promise.reject(new Error('Failed to fetch')))
    const res = await testGeminiConnection('AIza-x')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.length).toBeGreaterThan(0)
  })
})
