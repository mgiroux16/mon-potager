# Palier 4b : météo Open-Meteo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rattacher chaque entrée du journal à son contexte météo, automatiquement et sans clé API, pour donner du sens aux observations (« noté après 9 jours de forte chaleur, peu de pluie »).

**Architecture:** Un service réseau `weatherService` qui ne lève jamais (sur le modèle de `geminiService`), appelant l'API Open-Meteo `forecast` (snapshot du jour + historique via `past_days`, sans le délai de l'archive). Toute la logique de cumuls et de phrase est dans des fonctions PURES (`weatherSummary.ts`), testables sans réseau. Le snapshot est figé sur l'entrée à la création ; les cumuls sont recalculés à l'affichage à partir d'un seul appel d'historique mis en cache.

**Tech Stack:** TypeScript, Dexie (déjà en place), React 19 + dexie-react-hooks, Vitest. API Open-Meteo (`https://api.open-meteo.com/v1/forecast`, sans clé).

**Conventions de code (STRICTES) :** pas de point-virgule, guillemets simples, indentation 2 espaces. Vérification : `npm test` ET `npm run build` (le build fait le type-check `tsc -b`) ET `npm run lint`. Français sans tiret cadratin.

**État de départ (commit `42cbf1f`, branche `palier-4b-meteo-open-meteo`) :** le modèle porte déjà `WeatherSnapshot`, `GardenLogEntry.weather?`, `status`, `sourcePhrase`, `varietyId` (livrés au palier 4a). Aucune migration Dexie nécessaire pour 4b.

**Forme réelle de la réponse Open-Meteo (vérifiée le 2026-06-25 sur Champniers 45.72/0.19) :**
```json
{
  "current": { "time": "2026-06-25T21:15", "temperature_2m": 36.3, "precipitation": 0.0 },
  "daily": {
    "time": ["2026-06-18", "...", "2026-06-25"],
    "temperature_2m_max": [37.4, "...", 40.6],
    "temperature_2m_min": [20.4, "...", 26.4],
    "precipitation_sum": [0.0, "...", 0.0]
  }
}
```

---

## File Structure

- `src/services/weatherService.ts` (Create) : couche réseau Open-Meteo. `fetchTodaySnapshot`, `fetchDailyHistory`, type `DailyWeather`, cache mémoire court. Ne lève jamais, renvoie `null` en cas d'échec.
- `src/services/weatherService.test.ts` (Create) : tests avec `fetch` moqué.
- `src/services/weatherSummary.ts` (Create) : logique PURE. `summarizeWeather`, `describeWeatherContext`, `countArrosagesBetween`. Zéro réseau.
- `src/services/weatherSummary.test.ts` (Create) : tests sur fixtures.
- `src/pages/QuickAddPage.tsx` (Modify) : à la validation, fige le snapshot météo du jour sur l'entrée.
- `src/pages/QuickAddPage.test.tsx` (Modify, APPEND) : un test que le snapshot est attaché.
- `src/services/logView.ts` (Modify) : formateur `formatSnapshotTemp`.
- `src/services/logView.test.ts` (Modify, APPEND) : test du formateur.
- `src/components/WeatherContextBanner.tsx` (Create) : bandeau présentationnel (reçoit un texte déjà calculé).
- `src/components/WeatherContextBanner.test.tsx` (Create) : test de rendu.
- `src/pages/JournalPage.tsx` (Modify) : badge température sur les cartes + bandeau de contexte sous les observations/problèmes, à partir d'un seul appel d'historique.
- `src/pages/JournalPage.test.tsx` (Modify, APPEND) : test que le badge et le contexte s'affichent (service moqué).

---

## Task 1 : couche réseau weatherService

