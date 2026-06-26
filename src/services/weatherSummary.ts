import type { DailyWeather } from './weatherService'
import type { GardenLogEntry } from '../data/model'

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
