import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  callGemini,
  callGeminiAudio,
  callGeminiChat,
  callGeminiVision,
  testGeminiConnection,
  GEMINI_MODEL,
} from './geminiService'

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

describe('callGeminiAudio', () => {
  it('renvoie le texte extrait de la réponse Gemini', async () => {
    mockFetchOnce(() => geminiOk('{"type":"note"}'))
    const out = await callGeminiAudio('range ça', { data: 'QUJD', mimeType: 'audio/webm' }, 'AIza-x')
    expect(out).toBe('{"type":"note"}')
  })

  it('envoie le prompt ET l audio (inlineData base64 + mimeType) dans le corps', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      const parts = body.contents[0].parts
      expect(parts.some((p: { text?: string }) => p.text === 'range ça')).toBe(true)
      const audioPart = parts.find((p: { inlineData?: unknown }) => p.inlineData)
      expect(audioPart.inlineData).toEqual({ data: 'QUJD', mimeType: 'audio/webm' })
      return geminiOk('{}')
    })
    vi.stubGlobal('fetch', fetchMock)
    await callGeminiAudio('range ça', { data: 'QUJD', mimeType: 'audio/webm' }, 'AIza-x')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('lève une erreur lisible sur une réponse HTTP en erreur', async () => {
    mockFetchOnce(() => geminiError(400, 'API key not valid'))
    await expect(
      callGeminiAudio('p', { data: 'QUJD', mimeType: 'audio/webm' }, 'mauvaise'),
    ).rejects.toThrow(/API key not valid/)
  })
})

describe('callGeminiVision', () => {
  it('renvoie le texte extrait de la réponse Gemini', async () => {
    mockFetchOnce(() => geminiOk('[{"text":"mildiou","indices":"taches","confidence":"moyen"}]'))
    const out = await callGeminiVision('Analyse cette photo', { data: 'QUJD', mimeType: 'image/jpeg' }, 'AIza-x')
    expect(out).toContain('mildiou')
  })

  it('envoie le prompt ET l image (inlineData base64 + mimeType) dans le corps', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      const parts = body.contents[0].parts
      expect(parts.some((p: { text?: string }) => p.text === 'p')).toBe(true)
      const imagePart = parts.find((p: { inlineData?: unknown }) => p.inlineData)
      expect((imagePart as { inlineData: { data: string; mimeType: string } } | undefined)?.inlineData).toEqual({
        data: 'QUJD',
        mimeType: 'image/jpeg',
      })
      return geminiOk('OK')
    })
    vi.stubGlobal('fetch', fetchMock)
    await callGeminiVision('p', { data: 'QUJD', mimeType: 'image/jpeg' }, 'AIza-x')
  })
})

describe('callGeminiChat', () => {
  it('renvoie le texte extrait de la réponse Gemini', async () => {
    mockFetchOnce(() => geminiOk('Bien sûr'))
    const out = await callGeminiChat(
      [
        { role: 'user', text: 'Comment va mon jardin ?' },
        { role: 'model', text: 'Plutôt bien.' },
        { role: 'user', text: 'Et mes tomates ?' },
      ],
      'AIza-x',
    )
    expect(out).toBe('Bien sûr')
  })

  it('envoie tous les tours précédents avec les bons rôles dans le corps', async () => {
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.contents).toEqual([
        { role: 'user', parts: [{ text: 'Comment va mon jardin ?' }] },
        { role: 'model', parts: [{ text: 'Plutôt bien.' }] },
        { role: 'user', parts: [{ text: 'Et mes tomates ?' }] },
      ])
      return geminiOk('OK')
    })
    vi.stubGlobal('fetch', fetchMock)
    await callGeminiChat(
      [
        { role: 'user', text: 'Comment va mon jardin ?' },
        { role: 'model', text: 'Plutôt bien.' },
        { role: 'user', text: 'Et mes tomates ?' },
      ],
      'AIza-x',
    )
    expect(fetchMock).toHaveBeenCalledOnce()
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
