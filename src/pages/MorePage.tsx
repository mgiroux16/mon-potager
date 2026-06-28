import { Link } from 'react-router-dom'
import {
  CalendarDays,
  Euro,
  Map,
  Sprout,
  Stethoscope,
  Wheat,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type MoreLink = {
  to: string
  label: string
  description: string
  icon: LucideIcon
}

const LINKS: MoreLink[] = [
  {
    to: '/jardin/carte',
    label: 'Carte du jardin',
    description: 'Vue d’ensemble des parcelles sur le terrain',
    icon: Map,
  },
  {
    to: '/recoltes',
    label: 'Récoltes',
    description: 'Bilan des pesées par culture',
    icon: Wheat,
  },
  {
    to: '/bilan',
    label: 'Bilan de saison',
    description: 'Rendements, dépenses et notes par culture/parcelle',
    icon: Euro,
  },
  {
    to: '/calendrier',
    label: 'Calendrier',
    description: 'Semis, plantations et récoltes du catalogue, mois par mois',
    icon: CalendarDays,
  },
  {
    to: '/diagnostics',
    label: 'Diagnostics',
    description: 'Hypothèses IA sur les problèmes signalés',
    icon: Stethoscope,
  },
  {
    to: '/jardin',
    label: 'Jardin & verger',
    description: 'Parcelles, cultures et arbres fruitiers',
    icon: Sprout,
  },
]

export function MorePage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-green-900">Plus</h1>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map(({ to, label, description, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-start gap-3 rounded-lg border border-green-100 bg-white p-4 shadow-sm transition-colors hover:bg-green-50"
          >
            <Icon className="mt-0.5 size-5 shrink-0 text-green-700" />
            <span>
              <span className="block font-medium text-green-900">{label}</span>
              <span className="block text-sm text-green-700/70">{description}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
