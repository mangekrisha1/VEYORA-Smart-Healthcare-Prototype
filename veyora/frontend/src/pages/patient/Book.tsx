import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { api, ApiError } from '../../lib/api'
import { formatApptDate, formatTime12 } from '../../lib/format'
import type { DoctorSummary, Slot } from '../../lib/types'
import { Button, Card } from '../../components/ui'
import { useToast } from '../../state/ToastContext'

type Step = 1 | 2 | 3 | 4

function addDays(base: Date, days: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Book() {
  const reduced = useReducedMotion()
  const { toast } = useToast()

  const [doctors, setDoctors] = useState<DoctorSummary[]>([])
  const [specialty, setSpecialty] = useState<string>('All')
  const [doctorId, setDoctorId] = useState<number | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [time, setTime] = useState<string | null>(null)
  const [step, setStep] = useState<Step>(1)
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState<string | null>(null)
  const [bookedId, setBookedId] = useState<number | null>(null)

  const doctor = doctors.find((d) => d.id === doctorId) ?? null
  const specialties = useMemo(
    () => ['All', ...Array.from(new Set(doctors.map((d) => d.specialty ?? 'General')))],
    [doctors],
  )

  // Future dates only, generated from the real runtime date (IST).
  const dates = useMemo(() => {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    return Array.from({ length: 14 }, (_, i) => addDays(today, i + 1))
  }, [])

  useEffect(() => {
    api<{ doctors: DoctorSummary[] }>('/api/doctors')
      .then((d) => setDoctors(d.doctors))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!doctorId || !date) return
    setSlots([])
    api<{ slots: Slot[] }>(`/api/doctors/${doctorId}/slots?date=${date}`)
      .then((r) => setSlots(r.slots))
      .catch(() => setSlots([]))
  }, [doctorId, date])

  const confirm = async () => {
    if (!doctorId || !date || !time) return
    setBusy(true)
    setConflict(null)
    try {
      await api('/api/appointments', {
        method: 'POST',
        body: { doctor_id: doctorId, date, start_time: time },
      })
      setStep(4)
      setBookedId(Date.now())
      toast('Appointment booked. See you at the clinic!', 'success')
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Keep doctor + date selected; just clear the taken slot.
        setConflict(err.message)
        setTime(null)
        const fresh = await api<{ slots: Slot[] }>(
          `/api/doctors/${doctorId}/slots?date=${date}`).catch(() => null)
        if (fresh) setSlots(fresh.slots)
      } else {
        setConflict(err instanceof Error ? err.message : 'Booking failed.')
      }
    } finally {
      setBusy(false)
    }
  }

  const visibleDoctors = doctors.filter(
    (d) => specialty === 'All' || (d.specialty ?? 'General') === specialty,
  )

  return (
    <div className="book-page">
      <div className="page-head">
        <div>
          <h1>Book an appointment</h1>
          <p className="page-sub">In-clinic visits only. All times shown in IST (Asia/Kolkata).</p>
        </div>
      </div>

      <ol className="stepper" aria-label="Booking progress">
        {['Doctor', 'Date', 'Time', 'Review'].map((label, i) => (
          <li key={label} className={`step ${step >= i + 1 ? 'active' : ''}`}
              aria-current={step === i + 1 ? 'step' : undefined}>
            <span className="step-num">{i + 1}</span>{label}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="s1" initial={reduced ? false : { opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}>
            <Card title="Choose a doctor">
              <div className="chip-row" role="group" aria-label="Filter by specialty">
                {specialties.map((s) => (
                  <button key={s}
                          className={`chip ${specialty === s ? 'chip-on' : ''}`}
                          onClick={() => setSpecialty(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="doctor-grid">
                {visibleDoctors.map((d) => (
                  <button key={d.id}
                          className={`doctor-card ${doctorId === d.id ? 'selected' : ''}`}
                          onClick={() => { setDoctorId(d.id); setDate(null); setTime(null) }}>
                    <span className="doctor-avatar" aria-hidden="true">
                      {d.name.replace('Dr. ', '').split(' ').map((p) => p[0]).slice(0, 2).join('')}
                    </span>
                    <span className="doctor-meta">
                      <strong>{d.name}</strong>
                      <small>{d.specialty}</small>
                    </span>
                  </button>
                ))}
              </div>
              <div className="step-actions">
                <span />
                <Button disabled={!doctorId} onClick={() => setStep(2)}>
                  Continue
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {step === 2 && doctor && (
          <motion.div key="s2" initial={reduced ? false : { opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}>
            <Card title={`Pick a date with ${doctor.name}`}>
              <div className="date-grid" role="group" aria-label="Available dates">
                {dates.map((d) => {
                  const works = doctor.working_days.includes(d)
                  return (
                    <button key={d} disabled={!works}
                            className={`date-chip ${date === d ? 'selected' : ''}`}
                            onClick={() => { setDate(d); setTime(null) }}>
                      {formatApptDate(d)}
                    </button>
                  )
                })}
              </div>
              <p className="field-hint">
                Dates the doctor does not hold clinic are disabled.
              </p>
              <div className="step-actions">
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button disabled={!date} onClick={() => setStep(3)}>Continue</Button>
              </div>
            </Card>
          </motion.div>
        )}

        {step === 3 && doctor && date && (
          <motion.div key="s3" initial={reduced ? false : { opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}>
            <Card title={`Choose a time · ${formatApptDate(date)}`}>
              {conflict && (
                <div className="conflict-note" role="alert">
                  <strong>Slot just taken.</strong> {conflict}
                </div>
              )}
              {slots.length === 0 ? (
                <p className="empty-note">No clinic hours on this date — pick another date.</p>
              ) : (
                <div className="slot-grid" role="group" aria-label="Time slots">
                  {slots.map((s) => (
                    <button key={s.time} disabled={!s.available}
                            className={`slot ${time === s.time ? 'selected' : ''}`}
                            onClick={() => setTime(s.time)}>
                      {formatTime12(s.time)}
                    </button>
                  ))}
                </div>
              )}
              <div className="step-actions">
                <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                <Button disabled={!time} onClick={() => { setConflict(null); setStep(4) }}>
                  Review
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {step === 4 && doctor && date && time && !bookedId && (
          <motion.div key="s4" initial={reduced ? false : { opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}>
            <Card title="Review and confirm">
              <dl className="review-list">
                <div><dt>Doctor</dt><dd>{doctor.name} · {doctor.specialty}</dd></div>
                <div><dt>Date</dt><dd>{formatApptDate(date)} (IST)</dd></div>
                <div><dt>Time</dt><dd>{formatTime12(time)} IST</dd></div>
                <div><dt>Visit type</dt><dd>In-clinic appointment</dd></div>
              </dl>
              {conflict && <div className="conflict-note" role="alert">{conflict}</div>}
              <div className="step-actions">
                <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
                <Button loading={busy} onClick={confirm}>Confirm booking</Button>
              </div>
            </Card>
          </motion.div>
        )}

        {step === 4 && bookedId && (
          <motion.div key="done" initial={reduced ? false : { opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}>
            <Card className="success-card">
              <div className="success-mark" aria-hidden="true">
                <svg viewBox="0 0 52 52" width="56" height="56">
                  <circle cx="26" cy="26" r="24" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
                  <motion.path d="M15 27l8 8 15-17" fill="none" stroke="var(--accent)"
                               strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
                               initial={reduced ? false : { pathLength: 0 }}
                               animate={{ pathLength: 1 }} transition={{ duration: 0.45, delay: 0.1 }} />
                </svg>
              </div>
              <h2>You're booked</h2>
              <p>
                {doctor?.name} · {date ? formatApptDate(date) : ''} at{' '}
                {time ? formatTime12(time) : ''} IST.
                A reminder will appear in your overview.
              </p>
              <div className="hero-actions">
                <Link to="/app"><Button>Go to overview</Button></Link>
                <Button variant="outline" onClick={() => {
                  setStep(1); setDoctorId(null); setDate(null); setTime(null)
                  setBookedId(null); setConflict(null)
                }}>
                  Book another
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
