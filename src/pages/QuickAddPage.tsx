import { Plus } from 'lucide-react'
import { PlaceholderPage } from './PlaceholderPage'

export function QuickAddPage() {
  return (
    <PlaceholderPage
      title="Saisie rapide"
      subtitle="Noter une action en quelques secondes"
      icon={<Plus className="size-5" />}
      todo="Palier 3 : arrosage / remplissage d'oya / récolte en deux ou trois gestes."
    />
  )
}
