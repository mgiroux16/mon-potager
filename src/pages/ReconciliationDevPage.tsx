import { useState } from 'react'
import { auth } from '../data/firebase'
import { reconcileAll, type TableReconciliationReport } from '../data/reconciliation'

// Page dev, etape 2 de la migration cloud-first (voir docs/audit/). Non liee a la
// navigation : accessible uniquement en tapant l'URL (#/dev/reconciliation). Aucun
// declenchement automatique, ni ici ni ailleurs : le bouton est la seule facon de
// lancer la reconciliation. A executer sur CHAQUE appareil qui detient des donnees
// (telephone ET ordinateur), chacun pouvant avoir des entrees orphelines differentes.

type Status = 'idle' | 'running' | 'done' | 'error'

export function ReconciliationDevPage() {
  const [status, setStatus] = useState<Status>('idle')
  const [reports, setReports] = useState<TableReconciliationReport[]>([])
  const [error, setError] = useState<string | null>(null)

  const uid = auth.currentUser?.uid

  async function run() {
    if (!uid) return
    setStatus('running')
    setError(null)
    try {
      const result = await reconcileAll(uid)
      setReports(result)
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  return (
    <section className="flex flex-col gap-4 p-4">
      <header>
        <h1 className="text-xl font-semibold text-green-950">Réconciliation locale vers Firestore</h1>
        <p className="mt-1 text-sm text-green-700/80">
          Outil de sécurité des données de l'étape 2 (migration cloud-first). Pousse vers
          Firestore toute entrée locale absente du serveur, puis affiche un rapport par
          table. Ne bascule aucune lecture : le reste de l'application continue de lire
          Dexie normalement.
        </p>
      </header>

      {!uid && (
        <p className="text-sm text-red-700">Non connecté : impossible de lancer la réconciliation.</p>
      )}

      <button
        type="button"
        onClick={() => void run()}
        disabled={!uid || status === 'running'}
        className="self-start rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {status === 'running' ? 'Réconciliation en cours…' : 'Lancer la réconciliation'}
      </button>

      {error && <p className="text-sm text-red-700">Erreur : {error}</p>}

      {reports.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-green-200 text-green-900">
              <th className="py-1 pr-2">Table</th>
              <th className="py-1 pr-2">Local actif</th>
              <th className="py-1 pr-2">Serveur (actif / total)</th>
              <th className="py-1 pr-2">Poussés maintenant</th>
              <th className="py-1 pr-2">Local seul restant</th>
              <th className="py-1 pr-2">Serveur seul</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const hasGap = r.localOnlyIds.length > 0 || r.serverOnlyIds.length > 0
              return (
                <tr
                  key={r.table}
                  className={`border-b border-green-100 ${hasGap ? 'bg-amber-50' : ''}`}
                >
                  <td className="py-1 pr-2 font-medium">{r.table}</td>
                  <td className="py-1 pr-2">{r.localActive}</td>
                  <td className="py-1 pr-2">
                    {r.serverActive} / {r.serverTotal}
                  </td>
                  <td className="py-1 pr-2">{r.pushedIds.length}</td>
                  <td className="py-1 pr-2">
                    {r.localOnlyIds.length > 0 ? r.localOnlyIds.join(', ') : 'aucun'}
                  </td>
                  <td className="py-1 pr-2">
                    {r.serverOnlyIds.length > 0 ? r.serverOnlyIds.join(', ') : 'aucun'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
