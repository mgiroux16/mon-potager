// Encapsule l'API Web Speech du navigateur. Aucune clé, aucun réseau, aucune dépendance React.

export type SpeechErrorReason = 'not-allowed' | 'no-speech' | 'not-supported' | 'other'

export interface SpeechHandlers {
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  onError: (reason: SpeechErrorReason) => void
}

export interface SpeechSession {
  stop: () => void
}

type SpeechWindow = typeof window & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

// Surface minimale de l'API utilisée ici (non typée par lib.dom selon les navigateurs).
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
}

interface SpeechResultEvent {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

interface SpeechErrorEvent {
  error: string
}

function getCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as SpeechWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function isSpeechSupported(): boolean {
  return getCtor() != null
}

export function createSpeechSession(handlers: SpeechHandlers): SpeechSession {
  const Ctor = getCtor()
  if (!Ctor) {
    handlers.onError('not-supported')
    return { stop: () => {} }
  }

  const recognition = new Ctor()
  recognition.lang = 'fr-FR'
  recognition.interimResults = true
  recognition.continuous = false

  recognition.onresult = (event) => {
    let interim = ''
    let final = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const transcript = result[0].transcript
      if (result.isFinal) final += transcript
      else interim += transcript
    }
    if (interim) handlers.onInterim(interim)
    if (final) handlers.onFinal(final)
  }

  recognition.onerror = (event) => {
    const reason: SpeechErrorReason =
      event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'not-allowed'
        : event.error === 'no-speech'
          ? 'no-speech'
          : 'other'
    handlers.onError(reason)
  }

  recognition.start()
  return { stop: () => recognition.stop() }
}
