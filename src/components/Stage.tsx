import { memo, useMemo, useRef } from 'react'
import { Slider } from 'radix-ui'
import { AnimatePresence, motion } from 'motion/react'
import { PauseIcon, PlayIcon } from '@radix-ui/react-icons'
import { TICK_RATES, frameCount, sample, solve, type Curve, type TickRate } from '../lib/bezier'
import type { Subject } from '../lib/useEditor'
import { useElementWidth } from '../hooks/hooks'
import { Segmented } from './Segmented'
import { DurationSlider } from './Controls'
import styles from './Stage.module.css'

const TRAVEL = 200
const SIZE = 52
const TRAVEL_Y = 64
/** Faint ticks per drawing interval in the spacing ruler. */
const FINE = 3

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
        <Lane curve={curve} t={t} subject={subject} intervals={intervals} label="Current" />
        <AnimatePresence initial={false}>
          {reference && (
            <motion.div
              key="ref"
              initial={{ opacity: 0, height: 0, clipPath: 'inset(0 0 100% 0)' }}
              animate={{ opacity: 1, height: 'auto', clipPath: 'inset(0 0 0% 0)' }}
              exit={{ opacity: 0, height: 0, clipPath: 'inset(0 0 100% 0)' }}
              transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
            >
              <Lane curve={reference} t={t} subject={subject} intervals={intervals} label="Reference" reference />
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

      <div className={styles.duration}>
        <span className={styles.durLabel}>Duration</span>
        <DurationSlider value={duration} onChange={onDuration} />
        <span className={`${styles.durValue} tnum`}>{duration}ms</span>
      </div>
      <div className={styles.meta}>
        <p className="tnum">Ticks every 1/{tickRate} s · plays at full refresh rate</p>
        <Segmented
          id="tickrate"
          label="Ticks per second"
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
  subject,
  intervals,
  label,
  reference = false,
}: {
  curve: Curve
  t: number
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
  const y = solve(curve, t)
  const samples = useMemo(() => sample(curve, intervals), [curve, intervals])
  const active = Math.round(t * intervals)

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
      subjectStyle = { left: center, transform: `rotate(${y * 180}deg)` }
      break
  }

  return (
    <div className={styles.lane} data-reference={reference || undefined}>
      <span className={styles.laneLabel}>{label}</span>
      <div ref={ref} className={styles.track} data-kind={subject}>
        {subject === 'x' && <div className={styles.rail} style={{ left: start + SIZE / 2, width: travel }} />}
        <div
          className={styles.subject}
          data-kind={subject}
          style={{ width: SIZE, height: SIZE, ...subjectStyle }}
        >
        </div>
      </div>
      {/* Spacing ruler: faint ticks are an even time grid (where linear motion
          would be), bold ticks are where each drawing actually lands. */}
      <div className={styles.ruler} aria-hidden>
        {Array.from({ length: intervals * FINE + 1 }, (_, i) => (
          <span key={`f${i}`} className={styles.fine} style={{ left: start + SIZE / 2 + (i / (intervals * FINE)) * travel }} />
        ))}
        {samples.map((v, i) => (
          <span
            key={i}
            className={styles.mark}
            data-active={i === active || undefined}
            style={{ left: start + SIZE / 2 + v * travel }}
          />
        ))}
      </div>
    </div>
  )
}
