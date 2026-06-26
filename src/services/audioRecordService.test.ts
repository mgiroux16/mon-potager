import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  blobToBase64,
  isRecordingSupported,
  pickMimeType,
  startRecording,
} from './audioRecordService'

// Faux MediaRecorder pilotable : on déclenche onstop/onerror à la main dans les tests.
class FakeMediaRecorder {
  static supported = new Set<string>()
  static isTypeSupported(type: string) {
    return FakeMediaRecorder.supported.has(type)
  }
  state: 'inactive' | 'recording' = 'inactive'
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? ''
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['xyz'], { type: this.mimeType || 'audio/webm' }) })
    this.onstop?.()
  }
}

function fakeStream() {
  const stop = vi.fn()
  return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop }
}

function installMediaApis(opts: { supported?: string[]; getUserMedia?: () => Promise<MediaStream> }) {
  FakeMediaRecorder.supported = new Set(opts.supported ?? ['audio/webm;codecs=opus'])
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: opts.getUserMedia ?? (() => Promise.resolve(fakeStream().stream)) },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isRecordingSupported', () => {
  it('renvoie faux sans MediaRecorder ni getUserMedia', () => {
    vi.stubGlobal('MediaRecorder', undefined)
    vi.stubGlobal('navigator', {})
    expect(isRecordingSupported()).toBe(false)
  })

  it('renvoie vrai quand MediaRecorder et getUserMedia sont présents', () => {
    installMediaApis({})
    expect(isRecordingSupported()).toBe(true)
  })
})

describe('pickMimeType', () => {
  it('préfère ogg/opus quand il est supporté', () => {
    installMediaApis({ supported: ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus'] })
    expect(pickMimeType()).toBe('audio/ogg;codecs=opus')
  })

  it('retombe sur webm quand ogg n est pas supporté', () => {
    installMediaApis({ supported: ['audio/webm;codecs=opus'] })
    expect(pickMimeType()).toBe('audio/webm;codecs=opus')
  })

  it('renvoie une chaîne vide quand rien n est supporté', () => {
    installMediaApis({ supported: [] })
    expect(pickMimeType()).toBe('')
  })
})

describe('blobToBase64', () => {
  it('renvoie le base64 sans le préfixe data:', async () => {
    const out = await blobToBase64(new Blob(['ABC'], { type: 'audio/webm' }))
    // "ABC" en base64 = "QUJD"
    expect(out).toBe('QUJD')
  })
})

describe('startRecording', () => {
  it('signale not-supported et ne plante pas quand l API manque', async () => {
    vi.stubGlobal('MediaRecorder', undefined)
    vi.stubGlobal('navigator', {})
    const onError = vi.fn()
    const session = await startRecording({ onReady: vi.fn(), onError })
    expect(onError).toHaveBeenCalledWith('not-supported')
    expect(() => session.stop()).not.toThrow()
  })

  it('signale not-allowed quand le micro est refusé', async () => {
    const denied = Object.assign(new Error('refusé'), { name: 'NotAllowedError' })
    installMediaApis({ getUserMedia: () => Promise.reject(denied) })
    const onError = vi.fn()
    await startRecording({ onReady: vi.fn(), onError })
    expect(onError).toHaveBeenCalledWith('not-allowed')
  })

  it('livre l audio en base64 avec le mimeType de base à l arrêt', async () => {
    installMediaApis({ supported: ['audio/webm;codecs=opus'] })
    const onReady = vi.fn()
    const session = await startRecording({ onReady, onError: vi.fn() })
    session.stop()
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled())
    const audio = onReady.mock.calls[0][0]
    expect(audio.mimeType).toBe('audio/webm')
    expect(typeof audio.data).toBe('string')
    expect(audio.data.length).toBeGreaterThan(0)
  })

  it('n appelle pas onReady après cancel (micro libéré)', async () => {
    const { stream, stop } = fakeStream()
    installMediaApis({ supported: ['audio/webm;codecs=opus'], getUserMedia: () => Promise.resolve(stream) })
    const onReady = vi.fn()
    const session = await startRecording({ onReady, onError: vi.fn() })
    session.cancel()
    await Promise.resolve()
    expect(onReady).not.toHaveBeenCalled()
    expect(stop).toHaveBeenCalled()
  })
})
