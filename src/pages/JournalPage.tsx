import { NotebookPen } from 'lucide-react'
import { PlaceholderPage } from './PlaceholderPage'

export function JournalPage() {
  return (
    <PlaceholderPage
      title="Journal"
      subtitle="La source unique : tout ce qui se passe au potager"
      icon={<NotebookPen className="size-5" />}
      todo="Palier 4 : historique filtrable de toutes les entrées (arrosages, oyas, récoltes, observations…)."
    />
  )
}
