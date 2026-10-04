import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { api, ApiError } from '../../lib/api'
import { formatApptDate, formatTime12 } from '../../lib/format'
import type { Appointment, Reminder } from '../../lib/types'
import {
  Button,
  Card,
  EmptyState,
  StatusBadge,
} from '../../components/ui'
import { useToast } from '../../state/ToastContext'

type PageMode = 'overview' | 'appointments' | 'reminders'

const PAGE_COPY: Record<PageMode, { title: string; subtitle: string }> = {
  overview: {
    title: 'Overview',
    subtitle: 'Your visits and in-app appointment reminders.',
  },
  appointments: {
    title: 'My appointments',
    subtitle: 'View bookings, completed visit summaries and appointment history.',
  },
  reminders: {
    title: 'Reminders',
    subtitle: 'Keep track of your in-app appointment reminders.',
  },
}

function AppointmentRow({ appointment }: { appointment: Appointment }) {
  return (
    <li style={{ listStyle: 'none' }}>
      <div className="appt-row">
        <div className="appt-when">
          <strong>{formatApptDate(appointment.date)}</strong>
          <small>{formatTime12(appointment.start_time)} IST</small>
        </div>

        <div className="appt-info">
          <strong>{appointment.doctor?.name ?? 'Doctor'}</strong>
          <small>
            {appointment.doctor?.specialty
              ? `${appointment.doctor.specialty} · `
              : ''}
            In-clinic
          </small>
        </div>

        <StatusBadge
          value={appointment.workflow_status ?? appointment.status}
        />
      </div>

      {appointment.status === 'COMPLETED' &&
        appointment.consultation?.summary && (
          <details style={{ padding: '0 0 16px', marginTop: 8 }}>
            <summary
              style={{
                cursor: 'pointer',
                color: 'var(--accent)',
                fontWeight: 600,
              }}
            >
              View visit summary
            </summary>

            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {appointment.consultation.summary}
            </p>

            {appointment.consultation.follow_up_date && (
              <p>
                Suggested follow-up:{' '}
                {formatApptDate(appointment.consultation.follow_up_date)}.
                Please book separately if needed.
              </p>
            )}
          </details>
        )}

      {appointment.status === 'CANCELLED' &&
        appointment.consultation?.cancellation_reason && (
          <p className="card-foot-note">
            Cancellation reason:{' '}
            {appointment.consultation.cancellation_reason}
          </p>
        )}
    </li>
  )
}

export default function PatientOverview({
  mode = 'overview',
}: {
  mode?: PageMode
}) {
  const reduced = useReducedMotion()
  const { toast } = useToast()

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [readingId, setReadingId] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const readInFlight = useRef(false)

  const showAppointments = mode !== 'reminders'
  const showReminders = mode !== 'appointments'
  const copy = PAGE_COPY[mode]

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError(null)
      setActionError(null)

      try {
        const [appointmentData, reminderData] = await Promise.all([
          showAppointments
            ? api<{ appointments: Appointment[] }>('/api/appointments')
            : Promise.resolve({ appointments: [] as Appointment[] }),
          showReminders
            ? api<{ reminders: Reminder[] }>('/api/reminders')
            : Promise.resolve({ reminders: [] as Reminder[] }),
        ])

        if (!active) return
        setAppointments(appointmentData.appointments)
        setReminders(reminderData.reminders)
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Unable to load your information. Please try again.',
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
  }, [showAppointments, showReminders, reloadKey])

  async function markRead(id: number) {
    if (readInFlight.current) return

    readInFlight.current = true
    setReadingId(id)
    setActionError(null)

    try {
      await api(`/api/reminders/${id}/read`, { method: 'POST' })

      setReminders((current) =>
        current.map((reminder) =>
          reminder.appointment_id === id
            ? { ...reminder, read: true }
            : reminder,
        ),
      )

      toast('Reminder marked as read.', 'success')
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'Could not mark this reminder as read. Please try again.',
      )
    } finally {
      readInFlight.current = false
      setReadingId(null)
    }
  }

  const activeAppointments = appointments.filter(
    (appointment) => appointment.status === 'CONFIRMED',
  )

  const history = appointments.filter(
    (appointment) => appointment.status !== 'CONFIRMED',
  )

  return (
    <motion.div
      key={mode}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
    >
      <div className="page-head">
        <div>
          <h1>{copy.title}</h1>
          <p className="page-sub">{copy.subtitle}</p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button
            variant="outline"
            disabled={loading || readingId !== null}
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Refresh
          </Button>
          <Link className="btn btn-primary" to="/app/book">
            Book appointment
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="empty-note" role="status">
          Loading your information…
        </p>
      ) : error ? (
        <Card title="Unable to load">
          <p className="empty-note" role="alert">{error}</p>
          <Button
            variant="outline"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Try again
          </Button>
        </Card>
      ) : (
        <>
          <div className={mode === 'overview' ? 'grid-2' : undefined}>
            {showAppointments && (
              <Card
                title="Active appointments"
                action={
                  <Link className="link-sm" to="/app/book">+ New</Link>
                }
              >
                {activeAppointments.length === 0 ? (
                  <EmptyState
                    title="No active appointments"
                    body="Book an in-clinic appointment to get started."
                  />
                ) : (
                  <ul className="appt-list">
                    {activeAppointments.map((appointment) => (
                      <AppointmentRow
                        key={appointment.id}
                        appointment={appointment}
                      />
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {showReminders && (
              <Card title="In-app appointment reminders">
                {actionError && (
                  <p className="field-error" role="alert">
                    {actionError}
                  </p>
                )}

                {reminders.length === 0 ? (
                  <EmptyState
                    title="Nothing to remind you about"
                    body="Reminders appear here for confirmed visits within the next 7 days."
                  />
                ) : (
                  <ul className="reminder-list">
                    {reminders.map((reminder) => (
                      <li
                        key={reminder.appointment_id}
                        className={`reminder-row ${reminder.read ? 'read' : ''}`}
                      >
                        <div>
                          <strong>
                            {reminder.doctor?.name ?? 'Appointment'}
                          </strong>
                          <small>
                            {formatApptDate(reminder.date)} ·{' '}
                            {formatTime12(reminder.start_time)} IST
                          </small>
                        </div>

                        {reminder.read ? (
                          <span className="foot-note">Read</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={readingId !== null}
                            onClick={() => markRead(reminder.appointment_id)}
                          >
                            {readingId === reminder.appointment_id
                              ? 'Saving…'
                              : 'Mark read'}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="card-foot-note">
                  In-app reminders only. VEYORA does not send SMS, email,
                  WhatsApp or push notifications.
                </p>
              </Card>
            )}
          </div>

          {showAppointments && (
            <Card title="Appointment history" className="mt-16">
              {history.length === 0 ? (
                <p className="empty-note">
                  No completed or cancelled appointments yet.
                </p>
              ) : (
                <ul className="appt-list">
                  {history.slice().reverse().map((appointment) => (
                    <AppointmentRow
                      key={appointment.id}
                      appointment={appointment}
                    />
                  ))}
                </ul>
              )}
            </Card>
          )}
        </>
      )}
    </motion.div>
  )
}