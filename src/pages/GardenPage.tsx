import { Sprout } from 'lucide-react'
import { PlaceholderPage } from './PlaceholderPage'

export function GardenPage() {
  return (
    <PlaceholderPage
      title="Jardin"
      subtitle="Parcelles, cultures, oyas et arbres fruitiers"
      icon={<Sprout className="size-5" />}
      todo="Palier 2 : le vrai jardin de Champniers chargé (100 m², tomates, oyas, verger)."
    />
  )
}
