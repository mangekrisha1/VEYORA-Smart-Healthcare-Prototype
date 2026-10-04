/** 5×5 risk heatmap. Project-risk priorities only — not clinical.
 *  Includes an accessible list alternative right below the grid. */
import type { Risk } from '../lib/types'

function bandClass(score: number): string {
  if (score <= 4) return 'low'
  if (score <= 9) return 'moderate'
  if (score <= 16) return 'high'
  return 'critical'
}

export default function RiskMatrix({ risks, onSelect }: {
  risks: Risk[]; onSelect?: (risk: Risk) => void
}) {
  const open = risks.filter((r) => r.status === 'OPEN')

  const cell = (p: number, i: number) => {
    const score = p * i
    const here = open.filter((r) => r.probability === p && r.impact === i)
    return (
      <div key={`${p}-${i}`}
           className={`matrix-cell matrix-${bandClass(score)}`}
           aria-label={`Probability ${p}, impact ${i}, score ${score}, ${here.length} risk(s)`}>
        <span className="matrix-score">{score}</span>
        <span className="matrix-dots">
          {here.map((r) => (
            <button key={r.id} className="matrix-dot" title={`${r.code}: ${r.title}`}
                    aria-label={`Open ${r.code}: ${r.title}`}
                    onClick={() => onSelect?.(r)}>
              {r.code.replace('RISK-', '')}
            </button>
          ))}
        </span>
      </div>
    )
  }

  return (
    <div className="matrix-block">
      <div className="matrix" role="img"
           aria-label="Five by five risk matrix: probability on the vertical axis, impact on the horizontal axis. Colour shows the score band.">
        <div className="matrix-grid">
          {[5, 4, 3, 2, 1].map((p) => (
            <div key={p} className="matrix-row">
              <span className="matrix-axis">{p}</span>
              {[1, 2, 3, 4, 5].map((i) => cell(p, i))}
            </div>
          ))}
          <div className="matrix-row matrix-x-axis">
            <span className="matrix-axis" aria-hidden="true" />
            {[1, 2, 3, 4, 5].map((i) => <span key={i} className="matrix-axis">{i}</span>)}
          </div>
        </div>
        <div className="matrix-caption">
          <span className="matrix-y">Probability →</span>
          <span className="matrix-x">Impact →</span>
        </div>
      </div>

      {/* Accessible alternative: every plotted risk as a real button/list */}
      <ul className="matrix-list">
        {open.length === 0 && <li className="empty-note">No open risks plotted.</li>}
        {open
          .slice()
          .sort((a, b) => b.score - a.score)
          .map((r) => (
            <li key={r.id}>
              <button className="matrix-list-item" onClick={() => onSelect?.(r)}>
                <span className={`band-chip band-${bandClass(r.score)}`}>{r.score}</span>
                <span className="matrix-list-code">{r.code}</span>
                <span className="matrix-list-title">{r.title}</span>
              </button>
            </li>
          ))}
      </ul>
    </div>
  )
}
