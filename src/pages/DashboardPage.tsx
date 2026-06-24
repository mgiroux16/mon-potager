import { LayoutDashboard } from 'lucide-react'
import { PlaceholderPage } from './PlaceholderPage'

export function DashboardPage() {
  return (
    <PlaceholderPage
      title="Tableau de bord"
      subtitle="L'essentiel du jour, en un coup d'œil"
      icon={<LayoutDashboard className="size-5" />}
      todo="Palier 5 : litres de la semaine, réserve d'eau et autonomie. Palier 7 : le « à faire aujourd'hui »."
    />
  )
}
