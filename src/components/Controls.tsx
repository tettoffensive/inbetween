import { memo, useEffect, useRef, type Dispatch } from 'react'
import { Slider, ToggleGroup } from 'radix-ui'
import { DrawingPinFilledIcon, DrawingPinIcon } from '@radix-ui/react-icons'
import { PRESETS, nudge, type Curve, type Nudge } from '../lib/bezier'
import { presetName, type Action } from '../lib/useEditor'
import styles from './Controls.module.css'

export const ShapePanel = memo(function ShapePanel({
  curve,
  reference,
  dispatch,
}: {
  curve: Curve
  reference: Curve | null
  dispatch: Dispatch<Action>
}) {
  const active = presetName(curve)

  return (
    <aside className={`card ${styles.panel}`} aria-label="Shape" style={{ gridArea: 'shape' }}>
      <Section title="Feel" info="Nudges reshape whatever curve is current, including imported ones.">
        <NudgeRow label="Start" curve={curve} dispatch={dispatch} less="start-gentler" more="start-snappier" lessLabel="Gentler" moreLabel="Snappier" />
        <NudgeRow label="Landing" curve={curve} dispatch={dispatch} less="land-softer" more="land-firmer" lessLabel="Softer" moreLabel="Firmer" />
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
      </Section>
    </aside>
  )
})

export function DurationSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Slider.Root
      className={styles.slider}
      min={100}
      max={1500}
      step={10}
      value={[value]}
      onValueChange={([v]) => onChange(v)}
      aria-label="Duration"
    >
      <Slider.Track className={styles.sliderTrack}>
        <Slider.Range className={styles.sliderRange} />
      </Slider.Track>
      <Slider.Thumb className={styles.sliderThumb} />
    </Slider.Root>
  )
}

function Section({
  title,
  hint,
  info,
  aside,
  children,
}: {
  title: string
  hint?: string
  /** Secondary explanation, shown on hover of the title. */
  info?: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <h3 className="eyebrow" title={info}>
          {title}
        </h3>
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