**Files:**
- Create: `src/services/weatherService.ts`
- Test: `src/services/weatherService.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchTodaySnapshot, fetchDailyHistory, __clearWeatherCache } from './weatherService'

function mockFetchOnce(payload: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status: ok ? 200 : 500, statusText: 'err', json: async () => payload })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  __clearWeatherCache()
})

describe('fetchTodaySnapshot', () => {
  it('mappe la réponse Open-Meteo en WeatherSnapshot', async () => {
    mockFetchOnce({
      current: { temperature_2m: 36.3, precipitation: 0 },
      daily: { time: ['2026-06-25'], temperature_2m_max: [40.6], temperature_2m_min: [26.4], precipitation_sum: [0] },
    })
    const snap = await fetchTodaySnapshot(45.72, 0.19)
    expect(snap?.source).toBe('open-meteo')
    expect(snap?.tempC).toBe(36.3)
    expect(snap?.tempMaxC).toBe(40.6)
    expect(snap?.tempMinC).toBe(26.4)
    expect(snap?.rainMm).toBe(0)
    expect(typeof snap?.capturedAt).toBe('number')
  })

  it('renvoie null si le réseau échoue (ne lève jamais)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await fetchTodaySnapshot(45.72, 0.19)).toBeNull()
  })

  it('renvoie null sur réponse HTTP en erreur', async () => {
    mockFetchOnce({}, false)
    expect(await fetchTodaySnapshot(45.72, 0.19)).toBeNull()
  })
})

describe('fetchDailyHistory', () => {
  it('mappe les tableaux quotidiens en DailyWeather[]', async () => {
    mockFetchOnce({
      daily: {
        time: ['2026-06-24', '2026-06-25'],
        temperature_2m_max: [42.9, 40.6],
        temperature_2m_min: [24.4, 26.4],
        precipitation_sum: [0.1, 0],
      },
    })
    const hist = await fetchDailyHistory(45.72, 0.19, 30)
    expect(hist).toEqual([
      { date: '2026-06-24', tempMaxC: 42.9, tempMinC: 24.4, rainMm: 0.1 },
      { date: '2026-06-25', tempMaxC: 40.6, tempMinC: 26.4, rainMm: 0 },
    ])
  })

  it('met en cache : un deuxième appel ne refait pas de fetch', async () => {
    const f = vi.fn(async () => ({
      ok: true, status: 200, statusText: 'ok',
      json: async () => ({ daily: { time: ['2026-06-25'], temperature_2m_max: [40], temperature_2m_min: [26], precipitation_sum: [0] } }),
    }))
    vi.stubGlobal('fetch', f)
    await fetchDailyHistory(45.72, 0.19, 30)
    await fetchDailyHistory(45.72, 0.19, 30)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('renvoie null si le réseau échoue', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await fetchDailyHistory(45.72, 0.19, 30)).toBeNull()
  })
})
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/weatherService.test.ts`
Expected: FAIL (module `./weatherService` introuvable).

- [ ] **Step 3 : Écrire l'implémentation minimale**

Create `src/services/weatherService.ts` :

```ts
import type { WeatherSnapshot } from '../data/model'

const BASE = 'https://api.open-meteo.com/v1/forecast'
const DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_sum'

export interface DailyWeather {
  date: string // 'YYYY-MM-DD'
  tempMaxC: number
  tempMinC: number
  rainMm: number
}

interface ForecastResponse {
  current?: { temperature_2m?: number; precipitation?: number }
  daily?: {
    time?: string[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_sum?: number[]
  }
}

// Cache mémoire court : un seul appel d'historique réseau par fenêtre, partagé par tous
// les bandeaux de contexte du journal. TTL 30 min, invalidé par changement de coordonnées.
const HISTORY_TTL_MS = 30 * 60 * 1000
let historyCache: { key: string; at: number; data: DailyWeather[] } | null = null

// Réservé aux tests : repartir d'un cache vide.
export function __clearWeatherCache(): void {
  historyCache = null
}

async function getForecast(params: string): Promise<ForecastResponse | null> {
  try {
    const res = await fetch(`${BASE}?${params}`)
    if (!res.ok) return null
    return (await res.json()) as ForecastResponse
  } catch {
    return null
  }
}

export async function fetchTodaySnapshot(
  latitude: number,
  longitude: number,
): Promise<WeatherSnapshot | null> {
  const params =
    `latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,precipitation&daily=${DAILY}` +
    `&forecast_days=1&timezone=auto`
  const data = await getForecast(params)
  if (!data) return null
  const snap: WeatherSnapshot = { capturedAt: Date.now(), source: 'open-meteo' }
  if (data.current?.temperature_2m != null) snap.tempC = data.current.temperature_2m
  if (data.daily?.temperature_2m_max?.[0] != null) snap.tempMaxC = data.daily.temperature_2m_max[0]
  if (data.daily?.temperature_2m_min?.[0] != null) snap.tempMinC = data.daily.temperature_2m_min[0]
  if (data.daily?.precipitation_sum?.[0] != null) snap.rainMm = data.daily.precipitation_sum[0]
  return snap
}

export async function fetchDailyHistory(
  latitude: number,
  longitude: number,
  pastDays: number,
): Promise<DailyWeather[] | null> {
  const key = `${latitude},${longitude},${pastDays}`
  if (historyCache && historyCache.key === key && Date.now() - historyCache.at < HISTORY_TTL_MS) {
    return historyCache.data
  }
  const params =
    `latitude=${latitude}&longitude=${longitude}` +
    `&daily=${DAILY}&past_days=${pastDays}&forecast_days=1&timezone=auto`
  const data = await getForecast(params)
  const time = data?.daily?.time
  if (!data || !time) return null
  const data2 = data.daily!
  const out: DailyWeather[] = time.map((date, i) => ({
    date,
    tempMaxC: data2.temperature_2m_max?.[i] ?? 0,
    tempMinC: data2.temperature_2m_min?.[i] ?? 0,
    rainMm: data2.precipitation_sum?.[i] ?? 0,
  }))
  historyCache = { key, at: Date.now(), data: out }
  return out
}
```

