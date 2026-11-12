import { memo, useMemo, useRef, useState } from 'react'
import { Slider, Switch } from 'radix-ui'
import { AnimatePresence, motion } from 'motion/react'
import { DrawingPinFilledIcon, DrawingPinIcon, PauseIcon, PlayIcon } from '@radix-ui/react-icons'
import { TICK_RATES, frameCount, sample, solve, type Curve, type TickRate } from '../lib/bezier'
import type { Subject } from '../lib/useEditor'
import { useElementWidth, fmtShortcut, type Speed } from '../hooks/hooks'
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
  t,
  waveT,
  speed,
  onSpeed,
  cycle,
  exitLeg,
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
  t: number
  /** Time for the ruler wave; continues past 1 during the hold. */
  waveT: number
  speed: Speed
  onSpeed: (s: Speed) => void
  /** Completed loop runs; rotation accumulates across them. */
  cycle: number
  /** Playing the opposite change (exit) on this loop. */
  exitLeg: boolean
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
        <Lane curve={curve} t={t} waveT={waveT} cycle={cycle} exitLeg={exitLeg} subject={subject} intervals={intervals} label={reference ? 'Current' : undefined} onion={onion} />
        <AnimatePresence initial={false}>
          {reference && (
            <motion.div
              key="ref"
              initial={{ opacity: 0, height: 0, clipPath: 'inset(0 0 100% 0)' }}
              animate={{ opacity: 1, height: 'auto', clipPath: 'inset(0 0 0% 0)' }}
              exit={{ opacity: 0, height: 0, clipPath: 'inset(0 0 100% 0)' }}
              transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
            >
              <Lane curve={reference} t={t} waveT={waveT} cycle={cycle} exitLeg={exitLeg} subject={subject} intervals={intervals} label="Reference" reference onion={onion} />
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
  t,
  waveT,
  cycle,
  exitLeg,
  subject,
  intervals,
  label,
  reference = false,
  onion,
}: {
  curve: Curve
  t: number
  waveT: number
  cycle: number
  /** Playing the opposite change (exit) on this loop. */
  exitLeg: boolean
  subject: Subject
  intervals: number
  /** Only shown when comparing against a reference. */
  label?: string
  onion: boolean
  reference?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useElementWidth(ref)
  // Realistic UI distance, centred in the lane.
  const travel = Math.max(0, Math.min(TRAVEL, width - SIZE))
  const start = Math.max(0, (width - travel - SIZE) / 2)
  const p = solve(curve, t)
  // Odd runs play the opposite change (exit), still along the curve.
  // Rotation instead keeps turning forward.
  const back = subject !== 'rotate' && exitLeg
  const y = back ? 1 - p : p
  const samples = useMemo(() => sample(curve, intervals), [curve, intervals])
  // One wave crest sweeping the ruler at a steady rate (driven by time), so
  // it finishes exactly when the motion does. Every tick swells by its
  // distance from the crest. Super-Gaussian for a sharp fall-off.
  const x0 = start + SIZE / 2
  // The ruler charts the curve itself, which runs forward on every leg, so it
  // never mirrors: the wave always sweeps left → right with time.
  const wave = (pos: number, at = waveT) => {
    const d = ((pos - at) * travel) / WAVE_WIDTH
    return Math.exp(-(d * d * d * d))
  }
  // Faint ticks at a fixed pixel pitch so they never merge at long durations.
  const fineCount = Math.max(2, Math.round(travel / FINE_PITCH))
  // The crest steps tick to tick so it always reads as one tall tick between
  // two shorter ones, never two equal halves.
  const fineCrest = Math.round(waveT * fineCount) / fineCount

  // Each subject animates one property from a realistic UI start state.
  // `v` is the displayed value (reversed on exit legs); `q` the curve progress.
  const center = start + travel / 2
  const styleFor = (v: number, q: number): React.CSSProperties => {
    switch (subject) {
      case 'x':
        return { transform: `translateX(${start + v * travel}px)` }
      case 'scale':
        return { left: center, transform: `scale(${0.6 + 0.4 * v})` }
      case 'resize': {
        // Grows wider from its centre, like a container changing size.
        const w = Math.max(8, SIZE + v * Math.min(travel, RESIZE_RANGE))
        return { left: center + SIZE / 2 - w / 2, width: w }
      }
      case 'fade':
        return { left: center, opacity: Math.min(1, Math.max(0, v)) }
      case 'rotate':
        return { left: center, transform: `rotate(${(cycle + q) * 180}deg)` }
    }
  }
  const subjectStyle = styleFor(y, p)

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
              style={{ width: SIZE, height: SIZE, ...styleFor(back ? 1 - v : v, v) }}
              aria-hidden
            />
          ))}
        <div
          className={styles.subject}
          data-kind={subject}
          style={{ width: SIZE, height: SIZE, ...subjectStyle }}
        >
        </div>
      </div>
      {/* Spacing ruler: faint ticks are an even time grid (where linear motion
          would be), bold ticks are where each drawing actually lands. A single
          wave sweeps through both at a steady rate. */}
      <div className={styles.ruler} aria-hidden>
        {Array.from({ length: fineCount + 1 }, (_, i) => {
          const u = i / fineCount
          const g = wave(u, fineCrest)
          return (
            <span
              key={`f${i}`}
              className={styles.fine}
              style={{ left: x0 + u * travel, transform: `scaleY(${1 + 1.1 * g})`, opacity: 0.13 + 0.22 * g }}
            />
          )
        })}
        {samples.map((v, i) => (
          <span
            key={i}
            className={styles.mark}
            style={{ left: x0 + v * travel, transform: `scaleY(${1 + 0.55 * wave(v)})` }}
          />
        ))}
      </div>
    </div>
  )
}
