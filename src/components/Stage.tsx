import { memo, useMemo, useRef } from 'react'
import { Slider } from 'radix-ui'
import { AnimatePresence, motion } from 'motion/react'
import { PauseIcon, PlayIcon } from '@radix-ui/react-icons'
import { FPS, frameCount, sample, solve, type Curve } from '../lib/bezier'
import type { Subject } from '../lib/useEditor'
import { useElementWidth } from '../hooks/hooks'
import { Segmented } from './Segmented'
import styles from './Stage.module.css'

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
}) {
  const intervals = frameCount(duration)
  const frame = Math.round(t * intervals)

  return (
    <section className={`card ${styles.stage}`} aria-label="Preview">
      <header className={styles.bar}>
        <Segmented id="subject" label="Preview subject" value={subject} onChange={onSubject} options={SUBJECTS} />
        <p className={`${styles.meta} tnum`}>
          {FPS} fps · {intervals + 1} drawings
        </p>
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
          className="btn btn-icon"
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
        <p className={`${styles.time} tnum`}>
          <span>{String(Math.round(t * duration)).padStart(4, ' ')}</span>
          <span className={styles.dim}> / {duration}ms</span>
          <span className={styles.frame}>
            f{String(frame).padStart(2, '0')}
          </span>
        </p>
      </footer>
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
  const size = subject === 'dot' ? 20 : 56
  const travel = Math.max(0, width - 56)
  const y = solve(curve, t)
  const samples = useMemo(() => sample(curve, intervals), [curve, intervals])
  const active = Math.round(t * intervals)

  let subjectStyle: React.CSSProperties
  if (subject === 'slide' || subject === 'dot') {
    const offset = (56 - size) / 2
    subjectStyle = { transform: `translateX(${offset + y * travel}px)` }
  } else if (subject === 'scale') {
    subjectStyle = { left: travel / 2, transform: `scale(${0.25 + 0.75 * y})` }
  } else {
    subjectStyle = { left: travel / 2, opacity: Math.min(1, Math.max(0, y)) }
  }

  return (
    <div className={styles.lane} data-reference={reference || undefined}>
      <span className={styles.laneLabel}>{label}</span>
      <div ref={ref} className={styles.track}>
        <div className={styles.rail} />
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
            style={{ left: 28 + v * travel }}
          />
        ))}
      </div>
    </div>
  )
}