- [ ] **Step 4 : Lancer pour vérifier le succès**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/weatherService.test.ts`
Expected: PASS (tous les tests verts).

- [ ] **Step 5 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/services/weatherService.ts src/services/weatherService.test.ts
git commit -m "feat(meteo): service Open-Meteo, snapshot du jour et historique en cache"
```

---

## Task 2 : cumuls météo (logique pure)

**Files:**
- Create: `src/services/weatherSummary.ts`
- Test: `src/services/weatherSummary.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
import { describe, expect, it } from 'vitest'
import { summarizeWeather } from './weatherSummary'
import type { DailyWeather } from './weatherService'

// Petite canicule sèche finissant au 2026-06-25, conforme aux vraies données Champniers.
const history: DailyWeather[] = [
  { date: '2026-06-18', tempMaxC: 37.4, tempMinC: 20.4, rainMm: 0 },
  { date: '2026-06-19', tempMaxC: 36.2, tempMinC: 21.1, rainMm: 0 },
  { date: '2026-06-20', tempMaxC: 36.5, tempMinC: 19.8, rainMm: 0 },
  { date: '2026-06-21', tempMaxC: 40.3, tempMinC: 21.4, rainMm: 0 },
  { date: '2026-06-22', tempMaxC: 43.0, tempMinC: 24.9, rainMm: 0 },
  { date: '2026-06-23', tempMaxC: 43.3, tempMinC: 26.1, rainMm: 0.1 },
  { date: '2026-06-24', tempMaxC: 42.9, tempMinC: 24.4, rainMm: 0.1 },
  { date: '2026-06-25', tempMaxC: 40.6, tempMinC: 26.4, rainMm: 0 },
]

const opts = { heatThresholdC: 30, significantRainMm: 5 }

describe('summarizeWeather', () => {
  it('cumule la pluie sur 7 et 14 jours jusqu à la date de référence incluse', () => {
    const s = summarizeWeather(history, '2026-06-25', opts)
    expect(s.rain7Mm).toBeCloseTo(0.2, 5) // 19→25 : 0.1 + 0.1
    expect(s.rain14Mm).toBeCloseTo(0.2, 5)
  })

  it('compte les jours chauds (max >= seuil) sur 14 jours', () => {
    const s = summarizeWeather(history, '2026-06-25', opts)
    expect(s.hotDayCount).toBe(8)
  })

  it('mesure l épisode de chaleur en cours (série consécutive finissant à la date)', () => {
    const s = summarizeWeather(history, '2026-06-25', opts)
    expect(s.heatEpisodeDays).toBe(8)
  })

  it('compte les jours secs consécutifs (pluie < seuil significatif) finissant à la date', () => {
    const s = summarizeWeather(history, '2026-06-25', opts)
    expect(s.dryDayStreak).toBe(8)
  })

  it('ignore les jours postérieurs à la date de référence', () => {
    const s = summarizeWeather(history, '2026-06-20', opts)
    expect(s.hotDayCount).toBe(3) // 18, 19, 20
    expect(s.heatEpisodeDays).toBe(3)
  })

  it('renvoie des zéros sur un historique vide', () => {
    const s = summarizeWeather([], '2026-06-25', opts)
    expect(s).toEqual({ rain7Mm: 0, rain14Mm: 0, rain30Mm: 0, dryDayStreak: 0, hotDayCount: 0, heatEpisodeDays: 0 })
  })

  it('coupe l épisode de chaleur dès un jour sous le seuil', () => {
    const mixed: DailyWeather[] = [
      { date: '2026-06-23', tempMaxC: 33, tempMinC: 20, rainMm: 0 },
      { date: '2026-06-24', tempMaxC: 22, tempMinC: 15, rainMm: 0 },
      { date: '2026-06-25', tempMaxC: 31, tempMinC: 18, rainMm: 0 },
    ]
    const s = summarizeWeather(mixed, '2026-06-25', opts)
    expect(s.heatEpisodeDays).toBe(1) // seul le 25
  })

  it('coupe la série sèche dès une vraie pluie', () => {
    const wet: DailyWeather[] = [
      { date: '2026-06-23', tempMaxC: 25, tempMinC: 15, rainMm: 12 },
      { date: '2026-06-24', tempMaxC: 26, tempMinC: 16, rainMm: 0 },
      { date: '2026-06-25', tempMaxC: 27, tempMinC: 16, rainMm: 1 },
    ]
    const s = summarizeWeather(wet, '2026-06-25', opts)
    expect(s.dryDayStreak).toBe(2) // 24 et 25 ; le 23 (12 mm) coupe
  })
})
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/weatherSummary.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : Écrire l'implémentation minimale**

Create `src/services/weatherSummary.ts` :

```ts
import type { DailyWeather } from './weatherService'

