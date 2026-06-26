// Capture audio via MediaRecorder, supporté par TOUS les navigateurs (Brave, Firefox,
// Chrome, mobile), contrairement à la reconnaissance vocale Web Speech. Aucune clé ici :
// l'audio encodé est confié à Gemini par l'orchestrateur (VoiceCapture).

export type RecordErrorReason = 'not-allowed' | 'not-supported' | 'no-audio' | 'other'

export interface RecordHandlers {
  // Appelé une fois l'enregistrement terminé, avec l'audio prêt pour Gemini.
  onReady: (audio: { data: string; mimeType: string }) => void
  onError: (reason: RecordErrorReason) => void
}

export interface RecordingSession {
  stop: () => void // termine l'enregistrement et déclenche onReady
  cancel: () => void // annule : libère le micro, aucun onReady
}

// Ordre de préférence : ogg/opus (Firefox, accepté par Gemini) avant webm/opus
// (Brave, Chrome), puis mp4 (Safari). On renvoie le mimeType de base, sans codec,
// car c'est ce que l'API Gemini attend dans inlineData.mimeType.
const CANDIDATE_TYPES = [
  'audio/ogg;codecs=opus',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
] as const

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const type of CANDIDATE_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

function baseMime(mimeType: string): string {
  // 'audio/webm;codecs=opus' -> 'audio/webm' ; chaîne vide -> repli webm.
  const base = mimeType.split(';')[0]
  return base || 'audio/webm'
}

export function isRecordingSupported(): boolean {
  if (typeof window === 'undefined') return false
  return (
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices?.getUserMedia != null &&
    typeof MediaRecorder !== 'undefined'
  )
}

// Convertit le Blob audio en base64 pur (sans le préfixe data:...;base64,).
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Lecture audio impossible'))
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.readAsDataURL(blob)
  })
}

export async function startRecording(handlers: RecordHandlers): Promise<RecordingSession> {
  if (!isRecordingSupported()) {
    handlers.onError('not-supported')
    return { stop: () => {}, cancel: () => {} }
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    handlers.onError(name === 'NotAllowedError' || name === 'SecurityError' ? 'not-allowed' : 'other')
    return { stop: () => {}, cancel: () => {} }
  }

  const mimeType = pickMimeType()
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  const chunks: Blob[] = []
  let cancelled = false

  const releaseTracks = () => stream.getTracks().forEach((t) => t.stop())

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  recorder.onerror = () => {
    releaseTracks()
    if (!cancelled) handlers.onError('other')
  }

  recorder.onstop = async () => {
    releaseTracks()
    if (cancelled) return
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType })
    if (blob.size === 0) {
      handlers.onError('no-audio')
      return
    }
    try {
      const data = await blobToBase64(blob)
      handlers.onReady({ data, mimeType: baseMime(recorder.mimeType || mimeType) })
    } catch {
      handlers.onError('other')
    }
  }

  recorder.start()

  return {
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop()
    },
    cancel: () => {
      cancelled = true
      if (recorder.state !== 'inactive') recorder.stop()
      else releaseTracks()
    },
  }
}
