# Palier 3b-2a : fondations Réglages + client Gemini — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser les fondations de la voix Gemini : page Réglages réelle, clé Gemini stockée sur l'appareil, client réseau minimal prouvé par un bouton « Tester la connexion ».

**Architecture:** Trois unités isolées, dépendances dans un seul sens. `settingsService` (données, existant : on ajoute le champ clé et on corrige la copie de `DEFAULT_SETTINGS`) ← `SettingsPage` (UI, réécrite depuis un placeholder) → `geminiService` (réseau, neuf, pur, `fetch` mockable). Aucune voix, aucun micro dans ce palier.

**Tech Stack:** React + TypeScript + Vite, Dexie (IndexedDB), Tailwind (`green-*`), lucide-react, Vitest + React Testing Library (jsdom, fake-indexeddb), userEvent.

**Spec de référence :** `docs/superpowers/specs/2026-06-25-palier-3b-2a-fondations-reglages-gemini-design.md`

---

## Structure des fichiers

- Modifier : `src/data/model.ts` — ajout du champ `geminiApiKey?: string` à `AppSettings`.
- Modifier : `src/services/settingsService.ts` — `getSettings` renvoie une copie.
- Modifier : `src/services/settingsService.test.ts` — tests d'isolation de la copie + round-trip de la clé.
- Créer : `src/services/geminiService.ts` — `callGemini` + `testGeminiConnection`.
- Créer : `src/services/geminiService.test.ts` — tests avec `fetch` mocké.
- Réécrire : `src/pages/SettingsPage.tsx` — formulaire réel.
- Créer : `src/pages/SettingsPage.test.tsx` — tests de chargement, enregistrement, test de connexion.

Note : le projet n'active pas `globals` Vitest. Importer explicitement `describe, it, expect` (et `vi`, `beforeEach`) depuis `vitest` dans chaque fichier de test. `src/test/setup.ts` gère déjà `cleanup()` après chaque test.

---

## Task 1 : modèle + correction de la copie des réglages

**Files:**
- Modify: `src/data/model.ts:146-157`
- Modify: `src/services/settingsService.ts:19-22`
- Test: `src/services/settingsService.test.ts`

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter ces deux tests à l'intérieur du `describe('settingsService', ...)` de `src/services/settingsService.test.ts` :

```ts
  it('renvoie une copie des réglages par défaut, jamais la référence partagée', async () => {
    const a = await getSettings()
    a.locationName = 'MUTÉ'
    const b = await getSettings()
    expect(b.locationName).toBe(DEFAULT_SETTINGS.locationName)
    expect(DEFAULT_SETTINGS.locationName).not.toBe('MUTÉ')
  })

  it('persiste et relit la clé Gemini', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, geminiApiKey: 'AIza-test-123' })
    const s = await getSettings()
    expect(s.geminiApiKey).toBe('AIza-test-123')
  })
```

- [ ] **Step 2 : lancer les tests pour vérifier l'échec**

Run: `npm test -- src/services/settingsService.test.ts`
Expected: FAIL — le test de copie échoue (la référence partagée est mutée) ; le test de clé échoue à la compilation TS (`geminiApiKey` inconnu sur `AppSettings`).

- [ ] **Step 3 : ajouter le champ au modèle**

Dans `src/data/model.ts`, interface `AppSettings`, ajouter après la ligne `aiLevel: ...` :

```ts
  geminiApiKey?: string // clé API Gemini, stockée sur l'appareil ; vide par défaut
```

- [ ] **Step 4 : corriger la copie dans getSettings**

Dans `src/services/settingsService.ts`, remplacer le corps de `getSettings` :

```ts
export async function getSettings(): Promise<AppSettings> {
  const stored = await db.settings.get(SETTINGS_ID)
  return stored ?? { ...DEFAULT_SETTINGS }
}
```

- [ ] **Step 5 : lancer les tests pour vérifier le succès**

Run: `npm test -- src/services/settingsService.test.ts`
Expected: PASS (5 tests verts).

- [ ] **Step 6 : commit**

```bash
git add src/data/model.ts src/services/settingsService.ts src/services/settingsService.test.ts
git commit -m "feat(reglages): champ geminiApiKey + getSettings renvoie une copie"
```

---

## Task 2 : client réseau Gemini

**Files:**
- Create: `src/services/geminiService.ts`
- Test: `src/services/geminiService.test.ts`

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `src/services/geminiService.test.ts` :

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { callGemini, testGeminiConnection, GEMINI_MODEL } from './geminiService'

