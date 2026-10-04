import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, setCsrfToken } from '../lib/api'
import type { User } from '../lib/types'

interface AuthState {
  user: User | null
  demoMode: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  demoLogin: (email: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ user: User | null; csrf_token?: string; demo_mode?: boolean }>(
      '/api/auth/me',
    )
      .then((data) => {
        setDemoMode(Boolean(data.demo_mode))
        if (data.user) {
          setCsrfToken(data.csrf_token ?? null)
          setUser(data.user)
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ user: User; csrf_token: string; demo_mode: boolean }>(
      '/api/auth/login', { method: 'POST', body: { email, password } })
    setCsrfToken(data.csrf_token)
    setDemoMode(data.demo_mode)
    setUser(data.user)
  }, [])

  const demoLogin = useCallback(async (email: string) => {
    const data = await api<{ user: User; csrf_token: string }>(
      '/api/auth/demo-login', { method: 'POST', body: { email } })
    setCsrfToken(data.csrf_token)
    setUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }) } catch { /* noop */ }
    setCsrfToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, demoMode, loading, login, demoLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function roleHome(role: string): string {
  switch (role) {
    case 'PATIENT': return '/app'
    case 'DOCTOR': return '/app/appointments'
    case 'PROJECT_MANAGER': return '/app/risks'
    default: return '/login'
  }
}
