import { NavLink, Outlet } from 'react-router-dom'
import {
  Droplets,
  LayoutDashboard,
  Menu,
  NotebookPen,
  Plus,
  Settings,
  Sprout,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { VoiceCapture } from './VoiceCapture'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  /** L'item central, mis en avant pour la saisie rapide. */
  primary?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Accueil', icon: LayoutDashboard },
  { to: '/journal', label: 'Journal', icon: NotebookPen },
  { to: '/ajouter', label: 'Ajouter', icon: Plus, primary: true },
  { to: '/jardin', label: 'Jardin', icon: Sprout },
  { to: '/eau', label: 'Eau', icon: Droplets },
  { to: '/plus', label: 'Plus', icon: Menu },
]

export function Layout() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-green-50 lg:max-w-6xl">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-green-100 bg-green-50/90 px-4 py-3 backdrop-blur lg:px-8 lg:py-4">
        <div className="flex items-center gap-2">
          <Sprout className="size-5 text-green-700 lg:size-6" />
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-green-900 lg:text-lg">Mon Potager</span>
            <span className="hidden text-sm text-green-700/60 lg:inline">
              le potager au quotidien
            </span>
          </div>
        </div>
        <NavLink
          to="/reglages"
          className="rounded-lg p-2 text-green-700 transition-colors hover:bg-green-100"
          aria-label="Réglages"
        >
          <Settings className="size-5" />
        </NavLink>
      </header>

      <main className="flex-1 px-4 py-5 pb-24 lg:px-8 lg:py-8">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-green-100 bg-white/95 backdrop-blur lg:max-w-6xl">
        <ul className="flex items-end justify-around px-2 py-1.5 lg:justify-center lg:gap-12">
          {NAV_ITEMS.map(({ to, label, icon: Icon, primary }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  [
                    'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    primary
                      ? 'text-white'
                      : isActive
                        ? 'text-green-700'
                        : 'text-green-700/50 hover:text-green-700',
                  ].join(' ')
                }
              >
                {({ isActive }) =>
                  primary ? (
                    <>
                      <span className="grid size-11 -translate-y-3 place-items-center rounded-full bg-green-600 shadow-lg shadow-green-600/30 ring-4 ring-white">
                        <Icon className="size-6 text-white" />
                      </span>
                      <span className="-mt-2 text-green-700">{label}</span>
                    </>
                  ) : (
                    <>
                      <Icon
                        className={`size-5 ${isActive ? 'text-green-700' : ''}`}
                      />
                      <span>{label}</span>
                    </>
                  )
                }
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <VoiceCapture />
    </div>
  )
}
