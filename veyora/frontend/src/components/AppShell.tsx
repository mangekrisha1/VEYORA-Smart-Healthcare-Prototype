import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'
import { Drawer } from './ui'

const NAV: Record<string, { to: string; label: string; icon: string }[]> = {
  PATIENT: [
    { to: '/app', label: 'Overview', icon: '⌂' },
    { to: '/app/book', label: 'Book appointment', icon: '＋' },
    { to: '/app/health', label: 'Health logs', icon: '♥' },
    { to: '/app/my-appointments', label: 'My appointments', icon: '▤' },
    { to: '/app/reminders', label: 'Reminders', icon: '◷' },
  ],
  DOCTOR: [
    { to: '/app/doctor', label: 'Overview', icon: '⌂' },
    { to: '/app/appointments', label: 'Appointments', icon: '▤' },
    { to: '/app/consultations', label: 'Consultations', icon: '✓' },
  ],
  PROJECT_MANAGER: [
    { to: '/app/coordinator', label: 'Clinic overview', icon: '⌂' },
    { to: '/app/monitor', label: 'Appointment monitor', icon: '▤' },
    { to: '/app/risks', label: 'Risks & incidents', icon: '⚠' },
  ],
}

const ROLE_LABEL: Record<string, string> = {
  PATIENT: 'Patient',
  DOCTOR: 'Doctor',
  PROJECT_MANAGER: 'Clinic coordinator',
}

function Wordmark() {
  return (
    <span className="wordmark" aria-label="VEYORA">
      <span className="wordmark-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="26" height="26">
          <rect width="32" height="32" rx="9" fill="var(--accent)" />
          <path
            d="M9 11l7 12 7-12"
            stroke="#F7F8F5"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      VEYORA
    </span>
  )
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth()
  if (!user) return null

  return (
    <nav className="nav" aria-label="Primary">
      {(NAV[user.role] ?? []).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end
          onClick={onNavigate}
          className={({ isActive }) =>
            `nav-link ${isActive ? 'active' : ''}`
          }
        >
          <span className="nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  if (!user) return null

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError('')

    try {
      await logout()
      setMenuOpen(false)
      navigate('/login', { replace: true })
    } catch {
      setLogoutError('Unable to log out. Please try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  const initials = user.name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Sidebar">
        <div className="sidebar-brand"><Wordmark /></div>
        <NavList />
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-btn"
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            ☰
          </button>

          <div className="topbar-user">
            <span className="user-chip" title={user.email}>
              <span className="user-avatar" aria-hidden="true">
                {initials}
              </span>
              <span className="user-meta">
                <strong>{user.name}</strong>
                <small>{ROLE_LABEL[user.role] ?? user.role}</small>
              </span>
            </span>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={loggingOut}
              onClick={handleLogout}
            >
              {loggingOut ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        </header>

        <main className="content">
          {logoutError && <p role="alert">{logoutError}</p>}
          <Outlet />
        </main>
      </div>

      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Menu"
      >
        <div className="drawer-brand"><Wordmark /></div>
        <NavList onNavigate={() => setMenuOpen(false)} />
        <button
          type="button"
          className="btn btn-outline"
          style={{ marginTop: 16 }}
          disabled={loggingOut}
          onClick={handleLogout}
        >
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </Drawer>
    </div>
  )
}