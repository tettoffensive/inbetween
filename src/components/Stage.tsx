import { memo, useMemo, useRef } from 'react'
import { Slider } from 'radix-ui'
import { AnimatePresence, motion } from 'motion/react'
import { PauseIcon, PlayIcon } from '@radix-ui/react-icons'
import { FPS, frameCount, sample, solve, type Curve } from '../lib/bezier'
import type { Subject } from '../lib/useEditor'
import { useElementWidth } from '../hooks/hooks'
import { Segmented } from './Segmented'
import { DurationSlider } from './Controls'
import styles from './Stage.module.css'

const TRAVEL = 200
const SIZE = 52

const SUBJECTS: { value: Subject; label: string }[] = [
  { value: 'slide', label: 'Slide' },
  { value: 'dot', label: 'Dot' },
  { value: 'scale', label: 'Scale' },
  { value: 'fade', label: 'Fade' },
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
}) {
  const intervals = frameCount(duration)
  const frame = Math.round(t * intervals)

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
        <span className={`${styles.frame} tnum`} title={`${Math.round(t * duration)}ms`}>
          f{String(frame).padStart(2, '0')}
        </span>
      </footer>

      <div className={styles.duration}>
        <span className={styles.durLabel}>Duration</span>
        <DurationSlider value={duration} onChange={onDuration} />
        <span className={`${styles.durValue} tnum`}>{duration}ms</span>
      </div>
      <p className={`${styles.meta} tnum`}>
        {intervals + 1} drawings at {FPS} fps · dots are equal time apart
      </p>
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
  const size = subject === 'dot' ? 18 : SIZE
  // Realistic UI distance, centred in the lane.
  const travel = Math.max(0, Math.min(TRAVEL, width - SIZE))
  const start = Math.max(0, (width - travel - SIZE) / 2)
  const y = solve(curve, t)
  const samples = useMemo(() => sample(curve, intervals), [curve, intervals])
  const active = Math.round(t * intervals)

  let subjectStyle: React.CSSProperties
  if (subject === 'slide' || subject === 'dot') {
    const offset = (SIZE - size) / 2
    subjectStyle = { transform: `translateX(${start + offset + y * travel}px)` }
  } else if (subject === 'scale') {
    subjectStyle = { left: start + travel / 2, transform: `scale(${0.6 + 0.4 * y})` }
  } else {
    subjectStyle = { left: start + travel / 2, opacity: Math.min(1, Math.max(0, y)) }
  }

  return (
    <div className={styles.lane} data-reference={reference || undefined}>
      <span className={styles.laneLabel}>{label}</span>
      <div ref={ref} className={styles.track}>
        <div className={styles.rail} style={{ left: start + SIZE / 2, width: travel }} />
        <div
          className={styles.subject}
          data-kind={subject === 'dot' ? 'dot' : 'card'}
          style={{ width: size, height: size, ...subjectStyle }}
        >
          {subject !== 'dot' && <span className={styles.glyph} />}
        </div>
      </div>
      <div className={styles.dots} aria-hidden>
        {samples.map((v, i) => (
          <span
            key={i}
            className={styles.dot}
            data-active={i === active || undefined}
            data-key={i === 0 || i === intervals || undefined}
            style={{ left: start + SIZE / 2 + v * travel }}
          />
        ))}
      </div>
    </div>
  )
}
