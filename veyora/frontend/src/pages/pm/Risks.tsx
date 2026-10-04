import { useCallback, useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { api, ApiError } from '../../lib/api'
import type {
  Incident,
  IncidentCategory,
  IncidentPriority,
  IncidentStatus,
  JiraConnectionStatus,
  Risk,
  RiskMetrics,
} from '../../lib/types'
import { Button, Card, Field, Modal, StatusBadge } from '../../components/ui'
import RiskMatrix from '../../components/RiskMatrix'
import { useToast } from '../../state/ToastContext'
import { formatApptDate } from '../../lib/format'

const RISK_CATEGORIES = [
  'Security',
  'Data integrity',
  'Availability',
  'Schedule',
  'Compliance',
  'Usability',
]

const INCIDENT_CATEGORIES: IncidentCategory[] = [
  'Appointment',
  'Availability',
  'Privacy/access',
  'Data accuracy',
  'Other',
]

const INCIDENT_PRIORITIES: IncidentPriority[] = ['Low', 'Medium', 'High', 'Critical']

type RiskForm = {
  title: string
  description: string
  category: string
  probability: number
  impact: number
  owner: string
  mitigation: string
  contingency: string
  control_status: string
  review_date: string
  linked_requirement: string
  linked_verification: string
}

const emptyRiskForm: RiskForm = {
  title: '',
  description: '',
  category: 'Schedule',
  probability: 3,
  impact: 3,
  owner: 'Krisha Mange',
  mitigation: '',
  contingency: '',
  control_status: 'Planned',
  review_date: '',
  linked_requirement: '',
  linked_verification: '',
}

export default function RisksAndIncidents() {
  const reduced = useReducedMotion()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<'risks' | 'incidents'>('risks')

  // --- Risks State ---
  const [risks, setRisks] = useState<Risk[]>([])
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics | null>(null)
  const [riskQ, setRiskQ] = useState('')
  const [riskCategory, setRiskCategory] = useState('All')
  const [riskStatus, setRiskStatus] = useState('All')
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null)
  const [creatingRisk, setCreatingRisk] = useState(false)
  const [riskForm, setRiskForm] = useState<RiskForm>(emptyRiskForm)
  const [riskFormError, setRiskFormError] = useState<string | null>(null)
  const [riskBusy, setRiskBusy] = useState(false)

  // --- Incidents State ---
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [incidentsLoading, setIncidentsLoading] = useState(false)
  const [incidentQ, setIncidentQ] = useState('')
  const [incidentCategory, setIncidentCategory] = useState('All')
  const [incidentPriority, setIncidentPriority] = useState('All')
  const [incidentStatus, setIncidentStatus] = useState('All')
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [creatingIncident, setCreatingIncident] = useState(false)
  const [incidentTitle, setIncidentTitle] = useState('')
  const [incidentDesc, setIncidentDesc] = useState('')
  const [incCategoryVal, setIncCategoryVal] = useState<IncidentCategory>('Other')
  const [incPriorityVal, setIncPriorityVal] = useState<IncidentPriority>('Medium')
  const [linkedApptId, setLinkedApptId] = useState('')
  const [linkedRiskId, setLinkedRiskId] = useState('')
  const [incidentFormError, setIncidentFormError] = useState<string | null>(null)
  const [incidentSubmitting, setIncidentSubmitting] = useState(false)

  // --- Incident Resolve Modal ---
  const [resolvingIncident, setResolvingIncident] = useState<Incident | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [resolveError, setResolveError] = useState('')
  const [resolvingBusy, setResolvingBusy] = useState(false)

  // --- Incident Reopen Modal ---
  const [reopeningIncident, setReopeningIncident] = useState<Incident | null>(null)
  const [reopenReason, setReopenReason] = useState('')
  const [reopenBusy, setReopenBusy] = useState(false)

  // --- Jira State & Modals ---
  const [jiraStatus, setJiraStatus] = useState<JiraConnectionStatus | null>(null)
  const [checkingJira, setCheckingJira] = useState(false)
  const [jiraModalOpen, setJiraModalOpen] = useState(false)

  // Jira Create Issue Modal
  const [jiraCreateTarget, setJiraCreateTarget] = useState<{
    type: 'risk' | 'incident'
    id: number
    ref: string
    title: string
    description: string
    defaultType: string
  } | null>(null)
  const [jiraSummary, setJiraSummary] = useState('')
  const [jiraDescription, setJiraDescription] = useState('')
  const [jiraIssueType, setJiraIssueType] = useState('Task')
  const [jiraCreateBusy, setJiraCreateBusy] = useState(false)
  const [jiraCreateError, setJiraCreateError] = useState('')

  // Jira Link Issue Modal
  const [jiraLinkTarget, setJiraLinkTarget] = useState<{
    type: 'risk' | 'incident'
    id: number
    ref: string
  } | null>(null)
  const [jiraLinkKey, setJiraLinkKey] = useState('')
  const [jiraLinkBusy, setJiraLinkBusy] = useState(false)
  const [jiraLinkError, setJiraLinkError] = useState('')

  // ---------------------------------------------------------------------------
  // Load Risks
  // ---------------------------------------------------------------------------
  const loadRisks = useCallback(async () => {
    const params = new URLSearchParams()
    if (riskQ) params.set('q', riskQ)
    if (riskCategory !== 'All') params.set('category', riskCategory)
    if (riskStatus !== 'All') params.set('status', riskStatus)
    try {
      const data = await api<{ risks: Risk[]; metrics: RiskMetrics }>(
        `/api/risks?${params.toString()}`
      )
      setRisks(data.risks)
      setRiskMetrics(data.metrics)
    } catch {
      // ignore
    }
  }, [riskQ, riskCategory, riskStatus])

  useEffect(() => {
    void loadRisks()
  }, [loadRisks])

  // ---------------------------------------------------------------------------
  // Load Incidents
  // ---------------------------------------------------------------------------
  const loadIncidents = useCallback(async () => {
    setIncidentsLoading(true)
    const params = new URLSearchParams()
    if (incidentQ) params.set('q', incidentQ)
    if (incidentCategory !== 'All') params.set('category', incidentCategory)
    if (incidentPriority !== 'All') params.set('priority', incidentPriority)
    if (incidentStatus !== 'All') params.set('status', incidentStatus)
    try {
      const data = await api<{ incidents: Incident[] }>(
        `/api/coordinator/incidents?${params.toString()}`
      )
      setIncidents(data.incidents)
      if (selectedIncident) {
        const updated = data.incidents.find((i) => i.id === selectedIncident.id)
        if (updated) setSelectedIncident(updated)
      }
    } catch {
      // ignore
    } finally {
      setIncidentsLoading(false)
    }
  }, [incidentQ, incidentCategory, incidentPriority, incidentStatus, selectedIncident?.id])

  useEffect(() => {
    if (activeTab === 'incidents') {
      void loadIncidents()
    }
  }, [activeTab, loadIncidents])

  // ---------------------------------------------------------------------------
  // Jira Helpers
  // ---------------------------------------------------------------------------
  async function testJira() {
    setCheckingJira(true)
    try {
      const res = await api<{ status: JiraConnectionStatus }>('/api/coordinator/jira/status')
      setJiraStatus(res.status)
      setJiraModalOpen(true)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Jira status check failed.', 'error')
    } finally {
      setCheckingJira(false)
    }
  }

  function openJiraCreate(type: 'risk' | 'incident', item: Risk | Incident) {
    const isRisk = type === 'risk'
    const risk = isRisk ? (item as Risk) : null
    const inc = !isRisk ? (item as Incident) : null

    const ref = risk ? risk.code : inc?.reference || ''
    const title = item.title
    const desc = isRisk
      ? `Technical Risk: ${risk?.description}\nMitigation: ${risk?.mitigation}\nContingency: ${risk?.contingency}`
      : `Operational Incident: ${inc?.description || 'No description'}\nCategory: ${inc?.category}\nPriority: ${inc?.priority}`

    setJiraCreateTarget({
      type,
      id: item.id,
      ref,
      title,
      description: desc,
      defaultType: !isRisk && inc?.category === 'Data accuracy' ? 'Bug' : 'Task',
    })
    setJiraSummary(`[VEYORA: ${ref}] ${title}`)
    setJiraDescription(desc)
    setJiraIssueType(!isRisk && inc?.category === 'Data accuracy' ? 'Bug' : 'Task')
    setJiraCreateError('')
  }

  async function submitJiraCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!jiraCreateTarget) return

    setJiraCreateBusy(true)
    setJiraCreateError('')

    try {
      await api('/api/coordinator/jira/create-issue', {
        method: 'POST',
        body: {
          entity_type: jiraCreateTarget.type,
          entity_id: jiraCreateTarget.id,
          summary: jiraSummary.trim(),
          description: jiraDescription.trim(),
          issue_type: jiraIssueType,
        },
      })
      toast('Jira issue created and linked successfully.', 'success')
      setJiraCreateTarget(null)
      if (jiraCreateTarget.type === 'risk') void loadRisks()
      else void loadIncidents()
    } catch (err) {
      setJiraCreateError(err instanceof ApiError ? err.message : 'Failed to create Jira issue.')
    } finally {
      setJiraCreateBusy(false)
    }
  }

  function openJiraLink(type: 'risk' | 'incident', item: Risk | Incident) {
    const ref = 'code' in item ? item.code : item.reference
    setJiraLinkTarget({ type, id: item.id, ref })
    setJiraLinkKey('')
    setJiraLinkError('')
  }

  async function submitJiraLink(e: React.FormEvent) {
    e.preventDefault()
    if (!jiraLinkTarget) return

    setJiraLinkBusy(true)
    setJiraLinkError('')

    try {
      await api('/api/coordinator/jira/link-issue', {
        method: 'POST',
        body: {
          entity_type: jiraLinkTarget.type,
          entity_id: jiraLinkTarget.id,
          jira_key: jiraLinkKey.trim(),
        },
      })
      toast('Jira issue verified and linked.', 'success')
      setJiraLinkTarget(null)
      if (jiraLinkTarget.type === 'risk') void loadRisks()
      else void loadIncidents()
    } catch (err) {
      setJiraLinkError(err instanceof ApiError ? err.message : 'Failed to link Jira issue.')
    } finally {
      setJiraLinkBusy(false)
    }
  }

  async function refreshJiraStatus(type: 'risk' | 'incident', id: number) {
    try {
      await api('/api/coordinator/jira/refresh-status', {
        method: 'POST',
        body: { entity_type: type, entity_id: id },
      })
      toast('Jira status refreshed from Cloud.', 'success')
      if (type === 'risk') void loadRisks()
      else void loadIncidents()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Unable to refresh Jira status.', 'error')
    }
  }

  // ---------------------------------------------------------------------------
  // Risk Actions
  // ---------------------------------------------------------------------------
  const openCreateRisk = () => {
    setRiskForm(emptyRiskForm)
    setCreatingRisk(true)
    setRiskFormError(null)
  }

  const openEditRisk = (r: Risk) => {
    setEditingRisk(r)
    setRiskForm({
      title: r.title,
      description: r.description,
      category: r.category,
      probability: r.probability,
      impact: r.impact,
      owner: r.owner,
      mitigation: r.mitigation,
      contingency: r.contingency,
      control_status: r.control_status,
      review_date: r.review_date ?? '',
      linked_requirement: r.linked_requirement ?? '',
      linked_verification: r.linked_verification ?? '',
    })
    setRiskFormError(null)
  }

  const saveRisk = async () => {
    if (!riskForm.title.trim()) {
      setRiskFormError('Title is required.')
      return
    }
    setRiskBusy(true)
    setRiskFormError(null)
    const body = { ...riskForm, review_date: riskForm.review_date || null }
    try {
      if (editingRisk) {
        await api(`/api/risks/${editingRisk.id}`, { method: 'PATCH', body })
        toast('Risk updated.', 'success')
      } else {
        await api('/api/risks', { method: 'POST', body })
        toast('Risk added to register.', 'success')
      }
      setEditingRisk(null)
      setCreatingRisk(false)
      await loadRisks()
    } catch (err) {
      setRiskFormError(err instanceof ApiError ? err.message : 'Could not save the risk.')
    } finally {
      setRiskBusy(false)
    }
  }

  const actRisk = async (r: Risk, action: 'close' | 'reopen') => {
    await api(`/api/risks/${r.id}`, { method: 'PATCH', body: { action } })
    toast(action === 'close' ? `${r.code} closed.` : `${r.code} reopened.`, 'success')
    await loadRisks()
  }

  // ---------------------------------------------------------------------------
  // Incident Actions
  // ---------------------------------------------------------------------------
  function openCreateIncident() {
    setIncidentTitle('')
    setIncidentDesc('')
    setIncCategoryVal('Other')
    setIncPriorityVal('Medium')
    setLinkedApptId('')
    setLinkedRiskId('')
    setIncidentFormError(null)
    setCreatingIncident(true)
  }

  async function handleCreateIncidentSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!incidentTitle.trim()) {
      setIncidentFormError('Title is required.')
      return
    }
    setIncidentSubmitting(true)
    setIncidentFormError(null)

    try {
      await api('/api/coordinator/incidents', {
        method: 'POST',
        body: {
          title: incidentTitle.trim(),
          description: incidentDesc.trim(),
          category: incCategoryVal,
          priority: incPriorityVal,
          appointment_id: linkedApptId.trim() ? Number(linkedApptId) : null,
          risk_id: linkedRiskId.trim() ? Number(linkedRiskId) : null,
        },
      })
      toast('Incident reported successfully.', 'success')
      setCreatingIncident(false)
      await loadIncidents()
    } catch (err) {
      setIncidentFormError(err instanceof ApiError ? err.message : 'Failed to report incident.')
    } finally {
      setIncidentSubmitting(false)
    }
  }

  async function transitionIncident(inc: Incident, targetStatus: IncidentStatus) {
    if (targetStatus === 'Resolved') {
      setResolvingIncident(inc)
      setResolutionNote('')
      setResolveError('')
      return
    }
    if (targetStatus === 'Open' && inc.status === 'Resolved') {
      setReopeningIncident(inc)
      setReopenReason('')
      return
    }

    try {
      await api(`/api/coordinator/incidents/${inc.id}`, {
        method: 'PATCH',
        body: { status: targetStatus },
      })
      toast(`Incident status moved to ${targetStatus}.`, 'success')
      await loadIncidents()
      if (selectedIncident?.id === inc.id) {
        const updated = await api<{ incident: Incident }>(`/api/coordinator/incidents/${inc.id}`)
        setSelectedIncident(updated.incident)
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Status transition failed.', 'error')
    }
  }

  async function submitResolveIncident(e: React.FormEvent) {
    e.preventDefault()
    if (!resolvingIncident) return
    if (!resolutionNote.trim()) {
      setResolveError('A resolution note is mandatory to resolve an incident.')
      return
    }

    setResolvingBusy(true)
    setResolveError('')

    try {
      await api(`/api/coordinator/incidents/${resolvingIncident.id}`, {
        method: 'PATCH',
        body: {
          status: 'Resolved',
          resolution_note: resolutionNote.trim(),
        },
      })
      toast(`Incident ${resolvingIncident.reference} marked as Resolved.`, 'success')
      setResolvingIncident(null)
      await loadIncidents()
      if (selectedIncident?.id === resolvingIncident.id) {
        const updated = await api<{ incident: Incident }>(
          `/api/coordinator/incidents/${resolvingIncident.id}`
        )
        setSelectedIncident(updated.incident)
      }
    } catch (err) {
      setResolveError(err instanceof ApiError ? err.message : 'Failed to resolve incident.')
    } finally {
      setResolvingBusy(false)
    }
  }

  async function submitReopenIncident(e: React.FormEvent) {
    e.preventDefault()
    if (!reopeningIncident) return

    setReopenBusy(true)
    try {
      await api(`/api/coordinator/incidents/${reopeningIncident.id}`, {
        method: 'PATCH',
        body: {
          status: 'Open',
          reopen_reason: reopenReason.trim() || 'Reopened for investigation',
        },
      })
      toast(`Incident ${reopeningIncident.reference} reopened.`, 'success')
      setReopeningIncident(null)
      await loadIncidents()
      if (selectedIncident?.id === reopeningIncident.id) {
        const updated = await api<{ incident: Incident }>(
          `/api/coordinator/incidents/${reopeningIncident.id}`
        )
        setSelectedIncident(updated.incident)
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to reopen incident.', 'error')
    } finally {
      setReopenBusy(false)
    }
  }

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">Risks & incidents</h1>
          <p className="page-sub">
            Risk mitigation planning alongside verified operational incident logging and Jira Cloud synchronization.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline" size="sm" onClick={() => void testJira()} disabled={checkingJira}>
            {checkingJira ? 'Checking…' : '⚙ Jira connection'}
          </Button>
          {activeTab === 'risks' ? (
            <Button onClick={openCreateRisk}>Add risk</Button>
          ) : (
            <Button onClick={openCreateIncident}>Report incident</Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setActiveTab('risks')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'risks' ? 700 : 500,
            color: activeTab === 'risks' ? 'var(--accent)' : 'var(--muted)',
            borderBottom: activeTab === 'risks' ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1,
            fontSize: '1rem',
          }}
        >
          ⚠ Risk register
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('incidents')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === 'incidents' ? 700 : 500,
            color: activeTab === 'incidents' ? 'var(--accent)' : 'var(--muted)',
            borderBottom: activeTab === 'incidents' ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1,
            fontSize: '1rem',
          }}
        >
          📋 Reported incidents ({incidents.length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: RISK REGISTER */}
      {/* ========================================================================= */}
      {activeTab === 'risks' && (
        <>
          {riskMetrics && (
            <div className="metric-row">
              {[
                ['Open', riskMetrics.open],
                ['Critical', riskMetrics.critical],
                ['High', riskMetrics.high],
                ['Moderate', riskMetrics.moderate],
                ['Low', riskMetrics.low],
                ['Closed', riskMetrics.closed],
              ].map(([label, val]) => (
                <div className="metric" key={label as string}>
                  <span className="metric-value">{val}</span>
                  <span className="metric-label">{label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid-2 mt-16">
            <Card title="Heatmap (5 × 5)">
              <RiskMatrix risks={risks} onSelect={openEditRisk} />
            </Card>

            <Card title="Filter & Criteria">
              <Field label="Search" htmlFor="risk-q">
                <input
                  id="risk-q"
                  className="input"
                  value={riskQ}
                  placeholder="Search title, code…"
                  onChange={(e) => setRiskQ(e.target.value)}
                />
              </Field>
              <div className="filter-pair">
                <Field label="Category" htmlFor="risk-cat">
                  <select
                    id="risk-cat"
                    className="input"
                    value={riskCategory}
                    onChange={(e) => setRiskCategory(e.target.value)}
                  >
                    <option>All</option>
                    {RISK_CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Status" htmlFor="risk-status">
                  <select
                    id="risk-status"
                    className="input"
                    value={riskStatus}
                    onChange={(e) => setRiskStatus(e.target.value)}
                  >
                    <option>All</option>
                    <option>OPEN</option>
                    <option>CLOSED</option>
                  </select>
                </Field>
              </div>
              <p className="card-foot-note">
                <strong>Risk Definition:</strong> Proactive identification of potential failure modes (P × I). Jira tasks can be linked directly for mitigation work.
              </p>
            </Card>
          </div>

          <Card title={`Risks (${risks.length})`} className="mt-16" padded={false}>
            {risks.length === 0 ? (
              <p className="empty-note pad-16">No risks match the current filters.</p>
            ) : (
              <div className="table-wrap" role="region" tabIndex={0} aria-label="Risk register table">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Title</th>
                      <th>Category</th>
                      <th className="num">P</th>
                      <th className="num">I</th>
                      <th className="num">Score</th>
                      <th>Band</th>
                      <th>Control</th>
                      <th>Jira Link</th>
                      <th>Status</th>
                      <th className="row-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risks.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <button className="link-like" onClick={() => openEditRisk(r)}>
                            {r.code}
                          </button>
                        </td>
                        <td>
                          <strong>{r.title}</strong>
                        </td>
                        <td>{r.category}</td>
                        <td className="num">{r.probability}</td>
                        <td className="num">{r.impact}</td>
                        <td className="num">
                          <strong>{r.score}</strong>
                        </td>
                        <td>
                          <StatusBadge status={r.band} />
                        </td>
                        <td>
                          <StatusBadge status={r.control_status} />
                        </td>
                        <td>
                          {r.jira_key ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <a
                                href={r.jira_url || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="badge badge-info"
                                style={{ fontFamily: 'monospace' }}
                              >
                                {r.jira_key}
                              </a>
                              <button
                                type="button"
                                title="Refresh Jira status"
                                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                                onClick={() => void refreshJiraStatus('risk', r.id)}
                              >
                                ↻
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                              onClick={() => openJiraCreate('risk', r)}
                            >
                              + Jira
                            </button>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="row-actions">
                          {r.status === 'OPEN' ? (
                            <Button size="sm" variant="ghost" onClick={() => actRisk(r, 'close')}>
                              Close
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => actRisk(r, 'reopen')}>
                              Reopen
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: REPORTED INCIDENTS */}
      {/* ========================================================================= */}
      {activeTab === 'incidents' && (
        <>
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              backgroundColor: 'var(--surface-muted)',
              marginBottom: 20,
              fontSize: '0.9rem',
              lineHeight: 1.5,
              border: '1px solid var(--border)',
            }}
          >
            <strong>Operational Incident Register</strong>: Records real, observed operational issues, bugs, availability anomalies, or data entry errors reported by clinic staff.
            Priorities represent operational escalation urgency, not medical triage.
          </div>

          <Card padded style={{ marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <Field label="Search incidents">
                <input
                  type="text"
                  placeholder="Reference, title, description…"
                  value={incidentQ}
                  onChange={(e) => setIncidentQ(e.target.value)}
                />
              </Field>

              <Field label="Category">
                <select
                  value={incidentCategory}
                  onChange={(e) => setIncidentCategory(e.target.value)}
                >
                  <option>All</option>
                  {INCIDENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Priority">
                <select
                  value={incidentPriority}
                  onChange={(e) => setIncidentPriority(e.target.value)}
                >
                  <option>All</option>
                  {INCIDENT_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Status">
                <select
                  value={incidentStatus}
                  onChange={(e) => setIncidentStatus(e.target.value)}
                >
                  <option>All</option>
                  <option value="Open">Open</option>
                  <option value="In progress">In progress</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </Field>
            </div>
          </Card>

          <Card padded={false}>
            {incidentsLoading ? (
              <div className="page-loading" style={{ minHeight: 200 }} role="status">
                <span className="spinner" aria-hidden="true" />
                <span>Loading incidents…</span>
              </div>
            ) : incidents.length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--muted)' }}>
                <p style={{ fontSize: '1.1rem', marginBottom: 8 }}>No incidents match your criteria.</p>
                <small>Use the "Report incident" button above to log a new operational issue.</small>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Linked Ref</th>
                      <th>Jira Issue</th>
                      <th>Reported Date</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((inc) => (
                      <tr key={inc.id}>
                        <td>
                          <button
                            type="button"
                            className="link-like"
                            style={{ fontFamily: 'monospace', fontWeight: 600 }}
                            onClick={async () => {
                              try {
                                const full = await api<{ incident: Incident }>(`/api/coordinator/incidents/${inc.id}`)
                                setSelectedIncident(full.incident)
                              } catch {
                                setSelectedIncident(inc)
                              }
                            }}
                          >
                            {inc.reference}
                          </button>
                        </td>
                        <td>
                          <strong>{inc.title}</strong>
                        </td>
                        <td>{inc.category}</td>
                        <td>
                          <StatusBadge status={inc.priority} />
                        </td>
                        <td>
                          <StatusBadge status={inc.status} />
                        </td>
                        <td>
                          {inc.appointment_ref && (
                            <span className="badge badge-neutral" style={{ marginRight: 4, fontFamily: 'monospace' }}>
                              {inc.appointment_ref}
                            </span>
                          )}
                          {inc.risk_code && (
                            <span className="badge badge-neutral" style={{ fontFamily: 'monospace' }}>
                              {inc.risk_code}
                            </span>
                          )}
                          {!inc.appointment_ref && !inc.risk_code && '—'}
                        </td>
                        <td>
                          {inc.jira_key ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <a
                                href={inc.jira_url || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="badge badge-info"
                                style={{ fontFamily: 'monospace' }}
                              >
                                {inc.jira_key}
                              </a>
                              <button
                                type="button"
                                title="Refresh Jira status"
                                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                                onClick={() => void refreshJiraStatus('incident', inc.id)}
                              >
                                ↻
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                              onClick={() => openJiraCreate('incident', inc)}
                            >
                              + Jira
                            </button>
                          )}
                        </td>
                        <td>{formatApptDate(inc.created_at.slice(0, 10))}</td>
                        <td style={{ textAlign: 'right' }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              try {
                                const full = await api<{ incident: Incident }>(`/api/coordinator/incidents/${inc.id}`)
                                setSelectedIncident(full.incident)
                              } catch {
                                setSelectedIncident(inc)
                              }
                            }}
                          >
                            Details →
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL: INCIDENT DETAILS & LIFECYCLE */}
      {/* ========================================================================= */}
      {selectedIncident && (
        <Modal
          open={Boolean(selectedIncident)}
          onClose={() => setSelectedIncident(null)}
          title={`Incident ${selectedIncident.reference}: ${selectedIncident.title}`}
          wide
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Meta Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, fontSize: '0.9rem' }}>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Operational Status</span>
                <StatusBadge status={selectedIncident.status} />
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Operational Priority</span>
                <StatusBadge status={selectedIncident.priority} />
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Category</span>
                <strong>{selectedIncident.category}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Reported By</span>
                <strong>{selectedIncident.reported_by_name}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Linked Appointment</span>
                <strong>{selectedIncident.appointment_ref || 'None'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', display: 'block' }}>Linked Risk</span>
                <strong>{selectedIncident.risk_code || 'None'}</strong>
              </div>
            </div>

            {/* Description */}
            <div>
              <span style={{ color: 'var(--muted)', display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>
                Description & Observed Behavior
              </span>
              <div style={{ padding: 12, borderRadius: 6, backgroundColor: 'var(--surface-muted)', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                {selectedIncident.description || 'No description provided.'}
              </div>
            </div>

            {/* Resolution Note if resolved */}
            {selectedIncident.status === 'Resolved' && (
              <div style={{ padding: 12, borderRadius: 6, border: '1px solid #10B981', backgroundColor: 'rgba(16, 185, 129, 0.05)' }}>
                <strong style={{ color: '#059669', display: 'block', marginBottom: 4 }}>
                  ✓ Resolution Note ({formatApptDate(selectedIncident.resolved_at?.slice(0, 10) || '')}):
                </strong>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>{selectedIncident.resolution_note}</p>
              </div>
            )}

            {/* Jira Integration Section */}
            <div style={{ padding: 14, borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong>Jira Cloud Integration</strong>
                {selectedIncident.jira_key && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void refreshJiraStatus('incident', selectedIncident.id)}
                  >
                    ↻ Refresh status
                  </Button>
                )}
              </div>

              {selectedIncident.jira_key ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: '0.9rem' }}>
                  <span>
                    Linked Issue:{' '}
                    <a
                      href={selectedIncident.jira_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontWeight: 700, color: 'var(--accent)', textDecoration: 'underline' }}
                    >
                      {selectedIncident.jira_key} ↗
                    </a>
                  </span>
                  <span>
                    Jira Status: <strong>{selectedIncident.jira_status || 'Unknown'}</strong>
                  </span>
                  {selectedIncident.jira_updated_at && (
                    <small style={{ color: 'var(--muted)' }}>
                      Last checked: {selectedIncident.jira_updated_at.slice(0, 16).replace('T', ' ')} UTC
                    </small>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Button size="sm" variant="outline" onClick={() => openJiraCreate('incident', selectedIncident)}>
                    Create Jira issue
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openJiraLink('incident', selectedIncident)}>
                    Link existing issue
                  </Button>
                </div>
              )}
            </div>

            {/* Append-only Activity History */}
            <div>
              <strong style={{ display: 'block', marginBottom: 8 }}>Activity History (Audit Trail)</strong>
              {(!selectedIncident.activities || selectedIncident.activities.length === 0) ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No activity records recorded.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                  {selectedIncident.activities.map((act) => (
                    <div
                      key={act.id}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        backgroundColor: 'var(--surface-muted)',
                        fontSize: '0.82rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div>
                        <strong>{act.action}</strong> by {act.actor_name}: {act.details}
                      </div>
                      <small style={{ color: 'var(--muted)', whiteSpace: 'nowrap', marginLeft: 10 }}>
                        {act.created_at.slice(0, 16).replace('T', ' ')}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lifecycle Transition Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {selectedIncident.status === 'Open' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void transitionIncident(selectedIncident, 'In progress')}
                  >
                    Move to In progress
                  </Button>
                )}
                {selectedIncident.status !== 'Resolved' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void transitionIncident(selectedIncident, 'Resolved')}
                  >
                    Resolve incident…
                  </Button>
                )}
                {selectedIncident.status === 'Resolved' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void transitionIncident(selectedIncident, 'Open')}
                  >
                    Reopen incident…
                  </Button>
                )}
              </div>

              <Button variant="ghost" onClick={() => setSelectedIncident(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REPORT INCIDENT */}
      {/* ========================================================================= */}
      {creatingIncident && (
        <Modal
          open={creatingIncident}
          onClose={() => setCreatingIncident(false)}
          title="Report operational incident"
        >
          <form onSubmit={handleCreateIncidentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {incidentFormError && (
              <div className="alert alert-danger" role="alert">
                {incidentFormError}
              </div>
            )}

            <Field label="Incident Title" hint="Clear, concise summary of the issue (max 160 chars)">
              <input
                type="text"
                required
                maxLength={160}
                placeholder="e.g. Booking conflict on Doctor slot"
                value={incidentTitle}
                onChange={(e) => setIncidentTitle(e.target.value)}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Category">
                <select
                  value={incCategoryVal}
                  onChange={(e) => setIncCategoryVal(e.target.value as IncidentCategory)}
                >
                  {INCIDENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Operational Priority">
                <select
                  value={incPriorityVal}
                  onChange={(e) => setIncPriorityVal(e.target.value as IncidentPriority)}
                >
                  {INCIDENT_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field
              label="Description & Context"
              hint="Focus on operational/software behavior. Exclude unnecessary patient clinical data."
            >
              <textarea
                rows={4}
                required
                placeholder="Describe what occurred, steps observed, and system error messages…"
                value={incidentDesc}
                onChange={(e) => setIncidentDesc(e.target.value)}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Linked Appointment ID (optional)" hint="e.g. 1">
                <input
                  type="number"
                  placeholder="ID number"
                  value={linkedApptId}
                  onChange={(e) => setLinkedApptId(e.target.value)}
                />
              </Field>

              <Field label="Linked Risk ID (optional)" hint="e.g. 2">
                <input
                  type="number"
                  placeholder="ID number"
                  value={linkedRiskId}
                  onChange={(e) => setLinkedRiskId(e.target.value)}
                />
              </Field>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <Button type="button" variant="ghost" onClick={() => setCreatingIncident(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={incidentSubmitting}>
                {incidentSubmitting ? 'Reporting…' : 'Submit report'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RESOLVE INCIDENT (Mandatory Note) */}
      {/* ========================================================================= */}
      {resolvingIncident && (
        <Modal
          open={Boolean(resolvingIncident)}
          onClose={() => setResolvingIncident(null)}
          title={`Resolve Incident ${resolvingIncident.reference}`}
        >
          <form onSubmit={submitResolveIncident} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {resolveError && (
              <div className="alert alert-danger" role="alert">
                {resolveError}
              </div>
            )}

            <p style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: 0 }}>
              Resolving an incident requires a documented resolution note detailing how the operational problem was rectified.
            </p>

            <Field label="Mandatory Resolution Note" hint="Describe the corrective action taken, software patch applied, or workflow adjustment.">
              <textarea
                rows={4}
                required
                placeholder="e.g. Checked database lock timeouts and increased worker pool; appointment slots synchronized."
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
              />
            </Field>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setResolvingIncident(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={resolvingBusy}>
                {resolvingBusy ? 'Resolving…' : 'Confirm resolution'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REOPEN INCIDENT */}
      {/* ========================================================================= */}
      {reopeningIncident && (
        <Modal
          open={Boolean(reopeningIncident)}
          onClose={() => setReopeningIncident(null)}
          title={`Reopen Incident ${reopeningIncident.reference}`}
        >
          <form onSubmit={submitReopenIncident} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)', margin: 0 }}>
              Moving this incident back to Open status for further operational review.
            </p>

            <Field label="Reopen Reason / Follow-up Notes">
              <input
                type="text"
                placeholder="e.g. Issue recurred during evening clinic hours."
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
              />
            </Field>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setReopeningIncident(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={reopenBusy}>
                {reopenBusy ? 'Reopening…' : 'Confirm reopen'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE JIRA ISSUE */}
      {/* ========================================================================= */}
      {jiraCreateTarget && (
        <Modal
          open={Boolean(jiraCreateTarget)}
          onClose={() => setJiraCreateTarget(null)}
          title={`Create Jira Cloud Issue for ${jiraCreateTarget.ref}`}
        >
          <form onSubmit={submitJiraCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {jiraCreateError && (
              <div className="alert alert-danger" role="alert">
                {jiraCreateError}
              </div>
            )}

            <Field label="Jira Issue Summary" hint="Title sent to the configured Jira project">
              <input
                type="text"
                required
                maxLength={255}
                value={jiraSummary}
                onChange={(e) => setJiraSummary(e.target.value)}
              />
            </Field>

            <Field label="Issue Type">
              <select
                value={jiraIssueType}
                onChange={(e) => setJiraIssueType(e.target.value)}
              >
                <option value="Task">Task (Risk mitigation / Operational work)</option>
                <option value="Bug">Bug (Software defect)</option>
              </select>
            </Field>

            <Field
              label="Jira Description (ADF format)"
              hint="Review content before transmission. Ensure no patient clinical logs are included."
            >
              <textarea
                rows={5}
                required
                value={jiraDescription}
                onChange={(e) => setJiraDescription(e.target.value)}
              />
            </Field>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setJiraCreateTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={jiraCreateBusy}>
                {jiraCreateBusy ? 'Creating in Jira…' : 'Create & link issue'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: LINK EXISTING JIRA ISSUE */}
      {/* ========================================================================= */}
      {jiraLinkTarget && (
        <Modal
          open={Boolean(jiraLinkTarget)}
          onClose={() => setJiraLinkTarget(null)}
          title={`Link existing Jira issue to ${jiraLinkTarget.ref}`}
        >
          <form onSubmit={submitJiraLink} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {jiraLinkError && (
              <div className="alert alert-danger" role="alert">
                {jiraLinkError}
              </div>
            )}

            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
              Enter an existing issue key from your configured Jira project. VEYORA will verify the issue exists and pull its current status.
            </p>

            <Field label="Jira Issue Key" hint="e.g. VEY-42 or PROJ-101">
              <input
                type="text"
                required
                placeholder="PROJ-123"
                value={jiraLinkKey}
                onChange={(e) => setJiraLinkKey(e.target.value.toUpperCase())}
              />
            </Field>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setJiraLinkTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={jiraLinkBusy}>
                {jiraLinkBusy ? 'Verifying…' : 'Verify & link'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: JIRA CONNECTION STATUS */}
      {/* ========================================================================= */}
      {jiraModalOpen && (
        <Modal
          open={jiraModalOpen}
          onClose={() => setJiraModalOpen(false)}
          title="Jira Cloud Connection Status"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {jiraStatus?.connected ? (
              <div style={{ padding: 14, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid #10B981' }}>
                <strong style={{ color: '#059669', display: 'block', marginBottom: 6 }}>
                  ✓ Connected to Jira Cloud
                </strong>
                <p style={{ fontSize: '0.9rem', margin: '0 0 6px 0' }}>{jiraStatus.message}</p>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  <div>Site: <strong>{jiraStatus.site_url}</strong></div>
                  <div>Project: <strong>{jiraStatus.project_name} ({jiraStatus.project_key})</strong></div>
                  <div>Authenticated User: <strong>{jiraStatus.user}</strong></div>
                </div>
              </div>
            ) : jiraStatus?.configured ? (
              <div style={{ padding: 14, borderRadius: 8, backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid #EF4444' }}>
                <strong style={{ color: '#DC2626', display: 'block', marginBottom: 6 }}>
                  ⚠ Jira Authentication / Project Error
                </strong>
                <p style={{ fontSize: '0.9rem', margin: 0 }}>{jiraStatus.message}</p>
              </div>
            ) : (
              <div style={{ padding: 14, borderRadius: 8, backgroundColor: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <strong style={{ display: 'block', marginBottom: 6 }}>
                  Jira Cloud Not Configured
                </strong>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 10px 0' }}>
                  {jiraStatus?.message || 'Set JIRA_SITE_URL, JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_PROJECT_KEY in your backend .env file.'}
                </p>
                <div style={{ backgroundColor: '#182521', color: '#F7F8F5', padding: 10, borderRadius: 6, fontSize: '0.78rem', fontFamily: 'monospace' }}>
                  JIRA_SITE_URL=https://your-domain.atlassian.net<br />
                  JIRA_EMAIL=your-email@example.com<br />
                  JIRA_API_TOKEN=your-token<br />
                  JIRA_PROJECT_KEY=VEY
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="ghost" onClick={() => setJiraModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT RISK */}
      {/* ========================================================================= */}
      <Modal
        open={creatingRisk || editingRisk !== null}
        onClose={() => {
          setCreatingRisk(false)
          setEditingRisk(null)
        }}
        title={editingRisk ? `Edit ${editingRisk.code}` : 'Add risk'}
        wide
      >
        <div className="form-grid">
          <Field label="Title" htmlFor="rf-title">
            <input
              id="rf-title"
              className="input"
              value={riskForm.title}
              onChange={(e) => setRiskForm({ ...riskForm, title: e.target.value })}
            />
          </Field>
          <Field label="Category" htmlFor="rf-cat">
            <select
              id="rf-cat"
              className="input"
              value={riskForm.category}
              onChange={(e) => setRiskForm({ ...riskForm, category: e.target.value })}
            >
              {RISK_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Description" htmlFor="rf-desc">
            <textarea
              id="rf-desc"
              className="input"
              rows={3}
              value={riskForm.description}
              onChange={(e) => setRiskForm({ ...riskForm, description: e.target.value })}
            />
          </Field>
          <div className="filter-pair">
            <Field label="Probability (1–5)" htmlFor="rf-p">
              <select
                id="rf-p"
                className="input"
                value={riskForm.probability}
                onChange={(e) => setRiskForm({ ...riskForm, probability: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Impact (1–5)" htmlFor="rf-i">
              <select
                id="rf-i"
                className="input"
                value={riskForm.impact}
                onChange={(e) => setRiskForm({ ...riskForm, impact: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="score-preview">
            Score: <strong>{riskForm.probability * riskForm.impact}</strong>
          </p>
          <div className="filter-pair">
            <Field label="Control status" htmlFor="rf-cs">
              <select
                id="rf-cs"
                className="input"
                value={riskForm.control_status}
                onChange={(e) => setRiskForm({ ...riskForm, control_status: e.target.value })}
              >
                <option>Planned</option>
                <option>Implemented</option>
                <option>Verified</option>
              </select>
            </Field>
            <Field label="Review date" htmlFor="rf-rd">
              <input
                id="rf-rd"
                type="date"
                className="input"
                value={riskForm.review_date}
                onChange={(e) => setRiskForm({ ...riskForm, review_date: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Mitigation" htmlFor="rf-mit">
            <textarea
              id="rf-mit"
              className="input"
              rows={2}
              value={riskForm.mitigation}
              onChange={(e) => setRiskForm({ ...riskForm, mitigation: e.target.value })}
            />
          </Field>
          <Field label="Contingency" htmlFor="rf-con">
            <textarea
              id="rf-con"
              className="input"
              rows={2}
              value={riskForm.contingency}
              onChange={(e) => setRiskForm({ ...riskForm, contingency: e.target.value })}
            />
          </Field>
          <div className="filter-pair">
            <Field label="Linked requirement" htmlFor="rf-req">
              <input
                id="rf-req"
                className="input"
                placeholder="REQ-BOOK-02"
                value={riskForm.linked_requirement}
                onChange={(e) => setRiskForm({ ...riskForm, linked_requirement: e.target.value })}
              />
            </Field>
            <Field label="Linked verification" htmlFor="rf-ver">
              <input
                id="rf-ver"
                className="input"
                placeholder="VER-BOOK-02"
                value={riskForm.linked_verification}
                onChange={(e) => setRiskForm({ ...riskForm, linked_verification: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Owner" htmlFor="rf-owner">
            <input
              id="rf-owner"
              className="input"
              value={riskForm.owner}
              onChange={(e) => setRiskForm({ ...riskForm, owner: e.target.value })}
            />
          </Field>
        </div>
        {riskFormError && (
          <p className="form-error" role="alert">
            {riskFormError}
          </p>
        )}
        <div className="step-actions">
          <Button
            variant="ghost"
            onClick={() => {
              setCreatingRisk(false)
              setEditingRisk(null)
            }}
          >
            Cancel
          </Button>
          <Button loading={riskBusy} onClick={saveRisk}>
            Save risk
          </Button>
        </div>
      </Modal>
    </motion.div>
  )
}
