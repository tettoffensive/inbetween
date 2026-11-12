import { memo, useEffect, useRef, type Dispatch } from 'react'
import { Slider, ToggleGroup, Tooltip } from 'radix-ui'
import { PRESETS, format, nudge, sameCurve, type Curve, type Nudge } from '../lib/bezier'
import { presetName, type Action } from '../lib/useEditor'
import { Tip } from './Tip'
import styles from './Controls.module.css'

export const ShapePanel = memo(function ShapePanel({
  curve,
  dispatch,
  onPreview,
}: {
  curve: Curve
  dispatch: Dispatch<Action>
  /** Which nudge is hovered/focused, so the editor can preview its result. */
  onPreview: (kind: Nudge | null) => void
}) {
  const active = presetName(curve)

  return (
    <aside className={`card ${styles.panel}`} aria-label="Shape" style={{ gridArea: 'shape' }}>
      <Section
        title="Feel"
        info="Nudges reshape whatever curve is current. Duration stays fixed, so slowing one end speeds up the middle."
      >
        <NudgeRow label="Overall" curve={curve} dispatch={dispatch} onPreview={onPreview} less="gentler" more="snappier" lessLabel="Gentler" moreLabel="Snappier" />
        <NudgeRow label="Start" curve={curve} dispatch={dispatch} onPreview={onPreview} less="start-slower" more="start-quicker" lessLabel="Slower" moreLabel="Quicker" />
        <NudgeRow label="Landing" curve={curve} dispatch={dispatch} onPreview={onPreview} less="land-softer" more="land-firmer" lessLabel="Softer" moreLabel="Firmer" />
      </Section>

      <Section title="Presets">
        <ToggleGroup.Root
          type="single"
          className={styles.presets}
          value={active ?? ''}
          onValueChange={(name) => {
            const p = PRESETS.find((p) => p.name === name)
            if (p) dispatch({ type: 'commit', curve: p.curve, source: 'preset', duration: p.duration })
          }}
          aria-label="Presets"
        >
          {PRESETS.map((p) => (
            <Tooltip.Root key={p.name}>
              <Tooltip.Trigger asChild>
                <ToggleGroup.Item value={p.name} className={styles.preset}>
                  <MiniCurve curve={p.curve} />
                  {p.name}
                </ToggleGroup.Item>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="tooltip" side="top" sideOffset={6} collisionPadding={8}>
                  <p className={styles.tipUse}>{p.use}</p>
                  <p className={`${styles.tipMeta} tnum`}>
                    {p.duration}ms · {format(p.curve)}
                  </p>
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          ))}
        </ToggleGroup.Root>
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
        {info ? (
          <Tip label={info} side="right">
            <h3 className="eyebrow">{title}</h3>
          </Tip>
        ) : (
          <h3 className="eyebrow">{title}</h3>
        )}
        {aside && <span className={styles.aside}>{aside}</span>}
      </header>
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
    </section>
  )
}

type NudgeRowProps = {
  label: string
  curve: Curve
  dispatch: Dispatch<Action>
  onPreview: (kind: Nudge | null) => void
  less: Nudge
  more: Nudge
  lessLabel: string
  moreLabel: string
}

function NudgeRow(props: NudgeRowProps) {
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
      // At the limit: stop repeating (a disabled button may never see pointerup).
      if (sameCurve(next, curveRef.current)) return stop()
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
      // Nothing left to nudge in this direction.
      disabled={sameCurve(nudge(props.curve, kind), props.curve)}
      onPointerDown={(e) => {
        if (e.button === 0) press(kind)
      }}
      onPointerUp={stop}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') props.onPreview(kind)
      }}
      onPointerLeave={() => {
        stop()
        props.onPreview(null)
      }}
      onFocus={(e) => {
        if (e.currentTarget.matches(':focus-visible')) props.onPreview(kind)
      }}
      onBlur={() => props.onPreview(null)}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault()
          press(kind)
          stop()
        }
      }}
    >
      {side === 'l' && <NudgeGlyph curve={props.curve} kind={kind} />}
      {text}
      {side === 'r' && <NudgeGlyph curve={props.curve} kind={kind} />}
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

const curvePath = ([x1, y1, x2, y2]: Curve) => `M0 1 C${x1} ${1 - y1} ${x2} ${1 - y2} 1 0`

/** How far the glyph's curve must move from the current one to read at icon size. */
const GLYPH_MIN_SHIFT = 0.3

/**
 * Where nudging this way leads: the current curve ghosted, with the curve a few
 * presses on drawn over it. Steps until the change is legible, since one press
 * barely moves a handle. At the limit only the ghost remains.
 */
function NudgeGlyph({ curve, kind }: { curve: Curve; kind: Nudge }) {
  let next = curve
  for (let i = 0; i < 12; i++) {
    const n = nudge(next, kind)
    if (sameCurve(n, next)) break
    next = n
    if (Math.max(...next.map((v, j) => Math.abs(v - curve[j]))) >= GLYPH_MIN_SHIFT) break
  }
  return (
    <svg viewBox="-0.15 -0.15 1.3 1.3" className={styles.glyph} aria-hidden>
      <path d={curvePath(curve)} className={styles.glyphGhost} vectorEffect="non-scaling-stroke" />
      {!sameCurve(next, curve) && <path d={curvePath(next)} vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

function MiniCurve({ curve: [x1, y1, x2, y2] }: { curve: Curve }) {
  return (
    // Square, like the editor, left-aligned with the label.
    <svg viewBox="-0.1 -0.1 1.2 1.2" className={styles.mini} aria-hidden>
      <path d={`M0 1 C${x1} ${1 - y1} ${x2} ${1 - y2} 1 0`} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
