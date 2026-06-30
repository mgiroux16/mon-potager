import type { ReactNode } from 'react'

export function HeroCard({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-title-screen text-green-950">
          {icon}
          {title}
        </h1>
        {action}
      </div>
      {children}
    </section>
  )
}
