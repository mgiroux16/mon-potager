export type Tone = 'marque' | 'eau' | 'recolte' | 'argent' | 'alerte'

interface ToneStyle {
  bg: string
  border: string
  icon: string
  label: string
  value: string
}

/**
 * Styles par ton sémantique. value/label utilisent des nuances 700+ : seules
 * celles-ci passent le contraste AA (4.5:1) en texte, mesuré sur fond blanc/-50.
 */
export const TONE_STYLES: Record<Tone, ToneStyle> = {
  marque: {
    bg: 'bg-marque-50',
    border: 'border-marque-100',
    icon: 'text-marque-600',
    label: 'text-marque-700',
    value: 'text-marque-800',
  },
  eau: {
    bg: 'bg-eau-50',
    border: 'border-eau-100',
    icon: 'text-eau-600',
    label: 'text-eau-700',
    value: 'text-eau-800',
  },
  recolte: {
    bg: 'bg-recolte-50',
    border: 'border-recolte-100',
    icon: 'text-recolte-600',
    label: 'text-recolte-700',
    value: 'text-recolte-800',
  },
  argent: {
    bg: 'bg-argent-50',
    border: 'border-argent-100',
    icon: 'text-argent-600',
    label: 'text-argent-700',
    value: 'text-argent-900',
  },
  alerte: {
    bg: 'bg-alerte-50',
    border: 'border-alerte-100',
    icon: 'text-alerte-600',
    label: 'text-alerte-700',
    value: 'text-alerte-800',
  },
}
