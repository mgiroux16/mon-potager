import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, X } from 'lucide-react'
import { db } from '../data/db'
import { getSettings } from '../services/settingsService'
import { callGemini } from '../services/geminiService'
import {
  createSpeechSession,
  isSpeechSupported,
  type SpeechErrorReason,
  type SpeechSession,
} from '../services/speechService'
import {
  buildVoicePrompt,
  parseVoiceDraft,
  type GardenCatalog,
} from '../services/voiceParseService'
import type { NewLogEntry } from '../services/logService'

type Phase = 'idle' | 'listening' | 'processing' | 'error'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function errorMessage(reason: SpeechErrorReason): string {
  switch (reason) {
    case 'not-allowed':
      return 'Micro refusé. Autorise le micro pour dicter.'
    case 'no-speech':
      return 'Je n ai rien entendu. Réessaie.'
    case 'not-supported':
      return 'La dictée n est pas disponible sur ce navigateur.'
    default:
      return 'Souci avec la dictée. Réessaie.'
  }
}

async function loadCatalog(): Promise<GardenCatalog> {
  const [parcels, crops, oyas, trees] = await Promise.all([
    db.parcels.toArray(),
    db.crops.toArray(),
    db.oyas.toArray(),
    db.trees.toArray(),
  ])
  const pick = <T extends { id?: number; name: string }>(rows: T[]) =>
    rows.filter((r) => r.id != null).map((r) => ({ id: r.id as number, name: r.name }))
  return {
    parcels: pick(parcels),
    crops: pick(crops),
    oyas: pick(oyas),
    trees: pick(trees),
  }
}

export function VoiceCapture() {
  const navigate = useNavigate()
  const sessionRef = useRef<SpeechSession | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [message, setMessage] = useState('')

  if (!isSpeechSupported()) return null

  function close() {
    sessionRef.current?.stop()
    sessionRef.current = null
    setPhase('idle')
    setTranscript('')
    setMessage('')
  }

  // Transforme la phrase finale en brouillon puis ouvre le formulaire prerempli.
  async function finalize(finalText: string) {
    setPhase('processing')
    const settings = await getSettings()
    const key = settings.geminiApiKey?.trim()

    let voiceDraft: Partial<NewLogEntry> = { type: 'note', description: finalText }
    if (key) {
      try {
        const catalog = await loadCatalog()
        const prompt = buildVoicePrompt(finalText, catalog, todayISO())
        const answer = await callGemini(prompt, key)
        voiceDraft = parseVoiceDraft(answer, catalog, finalText).draft
      } catch {
        // Reseau coupe, quota, JSON casse : on garde le repli note + phrase brute.
        voiceDraft = { type: 'note', description: finalText }
      }
    }

    sessionRef.current = null
    setPhase('idle')
    setTranscript('')
    navigate('/ajouter', { state: { voiceDraft } })
  }

  function start() {
    setPhase('listening')
    setTranscript('')
    setMessage('')
    sessionRef.current = createSpeechSession({
      onInterim: (text) => setTranscript(text),
      onFinal: (text) => {
        setTranscript(text)
        void finalize(text)
      },
      onError: (reason) => {
        sessionRef.current = null
        setPhase('error')
        setMessage(errorMessage(reason))
      },
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        aria-label="Dicter une entrée"
        className="fixed bottom-24 right-4 z-20 grid size-14 place-items-center rounded-full bg-green-600 text-white shadow-lg shadow-green-600/30"
      >
        <Mic className="size-6" />
      </button>

      {phase !== 'idle' && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-green-950">
                {phase === 'listening' && "J'écoute…"}
                {phase === 'processing' && 'Je range…'}
                {phase === 'error' && 'Oups'}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className="rounded-lg p-1 text-green-700"
              >
                <X className="size-5" />
              </button>
            </div>

            {phase === 'error' ? (
              <p className="mt-3 text-sm text-green-800">{message}</p>
            ) : (
              <p className="mt-3 min-h-12 text-sm text-green-800">
                {transcript || 'Parle, je transcris…'}
              </p>
            )}

            {phase === 'listening' && (
              <button
                type="button"
                onClick={() => sessionRef.current?.stop()}
                className="mt-4 w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white"
              >
                Terminer
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
