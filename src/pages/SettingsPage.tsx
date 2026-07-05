import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { AppSettings } from '../data/model'
import { getSettings, saveSettings } from '../services/settingsService'
import { testGeminiConnection } from '../services/geminiService'
import { signOutUser } from '../services/authService'
import { getSyncStatus, resetSyncCursors, runInitialSync } from '../services/syncService'
import type { SyncStatus } from '../services/syncService'
import { auth } from '../data/firebase'
import { fetchPublishedVersion, type PublishedVersion } from '../services/versionService'
import { ExportButton } from '../components/ExportButton'
import { ImportButton } from '../components/ImportButton'
import { CsvExportPanel } from '../components/CsvExportPanel'
import { AuditLogPanel } from '../components/AuditLogPanel'

const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  synced: 'Synchronisé',
  syncing: 'Synchronisation…',
  offline: 'Hors ligne',
  error: 'Erreur de synchronisation',
}

const SYNC_STATUS_COLORS: Record<SyncStatus, string> = {
  synced: 'text-green-700',
  syncing: 'text-yellow-700',
  offline: 'text-gray-500',
  error: 'text-red-600',
}

function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus())

  useEffect(() => {
    const interval = setInterval(() => setStatus(getSyncStatus()), 2000)
    return () => clearInterval(interval)
  }, [])

  return <p className={`text-sm ${SYNC_STATUS_COLORS[status]}`}>{SYNC_STATUS_LABELS[status]}</p>
}

type TestState =
  | { status: 'idle' }
  | { status: 'en_cours' }
  | { status: 'ok' }
  | { status: 'erreur'; message: string }

const fieldClass =
  'w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-sm text-green-950'

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState(false)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [resyncState, setResyncState] = useState<'idle' | 'syncing' | 'done' | 'erreur'>('idle')
  const [published, setPublished] = useState<PublishedVersion | null>(null)

  useEffect(() => {
    void getSettings().then(setSettings)
    void fetchPublishedVersion().then(setPublished)
  }, [])

  if (!settings) {
    return <p className="text-sm text-green-700">Chargement…</p>
  }

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
    setSaved(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!settings) return
    await saveSettings(settings)
    setSaved(true)
  }

  async function handleResync() {
    const uid = auth.currentUser?.uid
    if (!uid) return
    setResyncState('syncing')
    resetSyncCursors()
    await runInitialSync(uid)
    setResyncState(getSyncStatus() === 'synced' ? 'done' : 'erreur')
    setTimeout(() => setResyncState('idle'), 3000)
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
        <h2 className="text-sm font-semibold text-green-900">Compte</h2>
        {auth.currentUser && (
          <p className="text-sm text-green-700">{auth.currentUser.email}</p>
        )}
        <SyncStatusIndicator />
        <button
          type="button"
          onClick={() => void handleResync()}
          disabled={resyncState === 'syncing'}
          className="rounded-lg border border-green-300 px-4 py-2 text-sm font-medium text-green-800 disabled:opacity-60"
        >
          {resyncState === 'syncing' ? 'Synchronisation en cours…' : 'Resynchroniser tout'}
        </button>
        {resyncState === 'done' && (
          <p className="text-sm text-green-700">Synchronisation complète.</p>
        )}
        {resyncState === 'erreur' && (
          <p className="text-sm text-red-600">Erreur de synchronisation. Réessaie plus tard.</p>
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
