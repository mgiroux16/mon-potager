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