export interface WeatherSummary {
  rain7Mm: number
  rain14Mm: number
  rain30Mm: number
  dryDayStreak: number // jours consécutifs sans pluie significative finissant à refDate
  hotDayCount: number // jours max >= seuil sur 14 jours
  heatEpisodeDays: number // plus longue série chaude consécutive finissant à refDate
}

export interface WeatherSummaryOptions {
  heatThresholdC: number
  significantRainMm: number
}

function sumRain(days: DailyWeather[]): number {
  return days.reduce((acc, d) => acc + d.rainMm, 0)
}

// Garde les jours <= refDate, triés du plus ancien au plus récent.
function upTo(history: DailyWeather[], refDate: string): DailyWeather[] {
  return history.filter((d) => d.date <= refDate).sort((a, b) => (a.date < b.date ? -1 : 1))
}

export function summarizeWeather(
  history: DailyWeather[],
  refDate: string,
  opts: WeatherSummaryOptions,
): WeatherSummary {
  const days = upTo(history, refDate)
  const lastN = (n: number) => days.slice(Math.max(0, days.length - n))

  // Séries consécutives finissant au jour le plus récent : on remonte depuis la fin.
  let heatEpisodeDays = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].tempMaxC >= opts.heatThresholdC) heatEpisodeDays++
    else break
  }
  let dryDayStreak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].rainMm < opts.significantRainMm) dryDayStreak++
    else break
  }

  return {
    rain7Mm: sumRain(lastN(7)),
    rain14Mm: sumRain(lastN(14)),
    rain30Mm: sumRain(lastN(30)),
    dryDayStreak,
    hotDayCount: lastN(14).filter((d) => d.tempMaxC >= opts.heatThresholdC).length,
    heatEpisodeDays,
  }
}
```

- [ ] **Step 4 : Lancer pour vérifier le succès**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/weatherSummary.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/services/weatherSummary.ts src/services/weatherSummary.test.ts
git commit -m "feat(meteo): cumuls purs (pluie, jours chauds, episode canicule, serie seche)"
```

---

## Task 3 : phrase de contexte + comptage des arrosages (logique pure)

**Files:**
- Modify: `src/services/weatherSummary.ts`
- Test: `src/services/weatherSummary.test.ts` (APPEND)

- [ ] **Step 1 : Ajouter les tests qui échouent (APPEND au fichier existant)**

