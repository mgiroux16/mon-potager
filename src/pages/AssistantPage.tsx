import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Info, Loader2, Send } from 'lucide-react'
import { useCollection } from '../data/firestoreHooks'
import type { Crop, Expense, FruitTree, GardenLogEntry, Oya, Parcel, Variety } from '../data/model'
import { useSettings } from '../services/settingsService'
import { callGemini } from '../services/geminiService'
import { summarizeHarvests } from '../services/harvestService'
import { summarizeCropSeason, summarizeParcelSeason } from '../services/seasonSummaryService'
import {
  buildJournalAttachment,
  buildCropAttachment,
  buildSeasonAttachment,
  buildExpensesAttachment,
  type Attachment,
} from '../services/assistantContext'
import type { LogRefs } from '../services/logView'

type ChatMessage = { role: 'user' | 'assistant'; text: string }

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function AssistantPage() {
  const settings = useSettings()
  const { data: entries } = useCollection<GardenLogEntry>('log')
  const { data: crops } = useCollection<Crop>('crops')
  const { data: parcels } = useCollection<Parcel>('parcels')
  const { data: oyas } = useCollection<Oya>('oyas')
  const { data: trees } = useCollection<FruitTree>('trees')
  const { data: varieties } = useCollection<Variety>('varieties')
  const { data: expenses } = useCollection<Expense>('expenses')

  const currentYear = new Date().getFullYear()

  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [journalOn, setJournalOn] = useState(false)
  const [journalFrom, setJournalFrom] = useState(isoDaysAgo(30))
  const [journalTo, setJournalTo] = useState(todayISO())

  const [seasonOn, setSeasonOn] = useState(false)
  const [seasonYear, setSeasonYear] = useState(currentYear)

  const [expensesOn, setExpensesOn] = useState(false)
  const [expensesYear, setExpensesYear] = useState(currentYear)

  const [cropOn, setCropOn] = useState(false)
  const [cropId, setCropId] = useState('')

  if (!settings) {
    return <p className="text-sm text-green-700">Chargement…</p>
  }

  const apiKey = settings.geminiApiKey

  function buildSelectedAttachments(): Attachment[] {
    const refs: LogRefs = {
      parcels: new Map((parcels ?? []).filter((p) => p.id).map((p) => [p.id as string, p])),
      crops: new Map((crops ?? []).filter((c) => c.id).map((c) => [c.id as string, c])),
      oyas: new Map((oyas ?? []).filter((o) => o.id).map((o) => [o.id as string, o])),
      trees: new Map((trees ?? []).filter((t) => t.id).map((t) => [t.id as string, t])),
    }

    const attachments: Attachment[] = []

    if (journalOn) {
      attachments.push(
        buildJournalAttachment({ entries: entries ?? [], refs, from: journalFrom, to: journalTo }),
      )
    }

    if (seasonOn && settings) {
      const cropRows = summarizeCropSeason(
        entries ?? [],
        crops ?? [],
        varieties ?? [],
        parcels ?? [],
        expenses ?? [],
        seasonYear,
        settings,
      )
      const parcelRows = summarizeParcelSeason(
        entries ?? [],
        parcels ?? [],
        crops ?? [],
        expenses ?? [],
        seasonYear,
        settings,
      )
      attachments.push(buildSeasonAttachment({ cropRows, parcelRows, year: seasonYear }))
    }

    if (expensesOn) {
      attachments.push(buildExpensesAttachment({ expenses: expenses ?? [], year: expensesYear }))
    }

    if (cropOn && cropId) {
      const crop = (crops ?? []).find((c) => c.id === cropId)
      if (crop) {
        const harvestRows = summarizeHarvests(entries ?? [], crops ?? [])
        const variety = (varieties ?? []).find((v) => v.id === crop.varietyId)
        const parcel = (parcels ?? []).find((p) => p.id === crop.parcelId)
        attachments.push(buildCropAttachment({ crop, harvestRows, variety, parcel }))
      }
    }

    return attachments
  }

  async function handleSend() {
    if (!apiKey || !question.trim() || sending) return
    setError(null)
    setSending(true)

    const attachments = buildSelectedAttachments()
    const attachedText = attachments.map((a) => `--- ${a.label} ---\n${a.text}`).join('\n\n')
    const prompt = attachedText
      ? `${attachedText}\n\n--- Question ---\n${question}`
      : question

    const userMessage: ChatMessage = { role: 'user', text: question }
    setMessages((prev) => [...prev, userMessage])
    setQuestion('')

    try {
      const response = await callGemini(prompt, apiKey)
      setMessages((prev) => [...prev, { role: 'assistant', text: response }])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  const attachedCount = [journalOn, seasonOn, expensesOn, cropOn && !!cropId].filter(Boolean).length

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-caption text-slate-700">
        <Info className="size-4 shrink-0 mt-0.5" />
        <p>
          L'assistant ne voit que ce que tu attaches ci-dessous. Ce qui part est vu par Google
          (palier gratuit Gemini).
        </p>
      </div>

      {!apiKey && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
          Configure ta clé Gemini dans les{' '}
          <Link to="/reglages" className="font-medium underline">
            Réglages
          </Link>{' '}
          pour utiliser l'assistant.
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-green-100 bg-white p-3">
        <h2 className="text-title-card text-green-900">Pièces jointes ({attachedCount})</h2>

        <label className="flex items-center gap-2 text-sm text-green-900">
          <input type="checkbox" checked={journalOn} onChange={(e) => setJournalOn(e.target.checked)} />
          Journal du
          <input
            aria-label="Journal depuis"
            type="date"
            value={journalFrom}
            onChange={(e) => setJournalFrom(e.target.value)}
            disabled={!journalOn}
            className="rounded border border-green-200 px-1.5 py-0.5 text-xs"
          />
          au
          <input
            aria-label="Journal jusqu'à"
            type="date"
            value={journalTo}
            onChange={(e) => setJournalTo(e.target.value)}
            disabled={!journalOn}
            className="rounded border border-green-200 px-1.5 py-0.5 text-xs"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-green-900">
          <input type="checkbox" checked={seasonOn} onChange={(e) => setSeasonOn(e.target.checked)} />
          Synthèse de saison
          <select
            aria-label="Année de la synthèse"
            value={seasonYear}
            onChange={(e) => setSeasonYear(Number(e.target.value))}
            disabled={!seasonOn}
            className="rounded border border-green-200 px-1.5 py-0.5 text-xs"
          >
            {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-green-900">
          <input type="checkbox" checked={expensesOn} onChange={(e) => setExpensesOn(e.target.checked)} />
          Dépenses
          <select
            aria-label="Année des dépenses"
            value={expensesYear}
            onChange={(e) => setExpensesYear(Number(e.target.value))}
            disabled={!expensesOn}
            className="rounded border border-green-200 px-1.5 py-0.5 text-xs"
          >
            {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-green-900">
          <input type="checkbox" checked={cropOn} onChange={(e) => setCropOn(e.target.checked)} />
          Fiche culture
          <select
            aria-label="Culture à joindre"
            value={cropId}
            onChange={(e) => setCropId(e.target.value)}
            disabled={!cropOn}
            className="min-w-0 flex-1 rounded border border-green-200 px-1.5 py-0.5 text-xs"
          >
            <option value="">Choisir une culture</option>
            {(crops ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'self-end bg-green-600 text-white'
                : 'self-start bg-white border border-green-100 text-green-950'
            }`}
          >
            {m.text}
          </div>
        ))}
        {error && (
          <p className="self-start rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleSend()
        }}
        className="flex items-center gap-2"
      >
        <input
          aria-label="Ta question"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Pose ta question sur ton potager…"
          disabled={!apiKey || sending}
          className="flex-1 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!apiKey || !question.trim() || sending}
          aria-label="Envoyer"
          className="rounded-lg bg-green-600 p-2.5 text-white disabled:opacity-50"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </form>
    </section>
  )
}
