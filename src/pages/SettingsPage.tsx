import { Settings } from 'lucide-react'
import { PlaceholderPage } from './PlaceholderPage'

export function SettingsPage() {
  return (
    <PlaceholderPage
      title="Réglages"
      subtitle="Seuils, localisation, sauvegarde"
      icon={<Settings className="size-5" />}
      todo="Paliers suivants : seuils du moteur de reco, débit d'arrosage, capacité des cuves, export/import JSON."
    />
  )
}
