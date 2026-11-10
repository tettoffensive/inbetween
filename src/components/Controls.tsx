import { memo, useEffect, useRef, useState, type Dispatch } from 'react'
import { Slider, ToggleGroup } from 'radix-ui'
import { AnimatePresence, motion } from 'motion/react'
import { CheckIcon, CopyIcon, DrawingPinFilledIcon, DrawingPinIcon } from '@radix-ui/react-icons'
import { PRESETS, format, nudge, parse, type Curve, type Nudge } from '../lib/bezier'
import { presetName, type Action } from '../lib/useEditor'
import styles from './Controls.module.css'

export const Controls = memo(function Controls({
  curve,
  duration,
  reference,
  dispatch,
}: {
  curve: Curve
  duration: number
  reference: Curve | null
  dispatch: Dispatch<Action>
}) {
  const active = presetName(curve)

  return (
    <aside className={`card ${styles.panel}`} aria-label="Controls">
      <Section title="Feel" hint="Nudges reshape whatever curve is current.">
        <NudgeRow label="Start" curve={curve} dispatch={dispatch} less="start-gentler" more="start-snappier" lessLabel="Gentler" moreLabel="Snappier" />
        <NudgeRow label="Landing" curve={curve} dispatch={dispatch} less="land-softer" more="land-firmer" lessLabel="Softer" moreLabel="Firmer" />
      </Section>

      <Section title="Duration" aside={<span className="tnum">{duration}ms</span>}>
        <Slider.Root
          className={styles.slider}
          min={100}
          max={1500}
          step={10}
          value={[duration]}
          onValueChange={([v]) => dispatch({ type: 'duration', value: v })}
          aria-label="Duration"
        >
          <Slider.Track className={styles.sliderTrack}>
            <Slider.Range className={styles.sliderRange} />
          </Slider.Track>
          <Slider.Thumb className={styles.sliderThumb} />
        </Slider.Root>
      </Section>

      <Section title="Presets">
        <ToggleGroup.Root
          type="single"
          className={styles.presets}
          value={active ?? ''}
          onValueChange={(name) => {
            const p = PRESETS.find((p) => p.name === name)
            if (p) dispatch({ type: 'commit', curve: p.curve, source: 'preset' })
          }}
          aria-label="Presets"
        >
          {PRESETS.map((p) => (
            <ToggleGroup.Item key={p.name} value={p.name} className={styles.preset}>
              <MiniCurve curve={p.curve} />
              {p.name}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </Section>

      <Section title="Compare">
        <button
          className="btn"
          data-pressed={!!reference || undefined}
          onClick={() => dispatch({ type: reference ? 'unpin' : 'pin' })}
        >
          {reference ? <DrawingPinFilledIcon /> : <DrawingPinIcon />}
          {reference ? 'Clear reference' : 'Pin as reference'}
        </button>
        {reference && <p className={`${styles.refValue} tnum`}>{format(reference)}</p>}
      </Section>

      <ImportExport curve={curve} duration={duration} dispatch={dispatch} />
    </aside>
  )
})

function Section({
  title,
  hint,
  aside,
  children,
}: {
  title: string
  hint?: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <h3 className="eyebrow">{title}</h3>
        {aside && <span className={styles.aside}>{aside}</span>}
      </header>
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
    </section>
  )
}

function NudgeRow(props: {
  label: string
  curve: Curve
  dispatch: Dispatch<Action>
  less: Nudge
  more: Nudge
  lessLabel: string
  moreLabel: string
}) {
  const { label, less, more, lessLabel, moreLabel } = props
  // Latest curve for repeated nudges while held.
  const curveRef = useRef(props.curve)
  curveRef.current = props.curve
  const timer = useRef<number>(0)

  const stop = () => {
    clearTimeout(timer.current)
    clearInterval(timer.current)
  }
  useEffect(() => stop, [])

  const press = (kind: Nudge) => {
    props.dispatch({ type: 'checkpoint' })
    const step = () => {
      const next = nudge(curveRef.current, kind)
      curveRef.current = next
      props.dispatch({ type: 'update', curve: next, source: 'custom' })
    }
    step()
    stop()
    timer.current = window.setTimeout(() => {
      timer.current = window.setInterval(step, 110)
    }, 380)
  }

  const btn = (kind: Nudge, text: string, side: 'l' | 'r') => (
    <button
      className={`btn ${styles.nudge}`}
      data-side={side}
      onPointerDown={(e) => {
        if (e.button === 0) press(kind)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault()
          press(kind)
          stop()
        }
      }}
    >
      {side === 'l' && <span className={styles.arrow}>‹</span>}
      {text}
      {side === 'r' && <span className={styles.arrow}>›</span>}
    </button>
  )

  return (
    <div className={styles.nudgeRow}>
      <span className={styles.nudgeLabel}>{label}</span>
      <div className={styles.nudgePair}>
        {btn(less, lessLabel, 'l')}
        {btn(more, moreLabel, 'r')}
      </div>
    </div>
  )
}

function MiniCurve({ curve: [x1, y1, x2, y2] }: { curve: Curve }) {
  return (
    <svg viewBox="-0.1 -0.1 1.2 1.2" className={styles.mini} aria-hidden>
      <path d={`M0 1 C${x1} ${1 - y1} ${x2} ${1 - y2} 1 0`} />
    </svg>
  )
}

function ImportExport({ curve, duration, dispatch }: { curve: Curve; duration: number; dispatch: Dispatch<Action> }) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const css = `transition: transform ${duration}ms ${format(curve)};`

  const apply = (text = draft) => {
    const r = parse(text)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setError(null)
    setDraft('')
    dispatch({ type: 'commit', curve: r.curve, source: 'imported' })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(css)
    } catch {
      /* clipboard blocked; still show state so the demo reads */
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <>
      <Section title="Import">
        <form
          className={styles.importRow}
          onSubmit={(e) => {
            e.preventDefault()
            apply()
          }}
        >
          <input
            className={styles.input}
            data-invalid={!!error || undefined}
            value={draft}
            spellCheck={false}
            placeholder="cubic-bezier(0.2, 0, 0, 1)"
            aria-label="Paste an easing to import"
            aria-invalid={!!error}
            aria-describedby={error ? 'import-error' : undefined}
            onChange={(e) => {
              setDraft(e.target.value)
              if (error) setError(null)
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              e.preventDefault()
              setDraft(text)
              apply(text)
            }}
          />
          <button className="btn" type="submit" disabled={!draft.trim()}>
            Apply
          </button>
        </form>
        <AnimatePresence initial={false}>
          {error && (
            <motion.p
              id="import-error"
              role="alert"
              className={styles.error}
              initial={{ height: 0, opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
              animate={{ height: 'auto', opacity: 1, clipPath: 'inset(0 0 0% 0)' }}
              exit={{ height: 0, opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            >
              <span>{error} Current motion is unchanged.</span>
            </motion.p>
          )}
        </AnimatePresence>
      </Section>

      <Section title="Export" aside="CSS">
        <code className={styles.code}>
          <span className={styles.prop}>transition</span>: transform{' '}
          <span className={styles.num}>{duration}ms</span>{' '}
          <span className={styles.fn}>{format(curve)}</span>;
        </code>
        <button className={`btn btn-primary ${styles.copy}`} onClick={copy} aria-live="polite">
          {/* Two stacked labels; the second is revealed with clip-path. */}
          <span className={styles.copyLayer}>
            <CopyIcon /> Copy CSS
          </span>
          <span className={styles.copyLayer} data-overlay data-on={copied || undefined} aria-hidden={!copied}>
            <CheckIcon /> Copied
          </span>
        </button>
      </Section>
    </>
  )
}
