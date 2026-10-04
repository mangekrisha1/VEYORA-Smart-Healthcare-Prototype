import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'

/** Static phone screen previews, styled like the reference export. */
function PhoneScreen({ variant }: { variant: 'patient' | 'doctor' | 'pm' }) {
  if (variant === 'doctor') {
    return (
      <div className="phone-screen phone-light">
        <div className="ps-top"><span className="ps-dot" /> Dr. Meera Iyer</div>
        <div className="ps-card">
          <strong>Aarav Shah</strong>
          <small>Today · 9:00 am · In-clinic</small>
          <span className="ps-pill ps-pill-ok">Confirmed</span>
        </div>
        <div className="ps-card">
          <strong>Priya Nair</strong>
          <small>Today · 9:30 am · In-clinic</small>
          <span className="ps-pill ps-pill-info">Checked in</span>
        </div>
      </div>
    )
  }
  if (variant === 'pm') {
    return (
      <div className="phone-screen phone-light">
        <div className="ps-top"><span className="ps-dot" /> Risk register</div>
        <div className="ps-grid5" aria-hidden="true">
          {Array.from({ length: 25 }, (_, i) => {
            const row = Math.floor(i / 5), col = i % 5
            const score = (5 - row) * (col + 1)
            const cls = score >= 17 ? 'c' : score >= 10 ? 'h' : score >= 5 ? 'm' : 'l'
            return <span key={i} className={`ps-cell ps-${cls}`} />
          })}
        </div>
        <div className="ps-card sm"><strong>RISK-02</strong><small>Duplicate booking · 12</small></div>
      </div>
    )
  }
  return (
    <div className="phone-screen phone-light">
      <div className="ps-top"><span className="ps-dot" /> Good morning, Aarav</div>
      <div className="ps-card">
        <strong>Cardiology follow-up</strong>
        <small>Tue · 9:00 am · In-clinic</small>
        <span className="ps-pill ps-pill-ok">Confirmed</span>
      </div>
      <div className="ps-card">
        <strong>Heart rate</strong>
        <small>72 bpm · this morning</small>
      </div>
      <div className="ps-card sm"><strong>Reminder</strong><small>Visit in 2 days</small></div>
    </div>
  )
}

export default function Landing() {
  const reduced = useReducedMotion()
  const heroRef = useRef<HTMLDivElement>(null)

  // Pause the continuous float animation while the hero is offscreen.
  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => el.classList.toggle('offscreen', !entry.isIntersecting),
      { threshold: 0.05 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="wordmark wordmark-light">
          <span className="wordmark-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="26" height="26">
              <rect width="32" height="32" rx="9" fill="var(--accent)" />
              <path d="M9 11l7 12 7-12" stroke="#F7F8F5" strokeWidth="3"
                    fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          VEYORA
        </span>
        <Link className="btn btn-outline-light btn-sm" to="/login">Sign in</Link>
      </header>

      <section className="hero" ref={heroRef}>
        <motion.div
          className="hero-copy"
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <p className="hero-eyebrow">Smart healthcare · SDG 3 — Good health and well-being</p>
          <h1 className="hero-title">
            A little less complexity.<br />A lot more care.
          </h1>
          <p className="hero-sub">
            VEYORA keeps clinic visits simple: book an in-clinic appointment in
            under a minute, keep your own health logs, and let one calm screen
            show what matters next.
          </p>
          <div className="hero-actions">
            <Link to="/login" className="btn btn-primary btn-lg">Sign in to continue</Link>
            <a className="btn btn-ghost-light btn-lg" href="#how">How it works</a>
          </div>
          <p className="hero-note">
            Academic prototype by Krisha Mange · Shah &amp; Anchor Kutchhi
            Engineering College. Not for clinical use.
          </p>
        </motion.div>

        <motion.div
          className="hero-phones"
          initial={reduced ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
        >
          <div className="phone phone-a float-slow">
            <PhoneScreen variant="patient" />
          </div>
          <div className="phone phone-b float-slower" aria-hidden="true">
            <PhoneScreen variant="doctor" />
          </div>
          <div className="phone phone-c float-slowest" aria-hidden="true">
            <PhoneScreen variant="pm" />
          </div>
        </motion.div>
      </section>

      <section className="landing-section" id="how">
        <motion.h2
          className="section-title"
          initial={reduced ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.3 }}
        >
          One calm place for the essentials
        </motion.h2>
        <div className="feature-grid">
          {[
            ['Book in-clinic visits', 'Pick a doctor, choose a real available slot, get an in-app reminder. No double bookings — the system refuses conflicts politely.'],
            ['Keep your own health logs', 'Heart rate, temperature and blood pressure in one private timeline. Only you can see and delete your records.'],
            ['Plan the project honestly', 'A risk register with a 5×5 heatmap, traceability from requirements to real test evidence, and no invented numbers.'],
          ].map(([title, body]) => (
            <motion.article
              key={title}
              className="feature-card"
              initial={reduced ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.25 }}
            >
              <h3>{title}</h3>
              <p>{body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <p>VEYORA · Software Engineering Practices coursework · TYCS_68 · 2026</p>
      </footer>
    </div>
  )
}
