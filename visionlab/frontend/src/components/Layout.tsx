import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  Eye,
  Upload,
  History,
  BarChart2,
  BookOpen,
  ShieldCheck,
  LogOut,
  X,
  Menu,
  Settings,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'
import clsx from 'clsx'

const navItems = [
  { to: '/dashboard', label: 'Dashboard',     icon: BarChart2 },
  { to: '/analyse',   label: 'Analyse Image', icon: Upload    },
  { to: '/history',   label: 'History',       icon: History   },
  { to: '/progress',  label: 'My Progress',   icon: BookOpen  },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const { committed } = useSettings()
  const navigate = useNavigate()

  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const isCollapsed = committed.sidebar === 'collapsed'
  const isCompact = committed.density === 'compact'
  const isWideContent = (committed.content_width ?? 'wide') === 'wide'

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="h-screen flex bg-paper text-ink font-sans">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-ink/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-line bg-paper-raised flex flex-col',
          'transition-transform duration-200 ease-out lg:static lg:z-10 lg:translate-x-0',
          isCollapsed ? 'lg:w-[4.5rem]' : 'lg:w-64',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Main navigation"
      >
        <div className="px-5 py-5 border-b border-line">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Eye className="w-5 h-5 text-accent shrink-0" aria-hidden="true" />
              <div className={clsx('min-w-0', isCollapsed && 'lg:hidden')}>
                <p className="font-display font-semibold text-ink leading-tight tracking-tight text-[16px]">
                  VisionLab
                </p>
                <p className="text-[11px] text-ink-muted mt-0.5">Smart Visual Analytics</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden w-9 h-9 rounded flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper transition-colors shrink-0"
              aria-label="Close navigation menu"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="px-4 pt-4">
          <div className={clsx('flex items-center gap-2.5 pb-3 border-b border-line', isCollapsed && 'lg:justify-center')}>
            <div className="w-7 h-7 rounded-full bg-accent-subtle border border-accent text-accent text-xs font-mono font-semibold flex items-center justify-center shrink-0">
              {user?.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className={clsx('min-w-0', isCollapsed && 'lg:hidden')}>
              <p className="text-sm font-medium text-ink truncate leading-tight">{user?.username}</p>
              <p className="text-[11px] text-ink-faint truncate mt-0.5 font-mono">{user?.email}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 pt-4 space-y-0.5" aria-label="Site navigation">
          <p className={clsx('pb-2 text-[10px] uppercase tracking-wider text-ink-faint font-semibold', isCollapsed && 'lg:hidden')}>
            Workspace
          </p>

          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileNavOpen(false)}
              title={isCollapsed ? label : undefined}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 text-sm font-medium rounded transition-colors duration-150 border-l-2',
                  isCompact ? 'px-2.5 py-1.5' : 'px-2.5 py-2',
                  isCollapsed && 'lg:justify-center',
                  isActive
                    ? 'text-accent bg-accent-subtle border-accent'
                    : 'border-transparent text-ink-muted hover:text-ink hover:bg-paper'
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className={clsx(isCollapsed && 'lg:hidden')}>{label}</span>
            </NavLink>
          ))}

          {user?.role === 'admin' && (
            <NavLink
              to="/admin"
              onClick={() => setMobileNavOpen(false)}
              title={isCollapsed ? 'Admin' : undefined}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 text-sm font-medium rounded transition-colors duration-150 border-l-2',
                  isCompact ? 'px-2.5 py-1.5' : 'px-2.5 py-2',
                  isCollapsed && 'lg:justify-center',
                  isActive
                    ? 'text-accent bg-accent-subtle border-accent'
                    : 'border-transparent text-ink-muted hover:text-ink hover:bg-paper'
                )
              }
            >
              <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className={clsx(isCollapsed && 'lg:hidden')}>Admin</span>
            </NavLink>
          )}
        </nav>

        <div className="px-4 pb-4 pt-3 border-t border-line space-y-1">
          <NavLink
            to="/settings"
            title={isCollapsed ? 'UI Settings' : undefined}
            className={({ isActive }) =>
              clsx(
                'w-full flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium rounded transition-colors duration-150',
                isCollapsed && 'lg:justify-center',
                isActive ? 'text-accent bg-accent-subtle' : 'text-ink-muted hover:text-ink hover:bg-paper',
              )
            }
            aria-label="Open UI settings"
          >
            <Settings className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className={clsx(isCollapsed && 'lg:hidden')}>UI Settings</span>
          </NavLink>

          <button
            onClick={handleLogout}
            title={isCollapsed ? 'Log Out' : undefined}
            className={clsx(
              'w-full flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium text-ink-muted rounded hover:text-negative hover:bg-negative-subtle transition-colors duration-150',
              isCollapsed && 'lg:justify-center',
            )}
            aria-label="Log out"
          >
            <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className={clsx(isCollapsed && 'lg:hidden')}>Log Out</span>
          </button>
        </div>
      </aside>

      <main id="main-content" className="relative z-10 flex-1 min-w-0 overflow-hidden flex flex-col" tabIndex={-1}>
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-line bg-paper-raised shrink-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="w-9 h-9 -ml-1 rounded flex items-center justify-center text-ink-muted hover:text-ink hover:bg-paper transition-colors shrink-0"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
            <p className="font-display font-semibold text-ink text-sm truncate">VisionLab</p>
          </div>
        </div>

        <div className={clsx('flex-1 min-h-0 overflow-y-auto', isCompact ? 'p-4 md:p-5' : 'p-6 md:p-8')}>
          {isWideContent ? (
            <Outlet />
          ) : (
            <div className="max-w-[1400px] mx-auto">
              <Outlet />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
