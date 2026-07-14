import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  Plus,
  Settings,
  Sprout,
  Sun,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { VoiceCapture } from './VoiceCapture'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  primary?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Aujourd\'hui', icon: Sun },
  { to: '/carnet', label: 'Carnet', icon: BookOpen },
  { to: '/ajouter', label: 'Ajouter', icon: Plus, primary: true },
  { to: '/jardin', label: 'Jardin', icon: Sprout },
  { to: '/pilotage', label: 'Pilotage', icon: BarChart3 },
]

function NavItemLink({ to, label, icon: Icon, primary }: NavItem) {
  return (
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
              : 'text-gray-500 hover:text-green-700',
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
            <Icon className={`size-5 ${isActive ? 'text-green-700' : ''}`} />
            <span>{label}</span>
          </>
        )
      }
    </NavLink>
  )
}

function SidebarNavItem({ to, label, icon: Icon }: NavItem) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-green-100 text-green-800'
            : 'text-gray-500 hover:bg-green-50 hover:text-green-800',
        ].join(' ')
      }
    >
      <Icon className="size-5 shrink-0" />
      <span>{label}</span>
    </NavLink>
  )
}

export function Layout() {
  const mainItems = NAV_ITEMS.filter((i) => !i.primary)
  const addItem = NAV_ITEMS.find((i) => i.primary)!

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-green-50 lg:max-w-none lg:flex-row">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex lg:w-56 lg:shrink-0 lg:flex-col lg:border-r lg:border-green-100 lg:bg-white">
        <div className="flex items-center gap-2 border-b border-green-100 px-4 py-4">
          <Sprout className="size-5 text-green-700" />
          <span className="font-semibold text-green-900">Mon Potager</span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {mainItems.slice(0, 2).map((item) => (
            <SidebarNavItem key={item.to} {...item} />
          ))}
          <NavLink
            to={addItem.to}
            className="mt-2 flex items-center gap-3 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            <Plus className="size-5 shrink-0" />
            <span>Ajouter</span>
          </NavLink>
          {mainItems.slice(2).map((item) => (
            <SidebarNavItem key={item.to} {...item} />
          ))}
        </nav>
        <div className="mt-auto border-t border-green-100 p-3">
          <NavLink
            to="/reglages"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-green-50 hover:text-green-800"
          >
            <Settings className="size-5 shrink-0" />
            <span>Réglages</span>
          </NavLink>
        </div>
      </aside>

      {/* Colonne principale */}
      <div className="flex flex-1 flex-col">
        {/* Header mobile */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-green-100 bg-green-50/90 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <Sprout className="size-5 text-green-700" />
            <span className="font-semibold text-green-900">Mon Potager</span>
          </div>
          <NavLink
            to="/reglages"
            className="rounded-lg p-2 text-green-700 transition-colors hover:bg-green-100"
            aria-label="Réglages"
          >
            <Settings className="size-5" />
          </NavLink>
        </header>

        <main className="flex-1 px-4 py-5 pb-24 lg:px-8 lg:py-8 lg:pb-8">
          <div className="mx-auto max-w-3xl">
            <Outlet />
          </div>
        </main>

        {/* Barre du bas mobile */}
        <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md border-t border-green-100 bg-white/95 backdrop-blur lg:hidden">
          <ul className="flex items-end justify-around px-2 py-1.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavItemLink {...item} />
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <VoiceCapture />
    </div>
  )
}
