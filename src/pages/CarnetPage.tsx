import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

const TABS = [
  { to: '/carnet/journal', label: 'Journal' },
  { to: '/carnet/diagnostics', label: 'Diagnostics' },
  { to: '/carnet/assistant', label: 'Assistant' },
]

export function CarnetPage() {
  const navigate = useNavigate()

  useEffect(() => {
    if (window.location.hash === '#/carnet' || window.location.hash === '#/carnet/') {
      navigate('/carnet/journal', { replace: true })
    }
  }, [navigate])

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex gap-1 border-b border-green-100 pb-0">
        {TABS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-green-700/50 hover:text-green-700',
              ].join(' ')
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
