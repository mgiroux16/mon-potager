import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { TABLE_NAMES, type AppSettings } from '../data/model'
import { saveSettings, useSettings } from '../services/settingsService'
import { testGeminiConnection } from '../services/geminiService'
import { signOutUser } from '../services/authService'
import { auth } from '../data/firebase'
import { cloudBatchWrite, cloudGetAll, type CloudBatchOp } from '../data/firestoreWrites'
import { fetchPublishedVersion, type PublishedVersion } from '../services/versionService'
import { isTripped, resetWriteGuard, sessionWriteCount } from '../data/writeGuard'
import { ExportButton } from '../components/ExportButton'
import { ImportButton } from '../components/ImportButton'
import { CsvExportPanel } from '../components/CsvExportPanel'
import { AuditLogPanel } from '../components/AuditLogPanel'

type TestState =
  | { status: 'idle' }
  | { status: 'en_cours' }
  | { status: 'ok' }
  | { status: 'erreur'; message: string }

type PurgeState =
  | { status: 'idle' }
  | { status: 'recherche' }
  | { status: 'pret'; ops: CloudBatchOp[] }
  | { status: 'purge' }
  | { status: 'fait'; count: number }
  | { status: 'erreur' }

const fieldClass =
  'w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-950'

/** Recherche les tombstones (ancien mecanisme de suppression douce, avant Lot 5)
 * qui trainent encore dans Firestore : aucun code n'en pose plus, mais quelques-uns
 * peuvent rester d'avant le demontage de la synchro maison. */
async function findTombstones(): Promise<CloudBatchOp[]> {
  const ops: CloudBatchOp[] = []
  for (const table of TABLE_NAMES) {
    const rows = (await cloudGetAll(table)) as { id: string; deletedAt?: number }[]
    for (const row of rows) {
      if (typeof row.deletedAt === 'number') ops.push({ type: 'delete', table, id: row.id })
    }
  }
  return ops
}

function TombstonePurgePanel() {
  const [state, setState] = useState<PurgeState>({ status: 'idle' })

  async function handleSearch() {
    setState({ status: 'recherche' })
    try {
      const ops = await findTombstones()
      setState({ status: 'pret', ops })
    } catch {
      setState({ status: 'erreur' })
    }
  }

  async function handlePurge(ops: CloudBatchOp[]) {
    setState({ status: 'purge' })
    try {
      await cloudBatchWrite(ops)
      setState({ status: 'fait', count: ops.length })
    } catch {
      setState({ status: 'erreur' })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void handleSearch()}
        disabled={state.status === 'recherche' || state.status === 'purge'}
        className="rounded-lg border border-green-300 px-4 py-2 text-sm font-medium text-green-800 disabled:opacity-60"
      >
        {state.status === 'recherche' ? 'Recherche…' : 'Chercher les tombstones restants'}
      </button>
      {state.status === 'pret' && state.ops.length === 0 && (
        <p className="text-sm text-green-700">Aucun tombstone restant.</p>
      )}
      {state.status === 'pret' && state.ops.length > 0 && (
        <>
          <p className="text-sm text-green-800">
            {state.ops.length} document{state.ops.length > 1 ? 's' : ''} à supprimer définitivement.
          </p>
          <button
            type="button"
            onClick={() => void handlePurge(state.ops)}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700"
          >
            Purger définitivement
          </button>
        </>
      )}
      {state.status === 'fait' && (
        <p className="text-sm text-green-700">{state.count} document(s) purgé(s).</p>
      )}
      {state.status === 'erreur' && (
        <p className="text-sm text-red-600">Erreur pendant la recherche/purge.</p>
      )}
    </div>
  )
}

