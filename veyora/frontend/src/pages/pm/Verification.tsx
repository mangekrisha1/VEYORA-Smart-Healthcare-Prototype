import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { api, ApiError } from '../../lib/api'
import type { VerificationRecord } from '../../lib/types'
import { Button, Card, Field, StatusBadge } from '../../components/ui'
import { useToast } from '../../state/ToastContext'

type Result = VerificationRecord['result']
type Filter = 'ALL' | Result

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

export default function Verification() {
  const reduced = useReducedMotion()
  const { toast } = useToast()

  const [records, setRecords] = useState<VerificationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const [filter, setFilter] = useState<Filter>('ALL')
  const [search, setSearch] = useState('')

  const [editing, setEditing] = useState<number | null>(null)
  const [result, setResult] = useState<Result>('PENDING')
  const [runDate, setRunDate] = useState('')
  const [evidence, setEvidence] = useState('')
  const [kind, setKind] = useState<'automated' | 'manual'>('manual')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setLoadError('')

      try {
        const response = await api<{ records: VerificationRecord[] }>(
          '/api/verification',
        )
        if (active) setRecords(response.records)
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof ApiError
              ? error.message
              : 'Unable to load test records.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [retry])

  function openEditor(record: VerificationRecord) {
    setEditing(record.id)
    setResult(record.result)
    setRunDate(record.run_date ?? '')
    setEvidence(record.evidence_source ?? '')
    setKind(record.kind)
    setFormError('')
  }

  async function save(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault()
    if (saving.current) return

    saving.current = true
    setBusy(true)
    setFormError('')

    try {
      const response = await api<{ record: VerificationRecord }>(
        `/api/verification/${id}/record`,
        {
          method: 'POST',
          body: {
            result,
            kind,
            run_date: result === 'PENDING' ? null : runDate,
            evidence_source: result === 'PENDING' ? null : evidence.trim(),
          },
        },
      )

      setRecords((current) =>
        current.map((record) =>
          record.id === id ? response.record : record,
        ),
      )
      setEditing(null)
      toast('Test result saved.', 'success')
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'Unable to save this result.',
      )
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  const counts = {
    PASS: records.filter((record) => record.result === 'PASS').length,
    FAIL: records.filter((record) => record.result === 'FAIL').length,
    PENDING: records.filter((record) => record.result === 'PENDING').length,
  }

  const order: Record<Result, number> = { FAIL: 0, PENDING: 1, PASS: 2 }

  const shown = records
    .filter((record) => {
      const matchesResult = filter === 'ALL' || record.result === filter
      const text = `${record.req_id} ${record.req_text} ${record.test_name}`
      return matchesResult && text.toLowerCase().includes(search.toLowerCase())
    })
    .sort((a, b) => order[a.result] - order[b.result])

  if (loading) {
    return <p className="empty-note" role="status">Loading test records…</p>
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
          <h1>Testing &amp; evidence</h1>
          <p className="page-sub">
            Review failed checks and record results from completed tests.
          </p>
        </div>
      </div>

      <div className="metric-row">
        {[
          ['Test records', records.length],
          ['Passed', counts.PASS],
          ['Failed', counts.FAIL],
          ['Pending', counts.PENDING],
        ].map(([label, value]) => (
          <div className="metric" key={String(label)}>
            <span className="metric-value">{value}</span>
            <span className="metric-label">{label}</span>
          </div>
        ))}
      </div>

      {counts.FAIL > 0 && (
        <p className="form-error" role="status">
          {counts.FAIL} recorded check(s) failed. Review the evidence, fix the
          issue and rerun the affected tests before updating the result.
        </p>
      )}

      <div className="mt-16">
        <Field label="Find a requirement or test" htmlFor="test-search">
          <input
            id="test-search"
            className="input"
            type="search"
            value={search}
            disabled={editing !== null}
            placeholder="Search authentication, booking, health logs..."
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>

        <div className="chip-row" aria-label="Filter test results">
          {(['ALL', 'FAIL', 'PENDING', 'PASS'] as Filter[]).map((value) => (
            <button
              key={value}
              type="button"
              className={`chip ${filter === value ? 'chip-on' : ''}`}
              aria-pressed={filter === value}
              disabled={editing !== null}
              onClick={() => setFilter(value)}
            >
              {value === 'ALL' ? 'All checks' : value}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 && (
        <p className="empty-note">No matching test records.</p>
      )}

      {shown.map((record) => (
        <Card
          key={record.id}
          className="mt-16"
          title={record.req_id}
          action={<StatusBadge value={record.result} />}
        >
          <p><strong>{record.req_text}</strong></p>

          <div className="grid-2">
            <div>
              <p><strong>Expected behaviour</strong></p>
              <p>{record.expected}</p>
            </div>
            <div>
              <p><strong>Control being checked</strong></p>
              <p>{record.control}</p>
              <p className="card-foot-note">
                Linked risk: {record.risk_code ?? 'Not linked'}
              </p>
            </div>
          </div>

          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer' }}>
              Test and evidence details
            </summary>
            <p style={{ overflowWrap: 'anywhere' }}>
              <strong>Test:</strong> {record.test_name}
            </p>
            <p><strong>Run date:</strong> {record.run_date ?? 'Not recorded'}</p>
            <p><strong>Method:</strong> {record.kind}</p>
            <p style={{ overflowWrap: 'anywhere' }}>
              <strong>Evidence:</strong>{' '}
              {record.evidence_source ?? 'Not recorded'}
            </p>
          </details>

          {editing !== record.id ? (
            <Button
              size="sm"
              variant="outline"
              disabled={editing !== null}
              onClick={() => openEditor(record)}
            >
              Record result
            </Button>
          ) : (
            <form onSubmit={(event) => save(event, record.id)}>
              <fieldset
                disabled={busy}
                style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
              >
                <div className="grid-2">
                  <Field label="Observed result" htmlFor={`result-${record.id}`}>
                    <select
                      id={`result-${record.id}`}
                      className="input"
                      value={result}
                      onChange={(event) => setResult(event.target.value as Result)}
                    >
                      <option value="PENDING">Pending / needs retesting</option>
                      <option value="PASS">Pass</option>
                      <option value="FAIL">Fail</option>
                    </select>
                  </Field>

                  <Field label="Test method" htmlFor={`kind-${record.id}`}>
                    <select
                      id={`kind-${record.id}`}
                      className="input"
                      value={kind}
                      onChange={(event) =>
                        setKind(event.target.value as 'automated' | 'manual')
                      }
                    >
                      <option value="manual">Manual test</option>
                      <option value="automated">Automated test</option>
                    </select>
                  </Field>
                </div>

                {result !== 'PENDING' ? (
                  <>
                    <Field label="Actual run date" htmlFor={`date-${record.id}`}>
                      <input
                        id={`date-${record.id}`}
                        className="input"
                        type="date"
                        required
                        max={todayIST()}
                        value={runDate}
                        onChange={(event) => setRunDate(event.target.value)}
                      />
                    </Field>

                    <Field
                      label="Evidence reference"
                      htmlFor={`evidence-${record.id}`}
                      hint="Enter the actual screenshot filename, test-log path or evidence URL."
                    >
                      <input
                        id={`evidence-${record.id}`}
                        className="input"
                        required
                        maxLength={280}
                        value={evidence}
                        onChange={(event) => setEvidence(event.target.value)}
                      />
                    </Field>
                  </>
                ) : (
                  <p className="card-foot-note">
                    Saving Pending clears this record’s previous result date and
                    evidence reference. Keep earlier evidence in your project files.
                  </p>
                )}

                {formError && (
                  <p className="form-error" role="alert">{formError}</p>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Button type="submit" loading={busy}>Save result</Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </fieldset>
            </form>
          )}
        </Card>
      ))}

      <p className="card-foot-note mt-16">
        This page stores test results and evidence references. It does not run
        tests or upload evidence files.
      </p>
    </motion.div>
  )
}
