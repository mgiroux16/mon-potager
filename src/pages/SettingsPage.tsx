import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { AppSettings } from '../data/model'
import { getSettings, saveSettings } from '../services/settingsService'
import { testGeminiConnection } from '../services/geminiService'
import { ExportButton } from '../components/ExportButton'

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

  useEffect(() => {
    void getSettings().then(setSettings)
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
    </form>
  )
}
