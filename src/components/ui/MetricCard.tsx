import type { ReactNode } from 'react'
import { TONE_STYLES, type Tone } from './tones'

export function MetricCard({
  label,
  value,
  sub,
  icon,
  tone = 'marque',
}: {
  label: string
  value: string
  sub?: string
  icon?: ReactNode
  tone?: Tone
}) {
  const s = TONE_STYLES[tone]
  return (
    <div className={`flex flex-col gap-1 rounded-xl border ${s.border} ${s.bg} p-3`}>
      <div className={`flex items-center gap-1.5 text-caption ${s.label}`}>
        {icon && <span className={s.icon}>{icon}</span>}
        {label}
      </div>
      <span className={`text-lg font-semibold leading-none ${s.value}`}>{value}</span>
      {sub && <span className={`text-caption ${s.label}`}>{sub}</span>}
    </div>
  )
}
