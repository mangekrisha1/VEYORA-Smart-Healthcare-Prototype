/* Shared UI primitives: Button, Card, Field, Modal, Drawer, badges, tables. */
import { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

/* ----------------------------- Button ---------------------------------- */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading, children,
                         disabled, className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  )
}

/* ------------------------------ Card ----------------------------------- */

export function Card({ title, action, children, className = '', padded = true }: {
  title?: React.ReactNode; action?: React.ReactNode;
  children: React.ReactNode; className?: string; padded?: boolean
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          {title && <h3 className="card-title">{title}</h3>}
          {action}
        </header>
      )}
      <div className={padded ? 'card-body' : ''}>{children}</div>
    </section>
  )
}

/* ------------------------------ Field ---------------------------------- */

export function Field({ label, error, hint, children, htmlFor }: {
  label: string; error?: string; hint?: string;
  children: React.ReactNode; htmlFor?: string
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  )
}

/* ------------------------------ Modal ---------------------------------- */

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; wide?: boolean
}) {
  const reduced = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            ref={panelRef}
            role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
            className={`modal ${wide ? 'modal-wide' : ''}`}
            initial={{ opacity: 0, y: reduced ? 0 : 14, scale: reduced ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduced ? 0 : 8, scale: reduced ? 1 : 0.99 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
          >
            <header className="modal-head">
              <h3>{title}</h3>
              <button className="icon-btn" onClick={onClose} aria-label="Close dialog">✕</button>
            </header>
            <div className="modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------ Drawer --------------------------------- */

export function Drawer({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  const reduced = useReducedMotion()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.aside
            role="dialog" aria-modal="true" aria-label={title}
            className="drawer"
            initial={{ x: reduced ? 0 : 40, opacity: reduced ? 1 : 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: reduced ? 0 : 40, opacity: reduced ? 1 : 0 }}
            transition={{ duration: reduced ? 0 : 0.22 }}
          >
            <header className="drawer-head">
              <h3>{title}</h3>
              <button className="icon-btn" onClick={onClose} aria-label="Close panel">✕</button>
            </header>
            <div className="drawer-body">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* --------------------------- Status badge ------------------------------ */

const BADGE_TONES: Record<string, string> = {
  CONFIRMED: 'ok', COMPLETED: 'info', CANCELLED: 'neutral',
  OPEN: 'warn', CLOSED: 'neutral',
  PENDING: 'neutral', PASS: 'ok', FAIL: 'danger',
  Low: 'ok', Moderate: 'warn', Medium: 'warn', High: 'high', Critical: 'critical',
  Planned: 'neutral', Implemented: 'info', Verified: 'ok',
  'In progress': 'info', Done: 'ok',
  TODO: 'neutral', IN_PROGRESS: 'info', DONE: 'ok',
}

export function StatusBadge({
  value,
  prefix,
}: {
  value?: string | null
  prefix?: string
}) {
  const safeValue =
    typeof value === 'string' && value.trim()
      ? value.trim()
      : 'UNKNOWN'

  const tone = BADGE_TONES[safeValue] ?? 'neutral'

  const label = safeValue
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character: string) => character.toUpperCase())

  return (
    <span className={`badge badge-${tone}`}>
      {prefix ? `${prefix} ` : ''}
      {label}
    </span>
  )
}

/* ---------------------------- Data table -------------------------------- */

export function DataTable({ columns, rows, empty }: {
  columns: { key: string; label: string; align?: 'right' }[]
  rows: Record<string, React.ReactNode>[]
  empty?: string
}) {
  if (rows.length === 0 && empty) return <p className="empty-note">{empty}</p>
  return (
    <div className="table-wrap" role="region" tabIndex={0} aria-label="Data table">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col"
                  style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key}
                    style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {body && <p className="empty-body">{body}</p>}
    </div>
  )
}
