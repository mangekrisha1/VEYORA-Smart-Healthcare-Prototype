import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { api, ApiError } from '../../lib/api'
import type { ClinicOverviewData } from '../../lib/types'
import { Button, Card, StatusBadge } from '../../components/ui'
import { formatApptDate, formatTime12 } from '../../lib/format'

export default function ClinicOverview() {
  const reduced = useReducedMotion()
  const [data, setData] = useState<ClinicOverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  async function loadData(isRefresh = false) {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const res = await api<ClinicOverviewData>('/api/coordinator/overview')
      setData(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load clinic overview.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  if (loading && !data) {
    return (
      <div className="page-loading" role="status">
        <span className="spinner" aria-hidden="true" />
        <span>Loading clinic overview…</span>
      </div>
    )
  }

  const metrics = data?.metrics ?? {
    total_today: 0,
    confirmed_today: 0,
    in_progress_today: 0,
    completed_today: 0,
    cancelled_today: 0,
    open_incidents: 0,
  }

  const schedule = data?.schedule ?? []
  const urgentIncidents = data?.urgent_incidents ?? []

  return (
    <motion.div
      className="page"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">Clinic overview</h1>
          <p className="page-sub">
            Live operational status for {data?.today ? formatApptDate(data.today) : 'today'} (Asia/Kolkata).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh data'}
          </Button>
        </div>
      </header>

      {error && (
        <div className="alert alert-danger" role="alert" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Operational Metric Cards */}
      <section aria-label="Today's Metrics" style={{ marginBottom: 24 }}>
        <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16 }}>
          <Card padded>
            <span className="stat-label">Total today</span>
            <strong className="stat-value" style={{ fontSize: '1.75rem', display: 'block', marginTop: 4 }}>
              {metrics.total_today}
            </strong>
            <small style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Booked appointments</small>
          </Card>

          <Card padded>
            <span className="stat-label">Confirmed</span>
            <strong className="stat-value" style={{ fontSize: '1.75rem', display: 'block', marginTop: 4, color: 'var(--accent)' }}>
              {metrics.confirmed_today}
            </strong>
            <small style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Awaiting doctor</small>
          </Card>

          <Card padded>
            <span className="stat-label">In progress</span>
            <strong className="stat-value" style={{ fontSize: '1.75rem', display: 'block', marginTop: 4, color: '#D97706' }}>
              {metrics.in_progress_today}
            </strong>
            <small style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Consultation active</small>
          </Card>

          <Card padded>
            <span className="stat-label">Completed</span>
            <strong className="stat-value" style={{ fontSize: '1.75rem', display: 'block', marginTop: 4, color: '#059669' }}>
              {metrics.completed_today}
            </strong>
            <small style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Visits finished</small>
          </Card>

          <Card padded>
            <span className="stat-label">Cancelled</span>
            <strong className="stat-value" style={{ fontSize: '1.75rem', display: 'block', marginTop: 4, color: 'var(--muted)' }}>
              {metrics.cancelled_today}
            </strong>
            <small style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Released slots</small>
          </Card>

          <Card padded>
            <span className="stat-label">Open incidents</span>
            <strong
              className="stat-value"
              style={{
                fontSize: '1.75rem',
                display: 'block',
                marginTop: 4,
                color: metrics.open_incidents > 0 ? '#DC2626' : 'var(--ink)',
              }}
            >
              {metrics.open_incidents}
            </strong>
            <small style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Operational issues</small>
          </Card>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24 }}>
        {/* Today's Schedule */}
        <Card
          title="Today's appointment schedule"
          action={
            <Link to="/app/monitor" className="btn btn-ghost btn-sm">
              View all bookings →
            </Link>
          }
          padded
        >
          {schedule.length === 0 ? (
            <p style={{ color: 'var(--muted)', margin: '16px 0' }}>
              No appointments scheduled for today.
            </p>
          ) : (
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Reference</th>
                    <th>Doctor</th>
                    <th>Specialty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{formatTime12(item.start_time)}</td>
                      <td>
                        <span className="badge badge-neutral" style={{ fontFamily: 'monospace' }}>
                          {item.reference}
                        </span>
                      </td>
                      <td>{item.doctor_name}</td>
                      <td style={{ color: 'var(--muted)' }}>{item.doctor_specialty}</td>
                      <td>
                        <StatusBadge status={item.workflow_status || item.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Urgent Incidents */}
        <Card
          title="Urgent incidents (High / Critical)"
          action={
            <Link to="/app/risks" className="btn btn-ghost btn-sm">
              Open incident register →
            </Link>
          }
          padded
        >
          {urgentIncidents.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)' }}>
              <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: 8 }}>✓</span>
              <p>No high or critical incidents currently pending.</p>
              <small>All operations are operating within normal tolerances.</small>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {urgentIncidents.map((inc) => (
                <div
                  key={inc.id}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--surface)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span className="badge badge-neutral" style={{ fontFamily: 'monospace' }}>
                      {inc.reference}
                    </span>
                    <StatusBadge status={inc.priority} />
                  </div>
                  <strong style={{ display: 'block', marginBottom: 4 }}>{inc.title}</strong>
                  <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
                    {inc.description || 'No description provided.'}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--muted)' }}>Category: {inc.category}</span>
                    <Link to="/app/risks" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      Manage →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </motion.div>
  )
}