Ajouter ces imports en tête du fichier de test (compléter la ligne d'import existante) :
`import { summarizeWeather, describeWeatherContext, countArrosagesBetween } from './weatherSummary'`
et `import type { GardenLogEntry } from '../data/model'`

Ajouter à la fin du fichier :

```ts
describe('describeWeatherContext', () => {
  const opts = { heatThresholdC: 30, significantRainMm: 5 }
  it('décrit une canicule sèche avec arrosages, sans tiret cadratin', () => {
    const s = summarizeWeather(history, '2026-06-25', opts)
    const txt = describeWeatherContext(s, 3)
    expect(txt).toContain('8 jours de forte chaleur')
    expect(txt).toContain('3 arrosages')
    expect(txt).not.toContain('—')
  })

  it('mentionne le manque de pluie quand les cumuls sont faibles', () => {
    const s = summarizeWeather(history, '2026-06-25', opts)
    expect(describeWeatherContext(s, 0)).toContain('peu de pluie')
  })

  it('accorde le singulier (1 arrosage, 1 jour)', () => {
    const oneHot = [{ date: '2026-06-25', tempMaxC: 35, tempMinC: 20, rainMm: 0 }]
    const s = summarizeWeather(oneHot, '2026-06-25', opts)
    const txt = describeWeatherContext(s, 1)
    expect(txt).toContain('1 jour de forte chaleur')
    expect(txt).toContain('1 arrosage ')
    expect(txt).not.toContain('1 arrosages')
  })

  it('renvoie null si aucun contexte notable', () => {
    const calm = [{ date: '2026-06-25', tempMaxC: 22, tempMinC: 14, rainMm: 8 }]
    const s = summarizeWeather(calm, '2026-06-25', opts)
    expect(describeWeatherContext(s, 0)).toBeNull()
  })
})

describe('countArrosagesBetween', () => {
  const log: GardenLogEntry[] = [
    { type: 'arrosage', date: '2026-06-20', createdAt: 1 },
    { type: 'arrosage', date: '2026-06-25', createdAt: 2 },
    { type: 'arrosage', date: '2026-06-10', createdAt: 3 }, // hors fenêtre
    { type: 'recolte', date: '2026-06-24', createdAt: 4 }, // mauvais type
  ]
  it('compte les arrosages dans la fenêtre [start, end] incluse', () => {
    expect(countArrosagesBetween(log, '2026-06-18', '2026-06-25')).toBe(2)
  })
})
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/weatherSummary.test.ts`
Expected: FAIL (`describeWeatherContext` / `countArrosagesBetween` non exportés).

- [ ] **Step 3 : Écrire l'implémentation minimale (APPEND à `weatherSummary.ts`)**

Ajouter en tête : `import type { GardenLogEntry } from '../data/model'`

Ajouter à la fin :

```ts
function plural(n: number, singulier: string, pluriel: string): string {
  return `${n} ${n <= 1 ? singulier : pluriel}`
}

// Construit une phrase de contexte à partir des cumuls. Renvoie null si rien de notable.
export function describeWeatherContext(summary: WeatherSummary, arrosageCount: number): string | null {
  const parts: string[] = []
  if (summary.heatEpisodeDays >= 3) {
    parts.push(`${plural(summary.heatEpisodeDays, 'jour', 'jours')} de forte chaleur d'affilée`)
  } else if (summary.hotDayCount > 0) {
    parts.push(`${plural(summary.hotDayCount, 'jour', 'jours')} de forte chaleur sur 14 jours`)
  }
  if (summary.rain14Mm < 5) {
    parts.push('peu de pluie')
  } else {
    parts.push(`${Math.round(summary.rain14Mm)} mm de pluie sur 14 jours`)
  }
  if (summary.dryDayStreak >= 5) {
    parts.push(`${plural(summary.dryDayStreak, 'jour', 'jours')} sans pluie`)
  }
  if (arrosageCount > 0) {
    parts.push(`${plural(arrosageCount, 'arrosage', 'arrosages')} noté${arrosageCount > 1 ? 's' : ''}`)
  }

  // « peu de pluie » seul (sans chaleur, sans arrosage) n'est pas un contexte digne d'être affiché.
  const notable = summary.heatEpisodeDays > 0 || summary.hotDayCount > 0 || summary.dryDayStreak >= 5 || arrosageCount > 0
  if (!notable) return null

  const sentence = parts.join(', ')
  return `Noté après ${sentence}.`
}

export function countArrosagesBetween(
  log: GardenLogEntry[],
  startDate: string,
  endDate: string,
): number {
  return log.filter((e) => e.type === 'arrosage' && e.date >= startDate && e.date <= endDate).length
}
```

Note pour l'implémenteur : le fichier exporte `plural`, `describeWeatherContext`, `countArrosagesBetween`. Vérifie que le test « 1 jour de forte chaleur » passe : avec `heatEpisodeDays === 1`, on tombe dans la branche `hotDayCount > 0` qui produit « 1 jour de forte chaleur sur 14 jours », ce qui contient bien « 1 jour de forte chaleur ».

- [ ] **Step 4 : Lancer pour vérifier le succès**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/weatherSummary.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/services/weatherSummary.ts src/services/weatherSummary.test.ts
git commit -m "feat(meteo): phrase de contexte et comptage des arrosages sur la periode"
```

---

## Task 4 : figer le snapshot météo à la validation d'une entrée

**Files:**
- Modify: `src/pages/QuickAddPage.tsx`
- Test: `src/pages/QuickAddPage.test.tsx` (APPEND)

Contexte : `EntryForm.handleSubmit` (vers `src/pages/QuickAddPage.tsx:123`) construit `entry` puis appelle `addLogEntry(entry)`. On insère, juste avant `await addLogEntry(entry)`, la capture du snapshot, **uniquement si l'entrée est datée d'aujourd'hui** (le snapshot représente la météo du jour de saisie). Comme `fetchTodaySnapshot` ne lève jamais et renvoie `null` hors-ligne, la sauvegarde n'est jamais bloquée.

- [ ] **Step 1 : Écrire le test qui échoue (APPEND à `QuickAddPage.test.tsx`)**

D'abord, en tête du fichier de test, ajouter le mock du service météo (à placer avec les autres `vi.mock` du fichier ; si aucun n'existe, le mettre après les imports) :

