import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Stethoscope } from 'lucide-react'
import { db } from '../data/db'
import { updateDiagnosticOutcome } from '../services/diagnosticService'
import type { Diagnostic, GardenLogEntry, HypothesisConfidence } from '../data/model'

const CONFIDENCE_CLASS: Record<HypothesisConfidence, string> = {
  faible: 'bg-gray-100 text-gray-700',
  moyen: 'bg-amber-100 text-amber-800',
  eleve: 'bg-red-100 text-red-800',
}

function OutcomeFields({ diagnostic }: { diagnostic: Diagnostic }) {
  const [action, setAction] = useState(diagnostic.chosenAction ?? '')
  const [result, setResult] = useState(diagnostic.result ?? '')
  const [conclusion, setConclusion] = useState(diagnostic.conclusion ?? '')

  async function save(next: { chosenAction?: string; result?: string; conclusion?: string }) {
    await updateDiagnosticOutcome(diagnostic.id as string, {
      chosenAction: action,
      result,
      conclusion,
      ...next,
    })
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-gray-600">
        Action choisie
        <textarea
          aria-label="Action choisie"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          onBlur={() => save({ chosenAction: action })}
          rows={2}
          className="w-full rounded border border-green-200 px-2 py-1 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-600">
        Résultat observé
        <textarea
          aria-label="Résultat observé"
          value={result}
          onChange={(e) => setResult(e.target.value)}
          onBlur={() => save({ result })}
          rows={2}
          className="w-full rounded border border-green-200 px-2 py-1 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-gray-600">
        Conclusion pour l'an prochain
        <textarea
          aria-label="Conclusion pour l'an prochain"
          value={conclusion}
          onChange={(e) => setConclusion(e.target.value)}
          onBlur={() => save({ conclusion })}
          rows={2}
          className="w-full rounded border border-green-200 px-2 py-1 text-sm"
        />
      </label>
    </div>
  )
}

function DiagnosticCard({ diagnostic, problem }: { diagnostic: Diagnostic; problem?: GardenLogEntry }) {
  return (
    <li className="rounded-2xl bg-white px-4 py-3 shadow-sm">
      <p className="text-sm font-medium text-green-950">
        {problem?.description ?? 'Problème'}
        <span className="ml-2 text-xs font-normal text-green-700/60">{problem?.date}</span>
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {diagnostic.hypotheses.map((h, i) => (
          <li key={i} className="rounded-lg bg-green-50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-green-950">{h.text}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${CONFIDENCE_CLASS[h.confidence]}`}>
                {h.confidence}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-green-700/80">{h.indices}</p>
            {h.suggestedTreatment && (
              <p className="mt-1 text-xs text-green-900">
                <span className="font-medium">Traitement suggéré : </span>
                {h.suggestedTreatment}
              </p>
            )}
          </li>
        ))}
      </ul>
      <OutcomeFields diagnostic={diagnostic} />
    </li>
  )
}

export function DiagnosticsPage() {
  const diagnostics = useLiveQuery(() => db.diagnostics.toArray(), [], [])
  const entries = useLiveQuery(() => db.log.toArray(), [], [])
  const entryById = new Map(entries.map((e) => [e.id, e] as [string | undefined, GardenLogEntry]))

  const open = diagnostics.filter((d) => d.status === 'ouvert').sort((a, b) => b.createdAt - a.createdAt)
  const closed = diagnostics.filter((d) => d.status === 'clos').sort((a, b) => b.createdAt - a.createdAt)

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-green-100 text-green-700">
          <Stethoscope className="size-5" />
        </span>
        <h1 className="text-xl font-semibold text-green-950">Diagnostics</h1>
      </header>

      {diagnostics.length === 0 && (
        <p className="text-sm text-green-700/80">
          Aucun diagnostic pour le moment. Lance une analyse depuis une entrée « problème » du
          journal.
        </p>
      )}

      {open.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-green-900">Ouverts</h2>
          <ul className="flex flex-col gap-3">
            {open.map((d) => (
              <DiagnosticCard key={d.id} diagnostic={d} problem={entryById.get(d.problemEntryId)} />
            ))}
          </ul>
        </div>
      )}

      {closed.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-green-900">Clos</h2>
          <ul className="flex flex-col gap-3">
            {closed.map((d) => (
              <DiagnosticCard key={d.id} diagnostic={d} problem={entryById.get(d.problemEntryId)} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
