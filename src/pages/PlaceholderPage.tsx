import type { ReactNode } from 'react'

type Props = {
  title: string
  subtitle: string
  icon: ReactNode
  /** Ce que ce palier remplira plus tard, affiché en attendant. */
  todo?: string
}

/**
 * Écran vide réutilisé par tous les onglets pendant le palier Socle.
 * Chaque palier suivant remplacera ces placeholders par le vrai contenu.
 */
export function PlaceholderPage({ title, subtitle, icon, todo }: Props) {
  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-green-100 text-green-700">
          {icon}
        </span>
        <div>
          <h1 className="text-xl font-semibold text-green-950">{title}</h1>
          <p className="text-sm text-green-700/70">{subtitle}</p>
        </div>
      </header>

      <div className="rounded-2xl border border-dashed border-green-300 bg-white/60 p-6 text-center">
        <p className="text-sm font-medium text-green-800">Écran en construction</p>
        {todo && (
          <p className="mt-1 text-sm text-green-700/70">{todo}</p>
        )}
      </div>
    </section>
  )
}
