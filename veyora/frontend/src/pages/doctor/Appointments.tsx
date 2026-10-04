import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { api, ApiError } from '../../lib/api'
import { formatApptDate, formatTime12 } from '../../lib/format'
import type { Appointment, AppointmentStatus } from '../../lib/types'
import {
  Button,
  Card,
  EmptyState,
  Field,
  StatusBadge,
} from '../../components/ui'
import { useToast } from '../../state/ToastContext'

type Mode = 'overview' | 'appointments' | 'consultations'
type Action = 'START' | 'SAVE' | 'COMPLETE' | 'CANCEL'

const COPY: Record<Mode, { title: string; subtitle: string }> = {
  overview: {
    title: 'Doctor overview',
    subtitle: 'Your daily schedule and consultation activity.',
  },
  appointments: {
    title: 'Appointments',
    subtitle: 'Search and manage appointments assigned to you.',
  },
  consultations: {
    title: 'Consultations',
    subtitle: 'Continue started visits and review completed summaries.',
  },
}

function istDate(timestamp: number) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${value('year')}-${value('month')}-${value('day')}`
}

function appointmentTime(appointment: Appointment) {
  return new Date(
    `${appointment.date}T${appointment.start_time}:00+05:30`,
  ).getTime()
}

export default function DoctorAppointments({
  mode = 'appointments',
}: {
  mode?: Mode
}) {
  const reduced = useReducedMotion()
  const { toast } = useToast()

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [now, setNow] = useState(Date.now())

  const [status, setStatus] = useState<AppointmentStatus>('CONFIRMED')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  const [selected, setSelected] = useState<Appointment | null>(null)
  const [summary, setSummary] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [reason, setReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const requestInFlight = useRef(false)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const result = await api<{ appointments: Appointment[] }>(
          '/api/appointments',
        )
        if (active) setAppointments(result.appointments)
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Unable to load appointments. Please try again.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [reloadKey, mode])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(interval)
  }, [])

  const today = istDate(now)
  const copy = COPY[mode]

  const sorted = [...appointments].sort((a, b) =>
    `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`),
  )

  const todayAppointments = sorted.filter((item) => item.date === today)
  const inProgress = sorted.filter(
    (item) => item.workflow_status === 'IN_PROGRESS',
  )
  const completedToday = todayAppointments.filter(
    (item) => item.status === 'COMPLETED',
  )
  const pendingToday = todayAppointments.filter(
    (item) => item.status === 'CONFIRMED',
  )

  const nextAppointment = sorted.find(
    (item) =>
      item.status === 'CONFIRMED' &&
      appointmentTime(item) >= now,
  )

  const shown = sorted.filter((item) => {
    if (mode === 'overview') return item.date === today

    if (item.status !== status) return false
    if (dateFilter && item.date !== dateFilter) return false

    if (
      mode === 'consultations' &&
      !item.consultation?.started_at &&
      item.status !== 'COMPLETED'
    ) {
      return false
    }

    const patientName = item.patient?.name.toLowerCase() ?? ''
    return patientName.includes(search.trim().toLowerCase())
  })

  function openDetails(appointment: Appointment) {
    setSelected(appointment)
    setSummary(appointment.consultation?.summary ?? '')
    setFollowUp(appointment.consultation?.follow_up_date ?? '')
    setReason('')
    setActionError(null)
  }

  async function performAction(action: Action) {
    if (!selected || requestInFlight.current) return

    if (action === 'COMPLETE' && !summary.trim()) {
      setActionError('Write a visit summary before completing the visit.')
      return
    }

    if (action === 'CANCEL' && !reason.trim()) {
      setActionError('Enter a cancellation reason.')
      return
    }

    requestInFlight.current = true
    setBusy(true)
    setActionError(null)

    try {
      const result = await api<{ appointment: Appointment }>(
        `/api/appointments/${selected.id}`,
        {
          method: 'PATCH',
          body: {
            action,
            summary,
            follow_up_date: followUp || null,
            reason,
          },
        },
      )

      const updated = result.appointment

      setAppointments((current) =>
        current.map((item) => item.id === updated.id ? updated : item),
      )
      setSelected(updated)
      setSummary(updated.consultation?.summary ?? '')
      setFollowUp(updated.consultation?.follow_up_date ?? '')
      setReason('')

      const messages: Record<Action, string> = {
        START: 'Consultation started.',
        SAVE: 'Consultation draft saved.',
        COMPLETE: 'Visit completed. The summary is now visible to the patient.',
        CANCEL: 'Appointment cancelled.',
      }

      toast(messages[action], 'success')
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Update failed. Please retry.',
      )
    } finally {
      requestInFlight.current = false
      setBusy(false)
    }
  }

  const selectedActive = selected?.status === 'CONFIRMED'
  const selectedStarted = Boolean(selected?.consultation?.started_at)
  const selectedFuture = selected
    ? appointmentTime(selected) > now
    : false

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
    >
      <div className="page-head">
        <div>
          <h1>{copy.title}</h1>
          <p className="page-sub">{copy.subtitle}</p>
        </div>

        <Button
          variant="outline"
          disabled={loading || busy || selected !== null}
          onClick={() => setReloadKey((value) => value + 1)}
        >
          Refresh
        </Button>
      </div>

      {loading ? (
        <p className="empty-note" role="status">Loading appointments…</p>
      ) : error ? (
        <Card title="Unable to load appointments">
          <p role="alert">{error}</p>
          <Button
            variant="outline"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Try again
          </Button>
        </Card>
      ) : (
        <>
          {mode === 'overview' && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                {[
                  ['Appointments today', todayAppointments.length],
                  ['Pending today', pendingToday.length],
                  ['In progress · all dates', inProgress.length],
                  ['Completed today', completedToday.length],
                ].map(([label, value]) => (
                  <Card key={String(label)} title={String(label)}>
                    <strong style={{ fontSize: 30 }}>{value}</strong>
                  </Card>
                ))}
              </div>

              <Card title="Next scheduled appointment">
                {nextAppointment ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <div>
                      <strong>{nextAppointment.patient?.name ?? 'Patient'}</strong>
                      <p className="page-sub">
                        {formatApptDate(nextAppointment.date)} ·{' '}
                        {formatTime12(nextAppointment.start_time)} IST
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => openDetails(nextAppointment)}
                    >
                      View appointment
                    </Button>
                  </div>
                ) : (
                  <EmptyState title="No upcoming appointments" />
                )}
              </Card>
            </>
          )}

          {mode !== 'overview' && (
            <>
              <div className="chip-row" aria-label="Appointment status">
                {(
                  [
                    ['CONFIRMED', mode === 'consultations' ? 'In progress' : 'Active'],
                    ['COMPLETED', 'Completed'],
                    ['CANCELLED', 'Cancelled'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={`chip ${status === value ? 'chip-on' : ''}`}
                    aria-pressed={status === value}
                    onClick={() => setStatus(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 16,
                  marginTop: 16,
                }}
              >
                <Field label="Search patient" htmlFor="doctor-search">
                  <input
                    id="doctor-search"
                    className="input"
                    type="search"
                    placeholder="Search by patient name"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </Field>

                <Field label="Appointment date" htmlFor="doctor-date">
                  <input
                    id="doctor-date"
                    className="input"
                    type="date"
                    value={dateFilter}
                    onChange={(event) => setDateFilter(event.target.value)}
                  />
                </Field>
              </div>

              {(search || dateFilter) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSearch('')
                    setDateFilter('')
                  }}
                >
                  Clear filters
                </Button>
              )}
            </>
          )}

          <Card
            title={mode === 'overview' ? "Today's appointments" : undefined}
            className="mt-16"
            padded={false}
          >
            {shown.length === 0 ? (
              <div className="pad-16">
                <EmptyState
                  title="No matching appointments"
                  body={
                    mode === 'consultations'
                      ? 'Start an eligible visit from Appointments to see it here.'
                      : 'Use Refresh to check for new bookings.'
                  }
                />
                {mode === 'consultations' && (
                  <Link className="link-sm" to="/app/appointments">
                    Open appointments
                  </Link>
                )}
              </div>
            ) : (
              <div
                className="table-wrap"
                role="region"
                tabIndex={0}
                aria-label="Doctor appointment list"
              >
                <table className="table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Status</th>
                      <th className="row-actions">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((appointment) => (
                      <tr key={appointment.id}>
                        <td>
                          <strong>{appointment.patient?.name ?? 'Patient'}</strong>
                        </td>
                        <td>
                          {formatApptDate(appointment.date)}
                          {appointment.date === today && (
                            <span className="today-pill">Today</span>
                          )}
                        </td>
                        <td>{formatTime12(appointment.start_time)} IST</td>
                        <td>
                          <StatusBadge
                            value={appointment.workflow_status ?? appointment.status}
                          />
                        </td>
                        <td className="row-actions">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => openDetails(appointment)}
                          >
                            {appointment.status !== 'CONFIRMED'
                              ? 'View details'
                              : appointment.consultation?.started_at
                                ? 'Continue visit'
                                : 'Open visit'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {selected && (
            <Card
              title={`Visit · ${selected.patient?.name ?? 'Patient'}`}
              className="mt-16"
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setSelected(null)}
                >
                  Close
                </Button>
              }
            >
              <p className="page-sub">
                {formatApptDate(selected.date)} ·{' '}
                {formatTime12(selected.start_time)} IST
              </p>

              <StatusBadge
                value={selected.workflow_status ?? selected.status}
              />

              {actionError && (
                <p className="field-error" role="alert">
                  {actionError}
                </p>
              )}

              {selectedActive && !selectedStarted && (
                <div className="mt-16">
                  <p className="empty-note">
                    {selectedFuture
                      ? 'You can start this consultation once its scheduled time arrives.'
                      : 'Start the consultation when the patient is ready.'}
                  </p>
                  <Button
                    disabled={busy || selectedFuture}
                    onClick={() => performAction('START')}
                  >
                    Start consultation
                  </Button>
                </div>
              )}

              {selectedActive && selectedStarted && (
                <div className="mt-16">
                  <Field
                    label="Visit summary"
                    htmlFor="visit-summary"
                    hint="Drafts are visible only to you. Completing the visit shares this summary with the patient."
                  >
                    <textarea
                      id="visit-summary"
                      className="input"
                      rows={6}
                      maxLength={3000}
                      value={summary}
                      disabled={busy}
                      placeholder="Enter the visit summary and agreed follow-up."
                      onChange={(event) => setSummary(event.target.value)}
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </Field>

                  <Field
                    label="Follow-up date (optional)"
                    htmlFor="follow-up"
                    hint="This records a suggested date; it does not book another appointment."
                  >
                    <input
                      id="follow-up"
                      className="input"
                      type="date"
                      min={today}
                      value={followUp}
                      disabled={busy}
                      onChange={(event) => setFollowUp(event.target.value)}
                    />
                  </Field>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => performAction('SAVE')}
                    >
                      Save draft
                    </Button>
                    <Button
                      disabled={busy || !summary.trim()}
                      onClick={() => performAction('COMPLETE')}
                    >
                      Save and complete
                    </Button>
                  </div>
                </div>
              )}

              {selected.status === 'COMPLETED' && (
                <div className="mt-16">
                  <strong>Completed visit summary</strong>
                  <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {selected.consultation?.summary ||
                      'No summary was recorded for this older appointment.'}
                  </p>

                  {selected.consultation?.follow_up_date && (
                    <p>
                      Suggested follow-up:{' '}
                      {formatApptDate(selected.consultation.follow_up_date)}
                    </p>
                  )}
                </div>
              )}

              {selected.status === 'CANCELLED' && (
                <p className="mt-16">
                  Cancellation reason:{' '}
                  {selected.consultation?.cancellation_reason ||
                    'No reason was recorded for this older appointment.'}
                </p>
              )}

              {selectedActive && (
                <div
                  className="mt-16"
                  style={{ borderTop: '1px solid #e4e9e5', paddingTop: 16 }}
                >
                  <Field
                    label="Cancellation reason"
                    htmlFor="cancel-reason"
                    hint="Required only when cancelling. The reason is visible to the patient."
                  >
                    <input
                      id="cancel-reason"
                      className="input"
                      value={reason}
                      maxLength={500}
                      disabled={busy}
                      placeholder="For example: doctor unavailable"
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </Field>

                  <Button
                    variant="danger"
                    disabled={busy || !reason.trim()}
                    onClick={() => performAction('CANCEL')}
                  >
                    Cancel appointment
                  </Button>
                </div>
              )}

              {busy && <p role="status">Saving changes…</p>}
            </Card>
          )}
        </>
      )}
    </motion.div>
  )
}