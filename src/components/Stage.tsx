import { memo, useMemo, useRef, useState } from 'react'
import { Slider, Switch } from 'radix-ui'
import { AnimatePresence, motion } from 'motion/react'
import { DrawingPinFilledIcon, DrawingPinIcon, PauseIcon, PlayIcon } from '@radix-ui/react-icons'
import { TICK_RATES, frameCount, sample, solve, type Curve, type TickRate } from '../lib/bezier'
import type { Subject } from '../lib/useEditor'
import { useClock, useClockEffect, useExitLeg, useElementWidth, fmtShortcut, type Clock, type Speed } from '../hooks/hooks'
import { Segmented } from './Segmented'
import { Tip } from './Tip'
import { DurationSlider } from './Controls'
import styles from './Stage.module.css'

const SPEEDS: Speed[] = [1, 0.25, 0.1]

const TRAVEL = 200
const SIZE = 52
/** How much wider the Resize subject grows, in px. */
const RESIZE_RANGE = 120
/** Faint ticks per drawing interval in the spacing ruler. */
/** Spacing between faint ruler ticks, in px. */
const FINE_PITCH = 5
/** Half-width of the wave crest travelling through the ruler, in px. */
const WAVE_WIDTH = 6

const SUBJECTS: { value: Subject; label: string; hint: string; title: string }[] = [
  { value: 'x', label: 'Move', hint: fmtShortcut('1'), title: 'Move horizontally' },
  { value: 'scale', label: 'Scale', hint: fmtShortcut('2'), title: 'Scale uniformly' },
  { value: 'resize', label: 'Resize', hint: fmtShortcut('3'), title: 'Resize width' },
  { value: 'fade', label: 'Fade', hint: fmtShortcut('4'), title: 'Fade opacity' },
  { value: 'rotate', label: 'Rotate', hint: fmtShortcut('5'), title: 'Rotate' },
]

