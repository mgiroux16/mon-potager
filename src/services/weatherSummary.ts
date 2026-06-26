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
