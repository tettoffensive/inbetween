import { memo, useMemo, useRef } from 'react'
import { Slider } from 'radix-ui'
import { AnimatePresence, motion } from 'motion/react'
import { PauseIcon, PlayIcon } from '@radix-ui/react-icons'
import { TICK_RATES, frameCount, sample, solve, type Curve, type TickRate } from '../lib/bezier'
import type { Subject } from '../lib/useEditor'
import { useElementWidth, type Speed } from '../hooks/hooks'
import { Segmented } from './Segmented'
import { DurationSlider } from './Controls'
import styles from './Stage.module.css'

const SPEEDS: Speed[] = [1, 0.25, 0.1]

const TRAVEL = 200
const SIZE = 52
const TRAVEL_Y = 64
/** Faint ticks per drawing interval in the spacing ruler. */
/** Spacing between faint ruler ticks, in px. */
const FINE_PITCH = 5
/** Half-width of the wave crest travelling through the ruler, in px. */
const WAVE_WIDTH = 6

const SUBJECTS: { value: Subject; label: string }[] = [
  { value: 'x', label: 'Move X' },
  { value: 'y', label: 'Move Y' },
  { value: 'scale', label: 'Scale' },
  { value: 'fade', label: 'Fade' },
  { value: 'rotate', label: 'Rotate' },
]

export function Stage({
  curve,
  reference,
  duration,
  subject,
  onSubject,
  t,
  waveT,
  speed,
  onSpeed,
  cycle,
  playing,
  onPlaying,
  onScrub,
  onDuration,
  tickRate,
  onTickRate,
}: {
  curve: Curve
  reference: Curve | null
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
  playing: boolean
  onPlaying: (p: boolean) => void
  onScrub: (t: number) => void
  onDuration: (ms: number) => void
  tickRate: TickRate
  onTickRate: (r: TickRate) => void
}) {
  const intervals = frameCount(duration, tickRate)

  return (
    <section className={`card ${styles.stage}`} aria-label="Preview" style={{ gridArea: 'preview' }}>
      <header className={styles.bar}>
        <Segmented id="subject" label="Preview subject" size="sm" value={subject} onChange={onSubject} options={SUBJECTS} />
      </header>

      <div className={styles.lanes}>
        <Lane curve={curve} t={t} waveT={waveT} cycle={cycle} subject={subject} intervals={intervals} label="Current" />
        <AnimatePresence initial={false}>
          {reference && (
            <motion.div
              key="ref"
              initial={{ opacity: 0, height: 0, clipPath: 'inset(0 0 100% 0)' }}
              animate={{ opacity: 1, height: 'auto', clipPath: 'inset(0 0 0% 0)' }}
              exit={{ opacity: 0, height: 0, clipPath: 'inset(0 0 100% 0)' }}
              transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
            >
              <Lane curve={reference} t={t} waveT={waveT} cycle={cycle} subject={subject} intervals={intervals} label="Reference" reference />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <footer className={styles.transport}>
        <button
          className={`btn btn-primary btn-icon ${styles.play}`}
          onClick={() => onPlaying(!playing)}
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
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
        <span className={`${styles.elapsed} tnum`} aria-label="Elapsed time">
          {Math.round(t * duration)}
          <span className={styles.unit}>ms</span>
        </span>
      </footer>

      {/* Settings: one label column, controls right-aligned to the same edge. */}
      <div className={styles.settings}>
        <span className={styles.label}>Duration</span>
        <div className={styles.durationControl}>
          <DurationSlider value={duration} onChange={onDuration} />
          <span className={`${styles.durValue} tnum`}>{duration}ms</span>
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

        <span className={styles.label} title="Tick marks per second. Playback always runs at full refresh rate.">
          Frames
        </span>
        <Segmented
          id="tickrate"
          label="Frames per second for tick marks"
          size="sm"
          value={String(tickRate)}
          onChange={(v) => onTickRate(Number(v) as TickRate)}
          options={TICK_RATES.map((r) => ({ value: String(r), label: String(r), title: `${r} ticks per second` }))}
        />
      </div>
    </section>
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
  subject,
  intervals,
  label,
  reference = false,
}: {
  curve: Curve
  t: number
  waveT: number
  cycle: number
  subject: Subject
  intervals: number
  label: string
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
  const back = subject !== 'rotate' && cycle % 2 === 1
  const y = back ? 1 - p : p
  const samples = useMemo(() => sample(curve, intervals), [curve, intervals])
  // One wave crest sweeping the ruler at a steady rate (driven by time), so
  // it finishes exactly when the motion does. Every tick swells by its
  // distance from the crest. Super-Gaussian for a sharp fall-off.
  const x0 = start + SIZE / 2
  // The ruler charts the curve itself, which runs forward on every leg, so it
  // never mirrors: the wave always sweeps left → right with time.
  const wave = (pos: number) => {
    const d = ((pos - waveT) * travel) / WAVE_WIDTH
    return Math.exp(-(d * d * d * d))
  }
  // Faint ticks at a fixed pixel pitch so they never merge at long durations.
  const fineCount = Math.max(2, Math.round(travel / FINE_PITCH))

  // Each subject animates one property from a realistic UI start state.
  const center = start + travel / 2
  let subjectStyle: React.CSSProperties
  switch (subject) {
    case 'x':
      subjectStyle = { transform: `translateX(${start + y * travel}px)` }
      break
    case 'y': // rises into place
      subjectStyle = { left: center, transform: `translateY(${(0.5 - y) * TRAVEL_Y}px)` }
      break
    case 'scale':
      subjectStyle = { left: center, transform: `scale(${0.6 + 0.4 * y})` }
      break
    case 'fade':
      subjectStyle = { left: center, opacity: Math.min(1, Math.max(0, y)) }
      break
    case 'rotate':
      subjectStyle = { left: center, transform: `rotate(${(cycle + p) * 180}deg)` }
      break
  }

  return (
    <div className={styles.lane} data-reference={reference || undefined}>
      <span className={styles.laneLabel}>{label}</span>
      <div ref={ref} className={styles.track} data-kind={subject}>
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
          const g = wave(u)
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