export function Stage({
  curve,
  reference,
  onPin,
  duration,
  subject,
  onSubject,
  clock,
  speed,
  onSpeed,
  playing,
  onPlaying,
  onScrub,
  onDuration,
  tickRate,
  onTickRate,
}: {
  curve: Curve
  reference: Curve | null
  onPin: () => void
  duration: number
  subject: Subject
  onSubject: (s: Subject) => void
  /** Playback time; read by the parts that move, so a frame doesn't re-render the stage. */
  clock: Clock
  speed: Speed
  onSpeed: (s: Speed) => void
  playing: boolean
  onPlaying: (p: boolean) => void
  onScrub: (t: number) => void
  onDuration: (ms: number) => void
  tickRate: TickRate
  onTickRate: (r: TickRate) => void
}) {
  const intervals = frameCount(duration, tickRate)
  const [onion, setOnion] = useState(false)

  return (
    <section className={`card ${styles.stage}`} aria-label="Preview" style={{ gridArea: 'preview' }}>
      <header className={styles.bar}>
        <Segmented id="subject" label="Preview subject" size="sm" value={subject} onChange={onSubject} options={SUBJECTS} />
      </header>

      <div className={styles.lanes}>
        <Lane curve={curve} clock={clock} subject={subject} intervals={intervals} label={reference ? 'Current' : undefined} onion={onion} />
        <AnimatePresence initial={false}>
          {reference && (
            <motion.div
              key="ref"
              initial={{ opacity: 0, height: 0, clipPath: 'inset(0 0 100% 0)' }}
              animate={{ opacity: 1, height: 'auto', clipPath: 'inset(0 0 0% 0)' }}
              exit={{ opacity: 0, height: 0, clipPath: 'inset(0 0 100% 0)' }}
              transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
            >
              <Lane curve={reference} clock={clock} subject={subject} intervals={intervals} label="Reference" reference onion={onion} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className={styles.transport}>
        <Tip label={playing ? 'Pause' : 'Play'} shortcut="Space">
          <button
            className={`btn btn-primary btn-icon ${styles.play}`}
            onClick={() => onPlaying(!playing)}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {/* Icons crossfade in one cell; a brief blur blends the swap so it
                reads as one shape changing rather than two overlapping. */}
            <span className={styles.iconStack}>
              <AnimatePresence initial={false}>
                <motion.span
                  key={playing ? 'pause' : 'play'}
                  initial={{ opacity: 0, scale: 0.8, filter: 'blur(2px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.8, filter: 'blur(2px)' }}
                  transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                >
                  {playing ? <PauseIcon /> : <PlayIcon />}
                </motion.span>
              </AnimatePresence>
            </span>
          </button>
        </Tip>
        <Scrubber clock={clock} intervals={intervals} onScrub={onScrub} />
      </footer>

      {/* Settings: one label column, controls right-aligned to the same edge. */}
      <div className={styles.settings}>
        <span className={styles.label}>Duration</span>
        <div className={styles.durationControl}>
          <DurationSlider value={duration} onChange={onDuration} />
          <DurationField value={duration} onChange={onDuration} />
        </div>

        <span className={styles.label}>Playback speed</span>
        <Segmented
          id="speed"
          label="Playback speed"
          size="sm"
          value={String(speed)}
          onChange={(v) => onSpeed(Number(v) as Speed)}
          options={SPEEDS.map((s) => ({ value: String(s), label: `${s}x`, title: `Play at ${s}x speed` }))}
        />

        <Tip label="Tick marks per second. Playback always runs at full refresh rate." side="left">
          <span className={styles.label}>Frames</span>
        </Tip>
        <Segmented
          id="tickrate"
          label="Frames per second for tick marks"
          size="sm"
          value={String(tickRate)}
          onChange={(v) => onTickRate(Number(v) as TickRate)}
          options={TICK_RATES.map((r) => ({ value: String(r), label: String(r), title: `${r} ticks per second` }))}
        />

        <label className={styles.label} htmlFor="onion">
          Onion skin
        </label>
        <Switch.Root id="onion" className={styles.switch} checked={onion} onCheckedChange={setOnion}>
          <Switch.Thumb className={styles.switchThumb} />
        </Switch.Root>

        <span className={styles.label}>Compare</span>
        <Tip label={reference ? 'Remove the reference lane and curve' : 'Keep this curve as a reference to compare against'}>
          <button className={`btn ${styles.pin}`} onClick={onPin} aria-pressed={!!reference}>
            {reference ? <DrawingPinFilledIcon /> : <DrawingPinIcon />}
            {reference ? 'Unpin' : 'Pin current'}
          </button>
        </Tip>
      </div>
    </section>
  )
}

const MIN_MS = 100
const MAX_MS = 1500

/** "300", "300ms" or "0.3s" → ms, clamped to the slider range. */
function parseMs(text: string): number | null {
  const m = text.trim().match(/^(\d*\.?\d+)\s*(ms|s)?$/i)
  if (!m) return null
  const ms = m[2]?.toLowerCase() === 's' ? parseFloat(m[1]) * 1000 : parseFloat(m[1])
  return Math.round(Math.min(MAX_MS, Math.max(MIN_MS, ms)))
}

/** Type an exact duration. Enter or blur commits; Escape reverts; ↑↓ step by 10 (⇧ 100). */
function DurationField({ value, onChange }: { value: number; onChange: (ms: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    const ms = draft === null ? null : parseMs(draft)
    if (ms !== null) onChange(ms)
    setDraft(null)
  }
  return (
    <label className={styles.durField}>
      <input
        className={`${styles.durInput} tnum`}
        inputMode="numeric"
        aria-label="Duration in milliseconds"
        value={draft ?? String(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const base = (draft !== null && parseMs(draft)) || value
            const step = (e.shiftKey ? 100 : 10) * (e.key === 'ArrowUp' ? 1 : -1)
            const next = Math.min(MAX_MS, Math.max(MIN_MS, base + step))
            setDraft(null)
            onChange(next)
          }
        }}
      />
      <span className={styles.durUnit}>ms</span>
    </label>
  )
}

/** The only part of the transport that re-renders per frame. */
function Scrubber({ clock, intervals, onScrub }: { clock: Clock; intervals: number; onScrub: (t: number) => void }) {
  const { t } = useClock(clock)
  return (
    <Slider.Root
      className={styles.scrub}
      min={0}
      max={1}
      step={1 / intervals}
      value={[t]}
      onValueChange={([v]) => onScrub(v)}
      aria-label="Scrub time"
    >
      <Slider.Track className={styles.scrubTrack}>
        <TickMarks intervals={intervals} />
        <Slider.Range className={styles.scrubRange} />
      </Slider.Track>
      <Slider.Thumb className={styles.scrubThumb} />
    </Slider.Root>
  )
}

const TickMarks = memo(function TickMarks({ intervals }: { intervals: number }) {
  return (
    <div className={styles.ticks} aria-hidden>
      {Array.from({ length: intervals + 1 }, (_, i) => (
        <span key={i} style={{ left: `${(i / intervals) * 100}%` }} />
      ))}
    </div>
  )
})

function Lane({
  curve,
  clock,
  subject,
  intervals,
  label,
  reference = false,
  onion,
}: {
  curve: Curve
  clock: Clock
  subject: Subject
  intervals: number
  /** Only shown when comparing against a reference. */
  label?: string
  onion: boolean
  reference?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const subjectRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(ref)
  // Realistic UI distance, centred in the lane.
  const travel = Math.max(0, Math.min(TRAVEL, width - SIZE))
  const start = Math.max(0, (width - travel - SIZE) / 2)
  // Odd runs play the opposite change (exit), still along the curve.
  // Rotation instead keeps turning forward.
  // Re-renders only when the leg flips, for the onion skin.
  const exitLeg = useExitLeg(clock)
  const back = subject !== 'rotate' && exitLeg
  const samples = useMemo(() => sample(curve, intervals), [curve, intervals])
  // One wave crest sweeping the ruler at a steady rate (driven by time), so
  // it finishes exactly when the motion does. Every tick swells by its
  // distance from the crest. Super-Gaussian for a sharp fall-off.
  const x0 = start + SIZE / 2
  // The ruler charts the curve itself, which runs forward on every leg, so it
  // never mirrors: the wave always sweeps left → right with time.
  const wave = (pos: number, at: number) => {
    const d = ((pos - at) * travel) / WAVE_WIDTH
    return Math.exp(-(d * d * d * d))
  }
  // Faint ticks at a fixed pixel pitch so they never merge at long durations.
  const fineCount = Math.max(2, Math.round(travel / FINE_PITCH))

  // Each subject animates one property from a realistic UI start state.
  // `v` is the displayed value (reversed on exit legs); `q` the curve progress.
  // Every property is always set, so switching subject leaves nothing behind.
  const center = start + travel / 2
  const styleFor = (v: number, q: number, cycle = clock.get().cycle) => {
    const s = { transform: '', left: '', width: `${SIZE}px`, opacity: '' }
    switch (subject) {
      case 'x':
        s.transform = `translateX(${start + v * travel}px)`
        break
      case 'scale':
        s.left = `${center}px`
        s.transform = `scale(${0.6 + 0.4 * v})`
        break
      case 'resize': {
        // Grows wider from its centre, like a container changing size.
        const w = Math.max(8, SIZE + v * Math.min(travel, RESIZE_RANGE))
        // Position via transform (compositor) so only width triggers layout.
        s.left = '0px'
        s.transform = `translateX(${center + SIZE / 2 - w / 2}px)`
        s.width = `${w}px`
        break
      }
      case 'fade':
        s.left = `${center}px`
        s.opacity = String(Math.min(1, Math.max(0, v)))
        break
      case 'rotate':
        s.left = `${center}px`
        s.transform = `rotate(${(cycle + q) * 180}deg)`
        break
    }
    return s
  }

  // Per frame: write straight to the DOM instead of re-rendering the lane.
  useClockEffect(clock, ({ t, waveT, cycle }) => {
    const p = solve(curve, t)
    // Leg from this tick, not the last render: the render lags the flip by a frame.
    const exit = subject !== 'rotate' && cycle % 2 === 1
    if (subjectRef.current) Object.assign(subjectRef.current.style, styleFor(exit ? 1 - p : p, p, cycle))
    const ticks = rulerRef.current?.children
    if (!ticks) return
    // The crest steps tick to tick so it always reads as one tall tick between
    // two shorter ones, never two equal halves.
    const fineCrest = Math.round(waveT * fineCount) / fineCount
    for (let i = 0; i <= fineCount; i++) {
      const g = wave(i / fineCount, fineCrest)
      const el = ticks[i] as HTMLElement
      el.style.transform = `scaleY(${1 + 1.1 * g})`
      el.style.opacity = String(0.13 + 0.22 * g)
    }
    samples.forEach((v, i) => {
      const el = ticks[fineCount + 1 + i] as HTMLElement | undefined
      if (el) el.style.transform = `scaleY(${1 + 0.55 * wave(v, waveT)})`
    })
  })

  return (
    <div className={styles.lane} data-reference={reference || undefined} data-labelled={label ? '' : undefined}>
      {label && <span className={styles.laneLabel}>{label}</span>}
      <div ref={ref} className={styles.track} data-kind={subject}>
        {/* Onion skin: an outline where the subject sits on every frame, the
            inbetweens an animator would draw. Fade has nothing to outline. */}
        {onion &&
          subject !== 'fade' &&
          samples.map((v, i) => (
            <div
              key={i}
              className={styles.onion}
              style={{ height: SIZE, ...styleFor(back ? 1 - v : v, v) }}
              aria-hidden
            />
          ))}
        <div ref={subjectRef} className={styles.subject} data-kind={subject} style={{ height: SIZE }} />
      </div>
      {/* Spacing ruler: faint ticks are an even time grid (where linear motion
          would be), bold ticks are where each drawing actually lands. A single
          wave sweeps through both at a steady rate. Heights are set per frame. */}
      <div ref={rulerRef} className={styles.ruler} aria-hidden>
        {Array.from({ length: fineCount + 1 }, (_, i) => (
          <span key={`f${i}`} className={styles.fine} style={{ left: x0 + (i / fineCount) * travel }} />
        ))}
        {samples.map((v, i) => (
          <span key={i} className={styles.mark} style={{ left: x0 + v * travel }} />
        ))}
      </div>
    </div>
  )
}
