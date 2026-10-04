import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { api, ApiError } from '../../lib/api'
import type { CoordinatorAppointment } from '../../lib/types'
import { Button, Card, Field, Modal, StatusBadge } from '../../components/ui'
import { formatApptDate, formatTime12 } from '../../lib/format'
import { useToast } from '../../state/ToastContext'

interface DoctorOption {
  id: number
  name: string
  specialty: string
}

export default function AppointmentMonitor() {
  const reduced = useReducedMotion()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [appointments, setAppointments] = useState<CoordinatorAppointment[]>([])
  const [doctors, setDoctors] = useState<DoctorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [dateFilter, setDateFilter] = useState('')
  const [doctorFilter, setDoctorFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Selected appointment for details modal
  const [selectedAppt, setSelectedAppt] = useState<CoordinatorAppointment | null>(null)

  // Report Issue Modal
  const [reportAppt, setReportAppt] = useState<CoordinatorAppointment | null>(null)
  const [issueTitle, setIssueTitle] = useState('')
  const [issueCategory, setIssueCategory] = useState('Appointment')
  const [issuePriority, setIssuePriority] = useState('Medium')
  const [issueDescription, setIssueDescription] = useState('')
  const [submittingIssue, setSubmittingIssue] = useState(false)
  const [issueError, setIssueError] = useState('')

  async function loadDoctors() {
    try {
      const res = await api<{ doctors: DoctorOption[] }>('/api/coordinator/doctors')
      setDoctors(res.doctors)
    } catch {
      // Non-critical, filter will be blank
    }
  }

  async function fetchAppointments() {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (dateFilter) params.set('date', dateFilter)
      if (doctorFilter) params.set('doctor_id', doctorFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (searchQuery.trim()) params.set('q', searchQuery.trim())

      const url = `/api/coordinator/appointments?${params.toString()}`
      const res = await api<{ appointments: CoordinatorAppointment[] }>(url)
      setAppointments(res.appointments)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load appointments.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDoctors()
  }, [])

  useEffect(() => {
    void fetchAppointments()
  }, [dateFilter, doctorFilter, statusFilter])

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    void fetchAppointments()
  }

  function handleResetFilters() {
    setDateFilter('')
    setDoctorFilter('')
    setStatusFilter('')
    setSearchQuery('')
  }

  function handleOpenReport(appt: CoordinatorAppointment) {
    setReportAppt(appt)
    setIssueTitle(`Issue regarding appointment ${appt.reference}`)
    setIssueCategory('Appointment')
    setIssuePriority('Medium')
    setIssueDescription(`Doctor: ${appt.doctor_name}\nScheduled slot: ${formatApptDate(appt.date)} at ${formatTime12(appt.start_time)}\nStatus: ${appt.status}\n\nObserved operational issue: `)
    setIssueError('')
    setSelectedAppt(null)
  }

  async function handleSubmitIssue(e: React.FormEvent) {
    e.preventDefault()
    if (!reportAppt) return

    setSubmittingIssue(true)
    setIssueError('')

    try {
      await api('/api/coordinator/incidents', {
        method: 'POST',
        body: {
          title: issueTitle.trim(),
          category: issueCategory,
          priority: issuePriority,
          description: issueDescription.trim(),
          appointment_id: reportAppt.id,
        },
      })
      toast('Operational incident reported successfully.', 'success')
      setReportAppt(null)
      // Navigate to incident register or refresh
      navigate('/app/risks')
    } catch (err) {
      setIssueError(err instanceof ApiError ? err.message : 'Failed to report incident.')
    } finally {
      setSubmittingIssue(false)
    }
  }

  return (
    <motion.div
      className="page"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <header className="page-header">
        <h1 className="page-title">Appointment monitor</h1>
        <p className="page-sub">
          Operational appointment list with scheduling filters and issue escalation. Clinical records and patient notes are strictly excluded.
        </p>
      </header>

      {error && (
        <div className="alert alert-danger" role="alert" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <Card padded style={{ marginBottom: 24 }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, alignItems: 'flex-end' }}>
          <Field label="Search by Reference / Doctor">
            <input
              type="text"
              placeholder="e.g. APT-0001 or Dr. Iyer"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </Field>

          <Field label="Filter by Date">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </Field>

          <Field label="Filter by Doctor">
            <select
              value={doctorFilter}
              onChange={(e) => setDoctorFilter(e.target.value)}
            >
              <option value="">All doctors</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.specialty})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Status">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </Field>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" variant="primary" style={{ flex: 1 }}>
              Filter
            </Button>
            <Button type="button" variant="ghost" onClick={handleResetFilters}>
              Reset
            </Button>
          </div>
        </form>
      </Card>

      {/* Appointments Table */}
      <Card padded>
        {loading ? (
          <div className="page-loading" style={{ minHeight: 200 }} role="status">
            <span className="spinner" aria-hidden="true" />
            <span>Loading appointments…</span>
          </div>
        ) : appointments.length === 0 ? (
          <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--muted)' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: 8 }}>No matching appointments found.</p>
            <small>Try clearing your filters or searching for another booking reference.</small>
          </div>
        ) : (
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Doctor</th>
                  <th>Specialty</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appt) => (
                  <tr key={appt.id}>
                    <td>
                      <span className="badge badge-neutral" style={{ fontFamily: 'monospace' }}>
                        {appt.reference}
                      </span>
                    </td>
                    <td>{formatApptDate(appt.date)}</td>
                    <td style={{ fontWeight: 600 }}>{formatTime12(appt.start_time)}</td>
                    <td>{appt.doctor_name}</td>
                    <td style={{ color: 'var(--muted)' }}>{appt.doctor_specialty}</td>
                    <td>
                      <StatusBadge status={appt.workflow_status || appt.status} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedAppt(appt)}
                        >
                          Details
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenReport(appt)}
                        >
                          Report issue
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Appointment Read-Only Details Modal */}
      {selectedAppt && (
        <Modal
          title={`Booking details: ${selectedAppt.reference}`}
          open={Boolean(selectedAppt)}
          onClose={() => setSelectedAppt(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.9rem' }}>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Booking Reference</span>
                <strong>{selectedAppt.reference}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Operational Status</span>
                <StatusBadge status={selectedAppt.workflow_status || selectedAppt.status} />
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Appointment Date</span>
                <strong>{formatApptDate(selectedAppt.date)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Scheduled Slot</span>
                <strong>{formatTime12(selectedAppt.start_time)} (Asia/Kolkata)</strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Assigned Doctor</span>
                <strong>{selectedAppt.doctor_name}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Specialty</span>
                <strong>{selectedAppt.doctor_specialty || 'General Medicine'}</strong>
              </div>
            </div>

            <div style={{ padding: 12, backgroundColor: 'var(--surface-muted)', borderRadius: 8, fontSize: '0.85rem', color: 'var(--muted)' }}>
              🔒 <strong>Privacy Boundary:</strong> Under role separation policies, the clinic coordinator interface does not display personal patient identifiers, medical history, or clinical consultation notes.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <Button variant="ghost" onClick={() => setSelectedAppt(null)}>
                Close
              </Button>
              <Button
                variant="outline"
                onClick={() => handleOpenReport(selectedAppt)}
              >
                Report issue with booking
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Report Issue Modal */}
      {reportAppt && (
        <Modal
          title={`Report operational incident for ${reportAppt.reference}`}
          open={Boolean(reportAppt)}
          onClose={() => setReportAppt(null)}
        >
          <form onSubmit={handleSubmitIssue} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {issueError && (
              <div className="alert alert-danger" role="alert">
                {issueError}
              </div>
            )}

            <Field label="Incident Title" hint="Brief summary of the observed operational problem">
              <input
                type="text"
                required
                maxLength={160}
                value={issueTitle}
                onChange={(e) => setIssueTitle(e.target.value)}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Category">
                <select
                  value={issueCategory}
                  onChange={(e) => setIssueCategory(e.target.value)}
                >
                  <option value="Appointment">Appointment</option>
                  <option value="Availability">Availability</option>
                  <option value="Privacy/access">Privacy/access</option>
                  <option value="Data accuracy">Data accuracy</option>
                  <option value="Other">Other</option>
                </select>
              </Field>

              <Field label="Operational Priority">
                <select
                  value={issuePriority}
                  onChange={(e) => setIssuePriority(e.target.value)}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </Field>
            </div>

            <Field
              label="Description & Context"
              hint="Keep descriptions focused on technical/operational facts. Do not paste unnecessary patient clinical details."
            >
              <textarea
                rows={4}
                required
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
              />
            </Field>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <Button
                type="button"
                variant="ghost"
                disabled={submittingIssue}
                onClick={() => setReportAppt(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={submittingIssue}
              >
                {submittingIssue ? 'Submitting…' : 'Submit incident report'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </motion.div>
  )
}
