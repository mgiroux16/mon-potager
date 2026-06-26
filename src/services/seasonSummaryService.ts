import type { AppSettings } from '../data/model'

export interface SeasonBounds {
  start: string
  end: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function seasonBounds(year: number, settings: AppSettings): SeasonBounds {
  const startMonth = settings.seasonStartMonth
  const endMonth = settings.seasonEndMonth
  const lastDay = new Date(year, endMonth, 0).getDate()
  return {
    start: `${year}-${pad2(startMonth)}-01`,
    end: `${year}-${pad2(endMonth)}-${pad2(lastDay)}`,
  }
}
