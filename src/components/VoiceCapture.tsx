import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, X } from 'lucide-react'
import { db } from '../data/db'
import { useCollection } from '../data/firestoreHooks'
import type { FruitTree, Oya } from '../data/model'
import { useSettings } from '../services/settingsService'
import { callGeminiAudio } from '../services/geminiService'
import {
  isRecordingSupported,
  startRecording,
  type RecordErrorReason,
  type RecordingSession,
} from '../services/audioRecordService'
import {
  buildVoiceAudioPrompt,
  parseVoiceDrafts,
  type GardenCatalog,
} from '../services/voiceParseService'
import type { NewLogEntry } from '../services/logService'

type Phase = 'idle' | 'listening' | 'processing' | 'error'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function errorMessage(reason: RecordErrorReason): string {
  switch (reason) {
    case 'not-allowed':
      return 'Micro refusé. Autorise le micro pour dicter.'
    case 'no-audio':
      return 'Je n ai rien entendu. Réessaie.'
    case 'not-supported':
      return 'L enregistrement n est pas disponible sur ce navigateur.'
    default:
      return 'Souci avec la dictée. Réessaie.'
  }
}

// oyas/trees viennent de Firestore (hooks du composant) ; parcels/crops restent
// sur Dexie jusqu'au Lot 3.
async function loadCatalog(oyas: Oya[], trees: FruitTree[]): Promise<GardenCatalog> {
  const [parcels, crops] = await Promise.all([db.parcels.toArray(), db.crops.toArray()])
  const pick = <T extends { id?: string; name: string }>(rows: T[]) =>
    rows.filter((r) => r.id != null).map((r) => ({ id: r.id as string, name: r.name }))
  return {
    parcels: pick(parcels),
    crops: pick(crops),
    oyas: pick(oyas),
    trees: pick(trees),
  }
}

export function VoiceCapture() {
  const navigate = useNavigate()
  const settings = useSettings()
  const { data: oyas } = useCollection<Oya>('oyas')
  const { data: trees } = useCollection<FruitTree>('trees')
  const sessionRef = useRef<RecordingSession | null>(null)
  // Passe a true quand l'utilisateur ferme l'overlay : un finalize() encore en vol
  // (appel Gemini) ne doit plus naviguer une fois la dictee annulee.
  const cancelledRef = useRef(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState('')

  if (!isRecordingSupported()) return null

  function close() {
    cancelledRef.current = true
    sessionRef.current?.cancel()
    sessionRef.current = null
    setPhase('idle')
    setMessage('')
  }

  // Transforme l'audio enregistre en brouillon (transcription + rangement par Gemini)
  // puis ouvre le formulaire prerempli. finalize ne jette jamais.
  async function finalize(audio: { data: string; mimeType: string }) {
    setPhase('processing')

    const key = settings?.geminiApiKey?.trim()
    if (!key) {
      if (cancelledRef.current) return
      setPhase('error')
      setMessage('Ajoute ta clé Gemini dans Réglages pour activer la dictée.')
      return
    }

    // Repli par defaut : si Gemini ou le JSON echoue, on ouvre quand meme une note vide
    // a completer a la main plutot que de tout perdre.
    let voiceDrafts: Partial<NewLogEntry>[] = [{ type: 'note' }]
    try {
      const catalog = await loadCatalog(oyas, trees)
      const prompt = buildVoiceAudioPrompt(catalog, todayISO())
      const answer = await callGeminiAudio(prompt, audio, key)
      voiceDrafts = parseVoiceDrafts(answer, catalog, '').map((d) => d.draft)
    } catch {
      voiceDrafts = [{ type: 'note' }]
    }

    // L'utilisateur a ferme l'overlay pendant l'attente : on n'ouvre pas le formulaire.
    if (cancelledRef.current) return

    sessionRef.current = null
    setPhase('idle')
    if (voiceDrafts.length <= 1) {
      navigate('/ajouter', { state: { voiceDraft: voiceDrafts[0] ?? { type: 'note' } } })
    } else {
      navigate('/revue-vocale', { state: { voiceDrafts } })
    }
  }

  async function start() {
    cancelledRef.current = false
    setPhase('listening')
    setMessage('')
    const session = await startRecording({
      onReady: (audio) => void finalize(audio),
      onError: (reason) => {
        sessionRef.current = null
        if (cancelledRef.current) return
        setPhase('error')
        setMessage(errorMessage(reason))
      },
    })
    // Fermeture pendant l'init du micro : on relache tout de suite.
    if (cancelledRef.current) {
      session.cancel()
      return
    }
    sessionRef.current = session
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
                {phase === 'listening' ? 'Parle, puis appuie sur Terminer…' : 'Je transcris…'}
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
