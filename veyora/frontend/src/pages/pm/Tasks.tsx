import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { api, ApiError } from '../../lib/api'
import type { Task, TaskStatus } from '../../lib/types'
import { Button, Card, Field, Modal, StatusBadge } from '../../components/ui'
import { useToast } from '../../state/ToastContext'

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'TODO', label: 'To Do' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'DONE', label: 'Done' },
]

export default function Tasks() {
  const reduced = useReducedMotion()
  const { toast } = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [jiraKey, setJiraKey] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const data = await api<{ tasks: Task[] }>('/api/tasks')
    setTasks(data.tasks)
  }
  useEffect(() => { load().catch(() => undefined) }, [])

  const move = async (t: Task, status: TaskStatus) => {
    await api(`/api/tasks/${t.id}`, { method: 'PATCH', body: { status } })
    setTasks((ts) => ts.map((x) => x.id === t.id ? { ...x, status } : x))
  }

  const create = async () => {
    if (!title.trim()) { setFormError('Title is required.'); return }
    setBusy(true); setFormError(null)
    try {
      await api('/api/tasks', {
        method: 'POST',
        body: { title: title.trim(), description: description.trim(),
                priority, jira_key: jiraKey.trim() || undefined },
      })
      setCreating(false); setTitle(''); setDescription(''); setJiraKey('')
      toast('Task added.', 'success')
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create task.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <div className="page-head">
        <div>
          <h1>Tasks</h1>
          <p className="page-sub">
            Small supporting board — JIRA is the official planning tool for
            this submission (see docs/jira-setup-guide.md).
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>Add task</Button>
      </div>

      <div className="board">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.status)
          return (
            <Card key={col.status} className="board-col"
                  title={<>{col.label} <span className="count">{colTasks.length}</span></>}>
              {colTasks.length === 0 && <p className="empty-note">Empty.</p>}
              {colTasks.map((t) => (
                <div key={t.id} className="task-card">
                  <div className="task-top">
                    <strong>{t.title}</strong>
                    <StatusBadge value={t.priority} />
                  </div>
                  {t.description && <p className="task-desc">{t.description}</p>}
                  <div className="task-meta">
                    {t.risk_code && <span className="link-chip">⚠ {t.risk_code}</span>}
                    {t.jira_key && <span className="link-chip">{t.jira_key}</span>}
                    <span>{t.owner}</span>
                  </div>
                  <label className="visually-hidden"
                         htmlFor={`task-status-${t.id}`}>Status for {t.title}</label>
                  <select id={`task-status-${t.id}`} className="input input-sm"
                          value={t.status}
                          onChange={(e) => move(t, e.target.value as TaskStatus)}>
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>
              ))}
            </Card>
          )
        })}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Add task">
        <Field label="Title" htmlFor="task-title">
          <input id="task-title" className="input" value={title}
                 onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="task-desc">
          <textarea id="task-desc" className="input" rows={3} value={description}
                    onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="filter-pair">
          <Field label="Priority" htmlFor="task-prio">
            <select id="task-prio" className="input" value={priority}
                    onChange={(e) => setPriority(e.target.value)}>
              <option>Low</option><option>Medium</option>
              <option>High</option><option>Critical</option>
            </select>
          </Field>
          <Field label="JIRA key (optional)" htmlFor="task-jira">
            <input id="task-jira" className="input" placeholder="VEY-01"
                   value={jiraKey} onChange={(e) => setJiraKey(e.target.value)} />
          </Field>
        </div>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="step-actions">
          <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          <Button loading={busy} onClick={create}>Add task</Button>
        </div>
      </Modal>
    </motion.div>
  )
}
