import { createSignal } from 'solid-js'
import ToggleSwitch from './ToggleSwitch'

const cardClass = pika('card', { animation: 'pop-in 0.4s ease-out both' })

const headerClass = pika({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  paddingBottom: '1.25rem',
  borderBottom: '1px solid var(--border)',
})

const avatarClass = pika({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '3rem',
  height: '3rem',
  borderRadius: '9999px',
  background: 'linear-gradient(135deg, var(--accent), #38bdf8)',
  color: '#0f172a',
  fontSize: '1rem',
  fontWeight: '700',
})

const statusDotClass = pika({
  position: 'absolute',
  right: '0',
  bottom: '0',
  width: '0.625rem',
  height: '0.625rem',
  borderRadius: '9999px',
  backgroundColor: 'var(--accent)',
  border: '2px solid var(--surface)',
  animation: 'pulse-ring 2s ease-out infinite',
})

const identityClass = pika({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.125rem',
  flex: '1',
  minWidth: '0',
})

const nameClass = pika({ margin: '0', fontSize: '1rem', fontWeight: '600' })
const emailClass = pika({ margin: '0', fontSize: '0.8125rem', color: 'var(--text-muted)' })
const proChipClass = pika('chip')

const sectionLabelClass = pika({
  margin: '1.25rem 0 0.25rem',
  fontSize: '0.6875rem',
  fontWeight: '600',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
})

const footerClass = pika({
  display: 'flex',
  gap: '0.75rem',
  marginTop: '0.75rem',
  paddingTop: '1.25rem',
  borderTop: '1px solid var(--border)',
})

const themeBtnClass = pika('btn-ghost', { flex: '1' })
const saveBtnClass = pika('btn-primary', { flex: '1' })
const savedBtnClass = pika('btn-primary', {
  flex: '1',
  opacity: '0.8',
  pointerEvents: 'none',
})

function PreferencesCard() {
  const [lightTheme, setLightTheme] = createSignal(false)
  const [emailDigest, setEmailDigest] = createSignal(true)
  const [pushAlerts, setPushAlerts] = createSignal(false)
  const [weeklyReport, setWeeklyReport] = createSignal(true)
  const [saved, setSaved] = createSignal(false)

  function toggleTheme() {
    const next = !lightTheme()
    setLightTheme(next)
    document.documentElement.classList.toggle('light', next)
  }

  function save() {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  return (
    <section class={cardClass}>
      <header class={headerClass}>
        <div class={avatarClass}>
          <span>AR</span>
          <span class={statusDotClass} aria-hidden="true" />
        </div>
        <div class={identityClass}>
          <p class={nameClass}>Alex Rivera</p>
          <p class={emailClass}>alex@pikalabs.dev</p>
        </div>
        <span class={proChipClass}>Pro</span>
      </header>

      <p class={sectionLabelClass}>Notifications</p>

      <div>
        <ToggleSwitch
          label="Email digest"
          description="A summary of activity, sent every morning."
          checked={emailDigest()}
          onToggle={() => setEmailDigest(v => !v)}
        />
        <ToggleSwitch
          label="Push alerts"
          description="Real-time notifications on your devices."
          checked={pushAlerts()}
          onToggle={() => setPushAlerts(v => !v)}
        />
        <ToggleSwitch
          label="Weekly report"
          description="Usage metrics delivered every Monday."
          checked={weeklyReport()}
          onToggle={() => setWeeklyReport(v => !v)}
        />
      </div>

      <footer class={footerClass}>
        <button type="button" class={themeBtnClass} onClick={toggleTheme}>
          {lightTheme() ? 'Dark mode' : 'Light mode'}
        </button>
        <button type="button" class={saved() ? savedBtnClass : saveBtnClass} disabled={saved()} onClick={save}>
          {saved() ? 'Saved!' : 'Save preferences'}
        </button>
      </footer>
    </section>
  )
}

export default PreferencesCard
