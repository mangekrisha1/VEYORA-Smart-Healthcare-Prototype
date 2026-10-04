import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { api, ApiError } from '../../lib/api'
import { formatLogDate, formatLogTime, logLabel, logValueText } from '../../lib/format'
import type { HealthLog, LogType } from '../../lib/types'
import { Button, Card, Field, Modal } from '../../components/ui'
import { useToast } from '../../state/ToastContext'

/** Technical input limits — mirrored from the backend. These are input
 *  constraints only; VEYORA never labels readings safe/dangerous. */
const LIMITS: Record<LogType, Record<string, number>> = {
  HEART_RATE: { min: 20, max: 250 },
  TEMPERATURE: { min: 30, max: 45 },
  BLOOD_PRESSURE: { sysMin: 50, sysMax: 300, diaMin: 30, diaMax: 200 },
}

function Sparkline({ logs, type }: { logs: HealthLog[]; type: LogType }) {
  const points = useMemo(() => {
    const series = logs
      .filter((l) => l.type === type)
      .slice()
      .sort((a, b) => a.taken_at.localeCompare(b.taken_at))
    if (series.length < 2) return null
    const val = (l: HealthLog) =>
      type === 'BLOOD_PRESSURE' ? (l.systolic ?? 0) : (l.value ?? 0)
    const vals = series.map(val)
    const min = Math.min(...vals), max = Math.max(...vals)
    const span = max - min || 1
    const W = 560, H = 120, PAD = 12
    const step = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0
    const coords = series.map((l, i) => {
      const x = PAD + i * step
      const y = H - PAD - ((val(l) - min) / span) * (H - PAD * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    return { coords: coords.join(' '), min, max, count: series.length }
  }, [logs, type])

  if (!points) {
    return <p className="empty-note">Add at least two readings to see a trend.</p>
  }
  return (
    <div>
      <svg viewBox="0 0 560 120" className="sparkline" role="img"
           aria-label={`Trend of ${points.count} ${logLabel(type)} readings, from ${points.min} to ${points.max}`}>
        <polyline points={points.coords} fill="none" stroke="var(--accent)"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="field-hint">
        {points.count} readings · min {points.min} · max {points.max}
      </p>
    </div>
  )
}

export default function HealthLogs() {
  const reduced = useReducedMotion()
  const { toast } = useToast()
  const [logs, setLogs] = useState<HealthLog[]>([])
  const [filter, setFilter] = useState<LogType | 'ALL'>('ALL')
  const [type, setType] = useState<LogType>('HEART_RATE')
  const [value, setValue] = useState('')
  const [systolic, setSystolic] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState<HealthLog | null>(null)

  const load = async () => {
    const qs = filter !== 'ALL' ? `?type=${filter}` : ''
    const data = await api<{ logs: HealthLog[] }>(`/api/health-logs${qs}`)
    setLogs(data.logs)
  }
  useEffect(() => { load().catch(() => undefined) }, [filter])

  const validateLocal = (): string | null => {
    if (type !== 'BLOOD_PRESSURE') {
      const n = Number(value)
      if (value.trim() === '' || Number.isNaN(n)) return 'Enter a number.'
      const { min, max } = LIMITS[type]
      if (n < min || n > max) {
        const unit = type === 'HEART_RATE' ? 'bpm' : '°C'
        return `Value must be between ${min} and ${max} ${unit} (input limit).`
      }
      if (type === 'HEART_RATE' && !Number.isInteger(n)) return 'Whole bpm only.'
    } else {
      const s = Number(systolic), d = Number(diastolic)
      if (!Number.isInteger(s) || !Number.isInteger(d)) return 'Enter whole numbers for both fields.'
      if (s < 50 || s > 300) return 'Systolic must be 50–300 mmHg (input limit).'
      if (d < 30 || d > 200) return 'Diastolic must be 30–200 mmHg (input limit).'
      if (s < d) return 'Systolic cannot be lower than diastolic.'
    }
    return null
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const localErr = validateLocal()
    if (localErr) { setError(localErr); return }
    setBusy(true)
    try {
      const body: Record<string, unknown> = { type, note: note.trim() || undefined }
      if (type === 'BLOOD_PRESSURE') {
        body.systolic = Number(systolic); body.diastolic = Number(diastolic)
      } else {
        body.value = Number(value)
      }
      await api('/api/health-logs', { method: 'POST', body })
      setValue(''); setSystolic(''); setDiastolic(''); setNote('')
      toast('Reading saved.', 'success')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the reading.')
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      await api(`/api/health-logs/${toDelete.id}`, { method: 'DELETE' })
      toast('Reading deleted.', 'success')
      setToDelete(null)
      await load()
    } catch {
      setError('Could not delete that record.')
    }
  }

  return (
    <motion.div initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <div className="page-head">
        <div>
          <h1>Health logs</h1>
          <p className="page-sub">
            Only you can see these records. Input limits are technical
            constraints — VEYORA does not interpret readings or give medical advice.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <Card title="Add a reading">
          <form onSubmit={submit}>
            <Field label="Reading type" htmlFor="log-type">
              <select id="log-type" className="input" value={type}
                      onChange={(e) => { setType(e.target.value as LogType); setError(null) }}>
                <option value="HEART_RATE">Heart rate (bpm)</option>
                <option value="TEMPERATURE">Temperature (°C)</option>
                <option value="BLOOD_PRESSURE">Blood pressure (mmHg)</option>
              </select>
            </Field>

            {type !== 'BLOOD_PRESSURE' ? (
              <Field label={type === 'HEART_RATE' ? 'Heart rate (bpm)' : 'Temperature (°C)'}
                     htmlFor="log-value"
                     hint={type === 'HEART_RATE' ? 'Accepted range: 20–250 bpm'
                                                  : 'Accepted range: 30–45 °C'}>
                <input id="log-value" className="input" inputMode="decimal"
                       value={value} onChange={(e) => setValue(e.target.value)} />
              </Field>
            ) : (
              <div className="bp-row">
                <Field label="Systolic (mmHg)" htmlFor="log-sys" hint="50–300">
                  <input id="log-sys" className="input" inputMode="numeric"
                         value={systolic} onChange={(e) => setSystolic(e.target.value)} />
                </Field>
                <Field label="Diastolic (mmHg)" htmlFor="log-dia" hint="30–200">
                  <input id="log-dia" className="input" inputMode="numeric"
                         value={diastolic} onChange={(e) => setDiastolic(e.target.value)} />
                </Field>
              </div>
            )}

            <Field label="Note (optional)" htmlFor="log-note">
              <input id="log-note" className="input" maxLength={280}
                     placeholder="e.g. after morning walk"
                     value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {error && <p className="form-error" role="alert">{error}</p>}
            <Button type="submit" loading={busy}>Save reading</Button>
          </form>
        </Card>

        <Card title="Trend">
          <Sparkline logs={logs} type={filter === 'ALL' ? type : filter} />
        </Card>
      </div>

      <Card title="Your readings" className="mt-16"
            action={
              <div className="chip-row" role="group" aria-label="Filter readings">
                {(['ALL', 'HEART_RATE', 'TEMPERATURE', 'BLOOD_PRESSURE'] as const).map((f) => (
                  <button key={f} className={`chip ${filter === f ? 'chip-on' : ''}`}
                          onClick={() => setFilter(f)}>
                    {f === 'ALL' ? 'All' : logLabel(f)}
                  </button>
                ))}
              </div>
            }>
        {logs.length === 0 ? (
          <p className="empty-note">No readings recorded yet.</p>
        ) : (
          <div className="table-wrap" role="region" tabIndex={0} aria-label="Health readings">
            <table className="table">
              <thead>
                <tr><th>Reading</th><th>Value</th><th>When (IST)</th><th>Note</th><th /></tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td><span className="type-label">{logLabel(l.type)}</span></td>
                    <td><strong>{logValueText(l)}</strong></td>
                    <td>{formatLogDate(l.taken_at)} · {formatLogTime(l.taken_at)}</td>
                    <td>{l.note ?? '—'}</td>
                    <td className="row-actions">
                      <Button size="sm" variant="ghost"
                              aria-label={`Delete ${logLabel(l.type)} reading from ${formatLogDate(l.taken_at)}`}
                              onClick={() => setToDelete(l)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={toDelete !== null} onClose={() => setToDelete(null)} title="Delete reading?">
        {toDelete && (
          <>
            <p>
              Remove {logLabel(toDelete.type).toLowerCase()} — {logValueText(toDelete)} —
              recorded {formatLogDate(toDelete.taken_at)}? This cannot be undone.
            </p>
            <div className="step-actions">
              <Button variant="ghost" onClick={() => setToDelete(null)}>Keep it</Button>
              <Button variant="danger" onClick={confirmDelete}>Delete</Button>
            </div>
          </>
        )}
      </Modal>
    </motion.div>
  )
}