```ts
import { vi } from 'vitest'
vi.mock('../services/weatherService', () => ({
  fetchTodaySnapshot: vi.fn(async () => ({ capturedAt: 1_700_000_000_000, source: 'open-meteo', tempC: 36.3, tempMaxC: 40.6, tempMinC: 26.4, rainMm: 0 })),
  fetchDailyHistory: vi.fn(async () => null),
  __clearWeatherCache: vi.fn(),
}))
```

Puis ajouter ce test (s'inspirer d'un test de soumission existant du fichier pour le rendu et la sélection ; réutiliser les helpers déjà présents) :

```ts
import { db } from '../data/db'

it('fige le snapshot météo du jour sur une entrée datée aujourd hui', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/ajouter']}>
      <Routes>
        <Route path="/ajouter" element={<QuickAddPage />} />
      </Routes>
    </MemoryRouter>,
  )
  // Ouvrir le formulaire « Observation » et le valider.
  await user.click(screen.getByText('Observation'))
  await user.type(screen.getByLabelText('Description'), 'feuilles flétries')
  await user.click(screen.getByRole('button', { name: 'Valider' }))

  await waitFor(async () => {
    const all = await db.log.toArray()
    const saved = all.find((e) => e.description === 'feuilles flétries')
    expect(saved?.weather?.tempC).toBe(36.3)
    expect(saved?.weather?.source).toBe('open-meteo')
  })
})
```

Note : adapter les imports (`userEvent`, `render`, `screen`, `waitFor`, `MemoryRouter`, `Routes`, `Route`, `QuickAddPage`) à ce que le fichier importe déjà. Ne PAS réécrire le fichier : APPEND.

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/pages/QuickAddPage.test.tsx`
Expected: FAIL (`saved.weather` est `undefined`).

- [ ] **Step 3 : Écrire l'implémentation minimale**

Dans `src/pages/QuickAddPage.tsx` :

1. Ajouter l'import en tête :
```ts
import { fetchTodaySnapshot } from '../services/weatherService'
import { getSettings } from '../services/settingsService'
```

2. Dans `handleSubmit`, juste avant `await addLogEntry(entry)` (vers la ligne 164), insérer :
```ts
    // Snapshot météo figé, seulement pour une saisie datée d'aujourd'hui. Jamais bloquant.
    if (date === todayISO()) {
      const settings = await getSettings()
      const snap = await fetchTodaySnapshot(settings.latitude, settings.longitude)
      if (snap) entry.weather = snap
    }
```

- [ ] **Step 4 : Lancer pour vérifier le succès**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/pages/QuickAddPage.test.tsx`
Expected: PASS (le nouveau test passe, et les tests existants restent verts car en jsdom sans mock `fetchTodaySnapshot` renverrait `null` sans bloquer ; ici il est moqué).

- [ ] **Step 5 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/pages/QuickAddPage.tsx src/pages/QuickAddPage.test.tsx
git commit -m "feat(saisie): fige le snapshot meteo du jour a la validation d une entree"
```

---

## Task 5 : formateur de température (logView)

**Files:**
- Modify: `src/services/logView.ts`
- Test: `src/services/logView.test.ts` (APPEND)

- [ ] **Step 1 : Écrire le test qui échoue (APPEND)**

```ts
import { formatSnapshotTemp } from './logView'