export function SettingsPage() {
  const stored = useSettings()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState(false)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [published, setPublished] = useState<PublishedVersion | null>(null)
  const [guardTripped, setGuardTripped] = useState(() => isTripped())

  // Copie locale editable, initialisee une fois les reglages charges depuis
  // Firestore ; les frappes en cours ne sont pas ecrasees par un snapshot.
  useEffect(() => {
    if (stored) setSettings((prev) => prev ?? stored)
  }, [stored])

  useEffect(() => {
    void fetchPublishedVersion().then(setPublished)
  }, [])

  if (!settings) {
    return <p className="text-sm text-green-700">Chargement…</p>
  }

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
    setSaved(false)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!settings) return
    saveSettings(settings)
    setSaved(true)
  }

  async function handleTest() {
    if (!settings) return
    setTest({ status: 'en_cours' })
    const res = await testGeminiConnection(settings.geminiApiKey ?? '')
    setTest(res.ok ? { status: 'ok' } : { status: 'erreur', message: res.error })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-green-950">Réglages</h1>

      <label className="flex flex-col gap-1 text-sm text-green-800">
        Nom du lieu
        <input
          aria-label="Nom du lieu"
          type="text"
          value={settings.locationName}
          onChange={(e) => update('locationName', e.target.value)}
          className={fieldClass}
        />
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm text-green-800">
          Latitude
          <input
            aria-label="Latitude"
            type="number"
            step="0.0001"
            value={settings.latitude}
            onChange={(e) => update('latitude', Number(e.target.value))}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm text-green-800">
          Longitude
          <input
            aria-label="Longitude"
            type="number"
            step="0.0001"
            value={settings.longitude}
            onChange={(e) => update('longitude', Number(e.target.value))}
            className={fieldClass}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-green-800">
        Niveau IA
        <select
          aria-label="Niveau IA"
          value={settings.aiLevel}
          onChange={(e) => update('aiLevel', e.target.value as AppSettings['aiLevel'])}
          className={fieldClass}
        >
          <option value="aucune">Aucune</option>
          <option value="photo">Photo</option>
          <option value="photo_assistant">Photo + assistant</option>
        </select>
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm text-green-800">
          Mois de début de saison
          <select
            aria-label="Mois de début de saison"
            value={settings.seasonStartMonth}
            onChange={(e) => update('seasonStartMonth', Number(e.target.value))}
            className={fieldClass}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm text-green-800">
          Mois de fin de saison
          <select
            aria-label="Mois de fin de saison"
            value={settings.seasonEndMonth}
            onChange={(e) => update('seasonEndMonth', Number(e.target.value))}
            className={fieldClass}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-green-800">
        Clé Gemini
        <input
          aria-label="Clé Gemini"
          type="password"
          autoComplete="off"
          value={settings.geminiApiKey ?? ''}
          onChange={(e) => update('geminiApiKey', e.target.value)}
          className={fieldClass}
        />
        <span className="text-xs text-green-600">
          Stockée uniquement sur cet appareil.
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={test.status === 'en_cours'}
          className="rounded-lg border border-green-300 px-4 py-2 text-sm font-medium text-green-800 disabled:opacity-60"
        >
          {test.status === 'en_cours' ? 'Test en cours…' : 'Tester la connexion'}
        </button>
        {test.status === 'ok' && (
          <p className="text-sm text-green-700">Connexion OK</p>
        )}
        {test.status === 'erreur' && (
          <p className="text-sm text-red-600">{test.message}</p>
        )}
      </div>

      <button
        type="submit"
        className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white"
      >
        Enregistrer
      </button>
      {saved && (
        <p className="rounded-lg bg-green-100 px-3 py-2 text-sm text-green-800">
          Réglages enregistrés.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-green-900">Sauvegarde</h2>
        <ExportButton />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-green-900">Importer une sauvegarde</h2>
        <ImportButton />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-green-900">Export CSV</h2>
        <CsvExportPanel />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-green-900">Journal système</h2>
        <AuditLogPanel />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-green-900">Maintenance</h2>
        <TombstonePurgePanel />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-green-900">Compte</h2>
        {auth.currentUser && (
          <p className="text-sm text-green-700">{auth.currentUser.email}</p>
        )}
        {guardTripped ? (
          <>
            <p className="text-sm text-red-600">
              Synchronisation suspendue : trop d'écritures aujourd'hui (protection du quota).
              Elle reprendra demain.
            </p>
            <button
              type="button"
              onClick={() => {
                resetWriteGuard()
                setGuardTripped(false)
              }}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700"
            >
              Réactiver maintenant
            </button>
          </>
        ) : (
          <p className="text-xs text-green-600">
            Écritures cloud cette session : {sessionWriteCount()}
          </p>
        )}
        <button
          type="button"
          onClick={() => signOutUser()}
          className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600"
        >
          Se déconnecter
        </button>
      </section>

      <p className="text-xs text-green-600">
        Version installée : {__APP_BUILD_HASH__} ·{' '}
        {new Date(__APP_BUILD_TIME__).toLocaleString('fr-FR')}
        {published !== null && (
          <>
            <br />
            Dernière publiée : {published.hash}
            {published.hash === __APP_BUILD_HASH__ ? ' · à jour ✓' : ' · mise à jour disponible'}
          </>
        )}
      </p>
    </form>
  )
}
