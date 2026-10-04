import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ApiError } from '../lib/api'
import { useAuth } from '../state/AuthContext'
import { Button, Field } from '../components/ui'

const DEMO_ACCOUNTS = [
  { label: 'Patient — Aarav Shah', email: 'aarav.shah@veyora.demo' },
  { label: 'Doctor — Dr. Meera Iyer', email: 'meera.iyer@veyora.demo' },
  { label: 'Project manager — Krisha Mange', email: 'krisha.mange@veyora.demo' },
]

export default function Login() {
  const { login, demoLogin, demoMode } = useAuth()
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    try {
      await login(email.trim(), password)
      navigate('/app')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const quickDemo = async (demoEmail: string) => {
    setError(null)
    setBusy(true)
    try {
      await demoLogin(demoEmail)
      navigate('/app')
    } catch {
      setError('Demo sign-in is not available right now.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <motion.div
        className="login-card"
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Link to="/" className="login-back" aria-label="Back to home">← veyora.health</Link>
        <span className="wordmark login-brand" aria-label="VEYORA">
          <span className="wordmark-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="30" height="30">
              <rect width="32" height="32" rx="9" fill="var(--accent)" />
              <path d="M9 11l7 12 7-12" stroke="#F7F8F5" strokeWidth="3"
                    fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          VEYORA
        </span>
        <h1 className="login-title">Welcome back</h1>
        <p className="login-sub">Sign in to your care workspace.</p>

        <form onSubmit={submit} noValidate>
          <Field label="Email" htmlFor="email"
                 error={error && !email ? 'Email is required.' : undefined}>
            <input id="email" type="email" autoComplete="email"
                   className="input" value={email}
                   onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="password">
            <input id="password" type="password" autoComplete="current-password"
                   className="input" value={password}
                   onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" size="lg" loading={busy} className="login-submit">
            Sign in
          </Button>
        </form>

        {demoMode && (
          <div className="demo-box">
            <p className="demo-title">Local demo mode — one-click sign-in</p>
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} className="demo-btn" disabled={busy}
                      onClick={() => quickDemo(a.email)}>
                {a.label}
              </button>
            ))}
            <p className="demo-hint">
              These shortcuts authenticate against the real backend and are only
              active when the server runs with demo mode explicitly enabled.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  )
}