describe('formatSnapshotTemp', () => {
  it('arrondit la température courante du snapshot', () => {
    expect(formatSnapshotTemp({ capturedAt: 1, source: 'open-meteo', tempC: 36.3 })).toBe('36 °C')
  })
  it('retombe sur le max si pas de température courante', () => {
    expect(formatSnapshotTemp({ capturedAt: 1, source: 'open-meteo', tempMaxC: 40.6 })).toBe('40 °C')
  })
  it('renvoie null si aucune température', () => {
    expect(formatSnapshotTemp({ capturedAt: 1, source: 'manuel' })).toBeNull()
    expect(formatSnapshotTemp(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/logView.test.ts`
Expected: FAIL (`formatSnapshotTemp` non exporté).

- [ ] **Step 3 : Écrire l'implémentation minimale (APPEND à `logView.ts`)**

Ajouter l'import du type en tête (compléter l'import existant depuis `'../data/model'`) avec `WeatherSnapshot`, puis ajouter :

```ts
export function formatSnapshotTemp(weather: WeatherSnapshot | undefined): string | null {
  if (!weather) return null
  const t = weather.tempC ?? weather.tempMaxC
  if (t == null) return null
  return `${Math.round(t)} °C`
}
```

- [ ] **Step 4 : Lancer pour vérifier le succès**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/services/logView.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/services/logView.ts src/services/logView.test.ts
git commit -m "feat(journal): formateur de temperature du snapshot meteo"
```

---

## Task 6 : bandeau de contexte (composant présentationnel)

**Files:**
- Create: `src/components/WeatherContextBanner.tsx`
- Test: `src/components/WeatherContextBanner.test.tsx`

- [ ] **Step 1 : Écrire le test qui échoue**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WeatherContextBanner } from './WeatherContextBanner'

describe('WeatherContextBanner', () => {
  it('affiche le texte de contexte fourni', () => {
    render(<WeatherContextBanner text="Noté après 8 jours de forte chaleur, peu de pluie." />)
    expect(screen.getByText(/8 jours de forte chaleur/)).toBeInTheDocument()
  })
  it('ne rend rien si le texte est null', () => {
    const { container } = render(<WeatherContextBanner text={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/components/WeatherContextBanner.test.tsx`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : Écrire l'implémentation minimale**

Create `src/components/WeatherContextBanner.tsx` :

```tsx
import { CloudSun } from 'lucide-react'

export function WeatherContextBanner({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
      <CloudSun className="mt-0.5 size-3.5 shrink-0" />
      <span>{text}</span>
    </p>
  )
}
```

- [ ] **Step 4 : Lancer pour vérifier le succès**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/components/WeatherContextBanner.test.tsx`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/components/WeatherContextBanner.tsx src/components/WeatherContextBanner.test.tsx
git commit -m "feat(journal): bandeau de contexte meteo (composant presentational)"
```

---

## Task 7 : câblage dans le journal (badge température + bandeau de contexte)

**Files:**
- Modify: `src/pages/JournalPage.tsx`
- Test: `src/pages/JournalPage.test.tsx` (APPEND)

Objectif : sur chaque carte, si l'entrée porte un snapshot, afficher le badge température. Sous chaque entrée `observation` ou `probleme`, afficher le bandeau de contexte calculé à partir d'UN seul appel d'historique (mis en cache dans le service), partagé par toutes les cartes.

- [ ] **Step 1 : Écrire le test qui échoue (APPEND à `JournalPage.test.tsx`)**

Ajouter le mock du service météo en tête du fichier (avec les autres `vi.mock` éventuels) :

```ts
import { vi } from 'vitest'
vi.mock('../services/weatherService', () => ({
  fetchDailyHistory: vi.fn(async () => [
    { date: '2026-06-23', tempMaxC: 43.3, tempMinC: 26.1, rainMm: 0 },
    { date: '2026-06-24', tempMaxC: 42.9, tempMinC: 24.4, rainMm: 0 },
    { date: '2026-06-25', tempMaxC: 40.6, tempMinC: 26.4, rainMm: 0 },
  ]),
  fetchTodaySnapshot: vi.fn(async () => null),
  __clearWeatherCache: vi.fn(),
}))
```

Puis (en réutilisant les helpers de seed/rendu déjà présents dans le fichier ; s'inspirer d'un test existant pour insérer parcelles/entrées avant le rendu) :

```ts
it('affiche le badge température sur une entrée qui porte un snapshot', async () => {
  await db.log.add({
    type: 'observation', date: '2026-06-25', description: 'feuilles flétries', createdAt: 1,
    weather: { capturedAt: 1, source: 'open-meteo', tempC: 36.3 },
  })
  renderJournal() // helper existant du fichier, sinon : render(<MemoryRouter><JournalPage /></MemoryRouter>)
  expect(await screen.findByText('36 °C')).toBeInTheDocument()
})

it('affiche le bandeau de contexte météo sous une observation', async () => {
  await db.log.add({ type: 'observation', date: '2026-06-25', description: 'tomates à l arrêt', createdAt: 2 })
  renderJournal()
  expect(await screen.findByText(/forte chaleur/)).toBeInTheDocument()
})
```

Note : si le fichier n'a pas de helper `renderJournal`, utiliser le même pattern de rendu que les autres tests du fichier (probablement `render(<MemoryRouter>...<JournalPage/>...</MemoryRouter>)`). Réutiliser les réglages par défaut (lat/long Champniers) via `getSettings`, déjà couverts.

- [ ] **Step 2 : Lancer pour vérifier l'échec**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/pages/JournalPage.test.tsx`
Expected: FAIL (ni badge ni bandeau rendus).

- [ ] **Step 3 : Écrire l'implémentation minimale**

Dans `src/pages/JournalPage.tsx` :

1. Imports en tête :
```ts
import { useEffect, useState } from 'react'
import { fetchDailyHistory, type DailyWeather } from '../services/weatherService'
import { summarizeWeather, describeWeatherContext, countArrosagesBetween } from '../services/weatherSummary'
import { formatSnapshotTemp } from '../services/logView'
import { getSettings } from '../services/settingsService'
import { WeatherContextBanner } from '../components/WeatherContextBanner'
```
(`useState` est peut-être déjà importé ; ne pas le dupliquer.)

2. Dans le composant `JournalPage`, après les `useLiveQuery`, charger l'historique une fois et les seuils :
```ts
  const settings = useLiveQuery(() => getSettings(), [], undefined)
  const [history, setHistory] = useState<DailyWeather[] | null>(null)
  useEffect(() => {
    if (!settings) return
    let alive = true
    fetchDailyHistory(settings.latitude, settings.longitude, 30).then((h) => {
      if (alive) setHistory(h)
    })
    return () => {
      alive = false
    }
  }, [settings])
```

3. Définir une fonction de contexte par entrée (dans le corps du composant, avant le `return`) :
```ts
  function contextFor(entry: GardenLogEntry): string | null {
    if (!history || !settings) return null
    if (entry.type !== 'observation' && entry.type !== 'probleme') return null
    const opts = { heatThresholdC: settings.heatThresholdC, significantRainMm: settings.significantRainMm }
    const summary = summarizeWeather(history, entry.date, opts)
    const start = history.length > 0 ? history[Math.max(0, history.length - 14)].date : entry.date
    const arrosages = countArrosagesBetween(entries, start, entry.date)
    return describeWeatherContext(summary, arrosages)
  }
```
(`GardenLogEntry` est déjà importé depuis `'../data/model'` dans ce fichier.)

4. Dans le `map` des cartes (vers la ligne 110-119), à l'intérieur de `<div className="min-w-0 flex-1">`, après la ligne du `view.detail`, ajouter le bandeau :
```tsx
                <WeatherContextBanner text={contextFor(entry)} />
```
Et dans l'en-tête de carte, à côté de la date (vers la ligne 120), ajouter le badge température. Remplacer le `<span>` de date par ce bloc :
```tsx
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs text-green-700/60">{formatLogDate(entry, now)}</span>
                {formatSnapshotTemp(entry.weather) && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                    {formatSnapshotTemp(entry.weather)}
                  </span>
                )}
              </div>
```

- [ ] **Step 4 : Lancer pour vérifier le succès**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npx vitest run src/pages/JournalPage.test.tsx`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add src/pages/JournalPage.tsx src/pages/JournalPage.test.tsx
git commit -m "feat(journal): badge temperature et bandeau de contexte meteo sur les cartes"
```

---

## Task 8 : vérification finale complète

**Files:** aucun changement de code, sauf correctifs éventuels.

- [ ] **Step 1 : Suite de tests complète**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npm test`
Expected: PASS, tous les fichiers (≈ 92 tests existants + les nouveaux).

- [ ] **Step 2 : Build (type-check inclus, NE PAS sauter)**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npm run build`
Expected: build OK, zéro erreur TypeScript. (`npm test` ne fait PAS le type-check : ce build est obligatoire.)

- [ ] **Step 3 : Lint**

Run: `cd /Users/mathieugiroux/PROJETS-IA/mon-potager && npm run lint`
Expected: zéro erreur. Corriger toute variable inutilisée (ex : la ligne `ONE_HOT` de la Task 3 si elle a été conservée par erreur).

- [ ] **Step 4 : Commit de clôture si des correctifs ont été nécessaires**

```bash
cd /Users/mathieugiroux/PROJETS-IA/mon-potager
git add -A
git commit -m "fix(meteo): corrections de verification finale (build/lint)"
```
(Sauter si rien à corriger.)

---

## Notes transverses

- **Dégradation propre hors-ligne** : `fetchTodaySnapshot` et `fetchDailyHistory` renvoient `null` sans lever. Sans réseau, l'entrée est sauvée sans `weather`, et le journal s'affiche sans bandeau. Aucun chemin bloquant.
- **Un seul appel réseau pour le journal** : le cache mémoire de `weatherService` garantit que les N cartes partagent un seul `fetchDailyHistory`. Le `JournalPage` ne déclenche qu'un appel via `useEffect`.
- **Pas de migration Dexie** : tous les champs (`weather`, etc.) existent depuis le palier 4a.
- **Snapshot manuel** (`source: 'manuel'`) : prévu par le type mais non saisissable dans ce palier (YAGNI). Le type le supporte pour plus tard.
- **Preuve navigateur attendue après merge** : ajouter une observation aujourd'hui → vérifier le badge température sur la carte et le bandeau « Noté après … de forte chaleur … » sous l'observation, sur les vraies données (canicule réelle en cours à Champniers).
```