function mockFetchOnce(impl: () => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

function geminiOk(text: string): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function geminiError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: { message } }),
    { status, headers: { 'Content-Type': 'application/json' } },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('callGemini', () => {
  it('renvoie le texte extrait de la réponse Gemini', async () => {
    mockFetchOnce(() => geminiOk('Bonjour'))
    const out = await callGemini('Dis bonjour', 'AIza-x')
    expect(out).toBe('Bonjour')
  })

  it('appelle une URL contenant le modèle et la clé', async () => {
    const fetchMock = vi.fn(() => geminiOk('OK'))
    vi.stubGlobal('fetch', fetchMock)
    await callGemini('p', 'AIza-secret')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain(GEMINI_MODEL)
    expect(url).toContain('AIza-secret')
  })

  it('lève une erreur lisible sur une réponse HTTP en erreur', async () => {
    mockFetchOnce(() => geminiError(400, 'API key not valid'))
    await expect(callGemini('p', 'mauvaise')).rejects.toThrow(/API key not valid/)
  })
})

describe('testGeminiConnection', () => {
  it('renvoie { ok: true } quand l\'appel réussit', async () => {
    mockFetchOnce(() => geminiOk('OK'))
    expect(await testGeminiConnection('AIza-x')).toEqual({ ok: true })
  })

  it('renvoie { ok: false, error } sur une réponse en erreur, sans lever', async () => {
    mockFetchOnce(() => geminiError(400, 'API key not valid'))
    const res = await testGeminiConnection('mauvaise')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/API key not valid/)
  })

  it('renvoie { ok: false, error } quand le réseau échoue, sans lever', async () => {
    mockFetchOnce(() => Promise.reject(new Error('Failed to fetch')))
    const res = await testGeminiConnection('AIza-x')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2 : lancer les tests pour vérifier l'échec**

Run: `npm test -- src/services/geminiService.test.ts`
Expected: FAIL — module `./geminiService` introuvable.

- [ ] **Step 3 : implémenter le service**

Créer `src/services/geminiService.ts` :

```ts
// Modèle gratuit utilisé pour les appels Gemini. Changer ici suffit à basculer.
export const GEMINI_MODEL = 'gemini-2.0-flash'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  error?: { message?: string }
}

/**
 * Appelle l'API Gemini avec un prompt texte et renvoie le texte de la réponse.
 * La clé n'est jamais journalisée. Lève une erreur lisible si la réponse est en erreur.
 */
export async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const url = `${ENDPOINT}/${GEMINI_MODEL}:generateContent?key=${apiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  })

  const data = (await response.json().catch(() => ({}))) as GeminiResponse

  if (!response.ok) {
    const detail = data.error?.message ?? response.statusText
    throw new Error(`Gemini ${response.status} : ${detail}`)
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (text == null) {
    throw new Error('Réponse Gemini vide ou inattendue')
  }
  return text
}

export type ConnectionResult = { ok: true } | { ok: false; error: string }

/**
 * Vérifie qu'une clé Gemini fonctionne en envoyant un mini-prompt.
 * Ne lève jamais : capte toute erreur (clé invalide, réseau, quota) et la renvoie.
 */
export async function testGeminiConnection(apiKey: string): Promise<ConnectionResult> {
  try {
    await callGemini('Réponds OK', apiKey)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
```

- [ ] **Step 4 : lancer les tests pour vérifier le succès**

Run: `npm test -- src/services/geminiService.test.ts`
Expected: PASS (6 tests verts).

- [ ] **Step 5 : commit**

```bash
git add src/services/geminiService.ts src/services/geminiService.test.ts
git commit -m "feat(gemini): client réseau callGemini + testGeminiConnection"
```

---

## Task 3 : page Réglages réelle

**Files:**
- Rewrite: `src/pages/SettingsPage.tsx`
- Test: `src/pages/SettingsPage.test.tsx`

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `src/pages/SettingsPage.test.tsx` :

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../data/db'
import { getSettings } from '../services/settingsService'
import { SettingsPage } from './SettingsPage'

vi.mock('../services/geminiService', () => ({
  testGeminiConnection: vi.fn(),
}))
import { testGeminiConnection } from '../services/geminiService'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  vi.clearAllMocks()
})

describe('SettingsPage', () => {
  it('charge et affiche les valeurs par défaut', async () => {
    render(<SettingsPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Nom du lieu')).toHaveValue('Champniers (16430)'),
    )
  })

  it('enregistre une modification de localisation', async () => {
    render(<SettingsPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Nom du lieu')).toHaveValue('Champniers (16430)'),
    )
    const user = userEvent.setup()
    const champ = screen.getByLabelText('Nom du lieu')
    await user.clear(champ)
    await user.type(champ, 'Mon jardin')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(async () => {
      const s = await getSettings()
      expect(s.locationName).toBe('Mon jardin')
    })
  })

  it('teste la connexion et affiche le succès', async () => {
    vi.mocked(testGeminiConnection).mockResolvedValue({ ok: true })
    render(<SettingsPage />)
    await waitFor(() => expect(screen.getByLabelText('Nom du lieu')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Clé Gemini'), 'AIza-test')
    await user.click(screen.getByRole('button', { name: 'Tester la connexion' }))

    await waitFor(() => expect(screen.getByText('Connexion OK')).toBeInTheDocument())
    expect(vi.mocked(testGeminiConnection)).toHaveBeenCalledWith('AIza-test')
  })

  it('affiche le message d\'erreur si la connexion échoue', async () => {
    vi.mocked(testGeminiConnection).mockResolvedValue({ ok: false, error: 'Clé invalide' })
    render(<SettingsPage />)
    await waitFor(() => expect(screen.getByLabelText('Nom du lieu')).toBeInTheDocument())

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Clé Gemini'), 'mauvaise')
    await user.click(screen.getByRole('button', { name: 'Tester la connexion' }))

    await waitFor(() => expect(screen.getByText(/Clé invalide/)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2 : lancer les tests pour vérifier l'échec**

Run: `npm test -- src/pages/SettingsPage.test.tsx`
Expected: FAIL — la page est un placeholder, les champs n'existent pas.

- [ ] **Step 3 : réécrire la page**

Remplacer tout le contenu de `src/pages/SettingsPage.tsx` :

```tsx
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { AppSettings } from '../data/model'
import { getSettings, saveSettings } from '../services/settingsService'
import { testGeminiConnection } from '../services/geminiService'

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
    </form>
  )
}
```

- [ ] **Step 4 : lancer les tests pour vérifier le succès**

Run: `npm test -- src/pages/SettingsPage.test.tsx`
Expected: PASS (4 tests verts).

- [ ] **Step 5 : vérifier que `PlaceholderPage` n'est plus importé inutilement**

Run: `npm run lint`
Expected: aucune erreur nouvelle (l'import `PlaceholderPage`/`Settings` de lucide a disparu avec la réécriture). L'avertissement préexistant sur `vitest.config.ts` (triple-slash) est hors périmètre.

- [ ] **Step 6 : commit**

```bash
git add src/pages/SettingsPage.tsx src/pages/SettingsPage.test.tsx
git commit -m "feat(reglages): formulaire réel + bouton Tester la connexion Gemini"
```

---

## Task 4 : vérification globale

**Files:** aucun changement de code, vérifications seules.

- [ ] **Step 1 : suite complète verte**

Run: `npm test`
Expected: PASS — l'ensemble des tests (anciens + nouveaux) au vert.

- [ ] **Step 2 : build et lint**

Run: `npm run build` puis `npm run lint`
Expected: build OK, lint sans erreur nouvelle.

- [ ] **Step 3 : vérification navigateur (parcours Réglages)**

Démarrer le serveur de dev, ouvrir la page Réglages :
- Éditer le nom du lieu, Enregistrer, recharger : la valeur persiste.
- Saisir une clé bidon, cliquer « Tester la connexion » : un message d'erreur propre s'affiche, l'app ne plante pas.
- Le test avec la vraie clé reste à la main de Mathieu (secret non manipulé).

Capturer une preuve (capture d'écran ou logs réseau montrant l'appel Gemini rejeté proprement).

---

## Self-review (rempli à l'écriture du plan)

- **Couverture du spec :** Unité 1 (modèle + copie) → Task 1 ; Unité 2 (geminiService) → Task 2 ; Unité 3 (SettingsPage) → Task 3 ; critères de réussite (tests/build/lint/navigateur) → Task 4. Suivi `DEFAULT_SETTINGS` du palier 2 → Task 1 Step 4.
- **Placeholders :** aucun ; tout le code est fourni en entier.
- **Cohérence des types :** `geminiApiKey?: string` ajouté en Task 1 et consommé en Task 3 ; `ConnectionResult` défini en Task 2 et utilisé via `testGeminiConnection` en Task 3 ; `GEMINI_MODEL` exporté en Task 2 et importé dans son test.
