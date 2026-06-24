import { Droplets } from 'lucide-react'
import { PlaceholderPage } from './PlaceholderPage'

export function WaterPage() {
  return (
    <PlaceholderPage
      title="Réserve d'eau"
      subtitle="Niveau des 5 cuves (~2500 L) et autonomie"
      icon={<Droplets className="size-5" />}
      todo="Palier 5 : niveau des cuves et projection d'autonomie en jours selon la consommation et la pluie prévue."
    />
  )
}
