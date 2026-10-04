import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { api, ApiError } from '../../lib/api'
import type { Milestone, Risk } from '../../lib/types'
import { Button, Card, Field, StatusBadge } from '../../components/ui'
import { useToast } from '../../state/ToastContext'

interface DeliveryPlan {
  deadline: string
  available_hours: number
  remaining_hours: number
  buffer_hours: number
  required_hours: number
  capacity_gap: number
  jira_url: string
}

interface PlanForm {
  deadline: string
  available: string
  remaining: string
  buffer: string
  jira: string
}

const emptyForm: PlanForm = {
  deadline: '',
  available: '',
  remaining: '',
  buffer: '',
  jira: '',
}

function todayIST() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${get('year')}-${get('month')}-${get('day')}`
}

function message(error: unknown) {
  return error instanceof ApiError ? error.message : 'Unable to save. Please retry.'
}

export default function Plan() {
  const reduced = useReducedMotion()
  const { toast } = useToast()

  const [saved, setSaved] = useState<DeliveryPlan | null>(null)
  const [form, setForm] = useState<PlanForm>(emptyForm)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [risks, setRisks] = useState<Risk[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  const saving = useRef(false)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setLoadError('')

      try {
        const [planData, milestoneData, riskData] = await Promise.all([
          api<{ plan: DeliveryPlan | null }>('/api/delivery-plan'),
          api<{ milestones: Milestone[] }>('/api/milestones'),
          api<{ risks: Risk[] }>('/api/risks'),
        ])

        if (!active) return

        setSaved(planData.plan)
        setMilestones(milestoneData.milestones)
        setRisks(riskData.risks)

        if (planData.plan) {
          const plan = planData.plan
          setForm({
            deadline: plan.deadline,
            available: String(plan.available_hours),
            remaining: String(plan.remaining_hours),
            buffer: String(plan.buffer_hours),
            jira: plan.jira_url,
          })
        } else {
          setForm(emptyForm)
        }
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof ApiError
              ? error.message
              : 'Unable to load the delivery plan.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [retry])

  function change(field: keyof PlanForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return

    saving.current = true
    setBusy('plan')
    setSaveError('')

    try {
      const response = await api<{ plan: DeliveryPlan }>('/api/delivery-plan', {
        method: 'PUT',
        body: {
          deadline: form.deadline,
          available_hours: Number(form.available),
          remaining_hours: Number(form.remaining),
          buffer_hours: Number(form.buffer),
          jira_url: form.jira.trim(),
        },
      })

      setSaved(response.plan)
      toast('Delivery plan saved.', 'success')
    } catch (error) {
      setSaveError(message(error))
    } finally {
      saving.current = false
      setBusy(null)
    }
  }

  function editMilestone(id: number, changes: Partial<Milestone>) {
    setMilestones((current) =>
      current.map((item) => item.id === id ? { ...item, ...changes } : item),
    )
  }

  async function saveMilestone(
    event: FormEvent<HTMLFormElement>,
    milestone: Milestone,
  ) {
    event.preventDefault()
    if (saving.current) return

    saving.current = true
    setBusy(String(milestone.id))
    setSaveError('')

    try {
      const response = await api<{ milestone: Milestone }>(
        `/api/milestones/${milestone.id}`,
        {
          method: 'PATCH',
          body: {
            due_date: milestone.due_date,
            status: milestone.status,
            notes: milestone.notes,
          },
        },
      )

      editMilestone(milestone.id, response.milestone)
      toast('Milestone saved.', 'success')
    } catch (error) {
      setSaveError(message(error))
    } finally {
      saving.current = false
      setBusy(null)
    }
  }

  const urgentRisks = risks
    .filter((risk) => risk.status === 'OPEN' && risk.score >= 10)
    .sort((a, b) => b.score - a.score)

  const today = todayIST()
  const lateMilestones = saved
    ? milestones.filter(
        (milestone) =>
          milestone.status !== 'Done' && milestone.due_date > saved.deadline,
      )
    : []

  if (loading) {
    return <p className="empty-note" role="status">Loading delivery plan…</p>
  }

  if (loadError) {
    return (
      <Card title="Unable to load">
        <p role="alert">{loadError}</p>
        <Button onClick={() => setRetry((value) => value + 1)}>Retry</Button>
      </Card>
    )
  }

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
    >
      <div className="page-head">
        <div>
          <h1>Delivery plan</h1>
          <p className="page-sub">
            Manage the deadline, remaining effort and risks affecting delivery.
          </p>
        </div>

        {saved?.jira_url && (
          <a
            className="btn btn-outline"
            href={saved.jira_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Jira board ↗
          </a>
        )}
      </div>

      {saveError && <p className="form-error" role="alert">{saveError}</p>}

      <div className="grid-2">
        <Card title="Time and resources">
          <form onSubmit={savePlan}>
            <fieldset
              disabled={busy !== null}
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
            >
              <Field label="Project deadline" htmlFor="plan-deadline">
                <input
                  id="plan-deadline"
                  className="input"
                  type="date"
                  required
                  value={form.deadline}
                  onChange={(event) => change('deadline', event.target.value)}
                />
              </Field>

              <Field
                label="Hours available until the deadline"
                htmlFor="plan-available"
                hint="Your actual remaining capacity, including time reserved for contingency."
              >
                <input
                  id="plan-available"
                  className="input"
                  type="number"
                  min="0"
                  max="10000"
                  step="0.25"
                  required
                  value={form.available}
                  onChange={(event) => change('available', event.target.value)}
                />
              </Field>

              <Field label="Estimated work remaining (hours)" htmlFor="plan-remaining">
                <input
                  id="plan-remaining"
                  className="input"
                  type="number"
                  min="0"
                  max="10000"
                  step="0.25"
                  required
                  value={form.remaining}
                  onChange={(event) => change('remaining', event.target.value)}
                />
              </Field>

              <Field
                label="Contingency buffer (hours)"
                htmlFor="plan-buffer"
                hint="Extra time for defects, access problems or other identified risks."
              >
                <input
                  id="plan-buffer"
                  className="input"
                  type="number"
                  min="0"
                  max="10000"
                  step="0.25"
                  required
                  value={form.buffer}
                  onChange={(event) => change('buffer', event.target.value)}
                />
              </Field>

              <Field
                label="Jira board URL"
                htmlFor="plan-jira"
                hint="Optional saved link. Tasks and sprints are managed in Jira."
              >
                <input
                  id="plan-jira"
                  className="input"
                  type="url"
                  maxLength={500}
                  placeholder="https://your-project.atlassian.net/..."
                  value={form.jira}
                  onChange={(event) => change('jira', event.target.value)}
                />
              </Field>

              <Button type="submit" loading={busy === 'plan'}>
                Save plan
              </Button>
            </fieldset>
          </form>
        </Card>

        <Card title="Delivery checks">
          {!saved ? (
            <p className="empty-note">
              Save your deadline and effort estimates to calculate capacity.
            </p>
          ) : (
            <>
              <p><strong>Saved deadline:</strong> {saved.deadline}</p>
              <p><strong>Available:</strong> {saved.available_hours} hours</p>
              <p>
                <strong>Required:</strong> {saved.remaining_hours} hours of work
                {' + '}{saved.buffer_hours} hours buffer
                {' = '}{saved.required_hours} hours
              </p>

              <p role="status">
                <strong>
                  {saved.capacity_gap < 0
                    ? `Capacity shortfall: ${Math.abs(saved.capacity_gap)} hours`
                    : `Capacity remaining after buffer: ${saved.capacity_gap} hours`}
                </strong>
              </p>

              {saved.capacity_gap < 0 && (
                <p>
                  Reduce optional scope or revise the schedule. Keep testing and
                  essential safety controls in the remaining work estimate.
                </p>
              )}

              {saved.deadline < today && (
                <p className="form-error">The saved deadline has passed.</p>
              )}

              {lateMilestones.length > 0 && (
                <p className="form-error">
                  {lateMilestones.length} unfinished milestone(s) are scheduled
                  after the saved deadline. Review their dates below.
                </p>
              )}

              <p className="card-foot-note">
                Calculations use the last saved inputs. Update estimates as work
                progresses. The Jira link does not synchronise issues.
              </p>
            </>
          )}

          <hr style={{ border: 0, borderTop: '1px solid #e3e8e4', margin: '20px 0' }} />

          <h3>High-priority open risks</h3>

          {urgentRisks.length === 0 ? (
            <p>No open High or Critical risks are recorded.</p>
          ) : (
            <ul style={{ paddingLeft: 20 }}>
              {urgentRisks.map((risk) => (
                <li key={risk.id} style={{ marginBottom: 12 }}>
                  <strong>{risk.code}: {risk.title}</strong>
                  <p className="card-foot-note">
                    Score {risk.score}/25 · Owner: {risk.owner}
                  </p>
                  <p>{risk.mitigation || 'Mitigation has not been recorded.'}</p>
                </li>
              ))}
            </ul>
          )}

          <Link className="link-sm" to="/app/risks">
            Review risk register →
          </Link>
        </Card>
      </div>

      <Card title="Milestones" className="mt-16">
        <p className="card-foot-note">
          Set realistic dates and save each milestone. Mark it Done only when its
          deliverable is complete.
        </p>

        {milestones.length === 0 && (
          <p>No milestones are recorded in the database.</p>
        )}

        {milestones.map((milestone) => (
          <form
            key={milestone.id}
            onSubmit={(event) => saveMilestone(event, milestone)}
            style={{ borderTop: '1px solid #e3e8e4', padding: '20px 0' }}
          >
            <fieldset
              disabled={busy !== null}
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  marginBottom: 12,
                }}
              >
                <strong>{milestone.title}</strong>
                <StatusBadge value={milestone.status} />
              </div>

              <div className="grid-2">
                <Field label="Due date" htmlFor={`due-${milestone.id}`}>
                  <input
                    id={`due-${milestone.id}`}
                    className="input"
                    type="date"
                    required
                    value={milestone.due_date}
                    onChange={(event) =>
                      editMilestone(milestone.id, { due_date: event.target.value })
                    }
                  />
                </Field>

                <Field label="Status" htmlFor={`status-${milestone.id}`}>
                  <select
                    id={`status-${milestone.id}`}
                    className="input"
                    value={milestone.status}
                    onChange={(event) =>
                      editMilestone(milestone.id, {
                        status: event.target.value as Milestone['status'],
                      })
                    }
                  >
                    <option>Planned</option>
                    <option>In progress</option>
                    <option>Done</option>
                  </select>
                </Field>
              </div>

              <Field label="Progress notes" htmlFor={`notes-${milestone.id}`}>
                <input
                  id={`notes-${milestone.id}`}
                  className="input"
                  maxLength={280}
                  value={milestone.notes}
                  placeholder="What is complete or blocking this milestone?"
                  onChange={(event) =>
                    editMilestone(milestone.id, { notes: event.target.value })
                  }
                />
              </Field>

              {milestone.status !== 'Done' && milestone.due_date < today && (
                <p className="form-error">This milestone is overdue.</p>
              )}

              <Button
                type="submit"
                size="sm"
                variant="outline"
                loading={busy === String(milestone.id)}
              >
                Save milestone
              </Button>
            </fieldset>
          </form>
        ))}
      </Card>
    </motion.div>
  )
}
