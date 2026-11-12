import { useId, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { motion } from 'motion/react'
import { ContextMenu } from 'radix-ui'
import { CopyIcon, DrawingPinFilledIcon, DrawingPinIcon, LoopIcon, ResetIcon } from '@radix-ui/react-icons'
import { clampCurve, frameCount, sample, solve, type Curve, type TickRate } from '../lib/bezier'
import styles from './CurveEditor.module.css'

// Plot space: x in [0,1] time, y in [-0.2, 1.2] progress. Square viewBox with margin.
const PAD = 0.2
const SPAN = 1 + PAD * 2
const DOT_STEP = 1 / 16
const sx = (x: number) => x
const sy = (y: number) => 1 - y
const pct = (v: number) => `${((v + PAD) / SPAN) * 100}%`

function pathFor([x1, y1, x2, y2]: Curve) {
  return `M 0 ${sy(0)} C ${sx(x1)} ${sy(y1)} ${sx(x2)} ${sy(y2)} 1 ${sy(1)}`
}

export function CurveEditor({
  curve,
  shown,
  ghost,
  changeId,
  reference,
  preview,
  t,
  duration,
  tickRate,
  onDragStart,
  onDrag,
  onDragEnd,
  actions,
}: {
  /** Committed curve (handle positions while dragging). */
  curve: Curve
  /** Tweened curve for display. */
  shown: Curve
  ghost: Curve | null
  changeId: number
  reference: Curve | null
  /** Where the hovered Feel nudge would put the curve. */
  preview: Curve | null
  t: number
  duration: number
  tickRate: TickRate
  onDragStart: () => void
  onDrag: (c: Curve) => void
  onDragEnd: () => void
  /** Right-click menu on the plot. */
  actions: CurveActions
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const dotsId = `dots-${useId().replace(/:/g, '')}`
  const intervals = frameCount(duration, tickRate)
  const samples = useMemo(() => sample(shown, intervals), [shown, intervals])
  const y = solve(shown, t)

  const toPlot = (e: PointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * SPAN - PAD
    const yy = 1 - (((e.clientY - r.top) / r.height) * SPAN - PAD)
    return [x, yy] as const
  }

  const move = (which: 0 | 1, x: number, yy: number) => {
    const next = [...curve] as [number, number, number, number]
    next[which * 2] = x
    next[which * 2 + 1] = yy
    onDrag(clampCurve(next))
  }

  const handleProps = (which: 0 | 1) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      onDragStart()
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
      const [x, yy] = toPlot(e)
      move(which, x, yy)
    },
    onPointerUp: () => onDragEnd(),
    onKeyDown: (e: KeyboardEvent) => {
      const step = e.shiftKey ? 0.1 : 0.01
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[
        e.key
      ]
      if (!d) return
      e.preventDefault()
      if (!e.repeat) onDragStart()
      move(which, curve[which * 2] + d[0], curve[which * 2 + 1] + d[1])
    },
    onKeyUp: () => onDragEnd(),
  })

  const [x1, y1, x2, y2] = shown

  return (
    <section className={`card ${styles.editor}`} aria-label="Curve">
      <header className={styles.head}>
        <h2 className="eyebrow">Curve</h2>
        <p className={`${styles.readout} tnum`}>
          <span>
            P1 <b>{fmt(curve[0])}</b>, <b>{fmt(curve[1])}</b>
          </span>
          <span>
            P2 <b>{fmt(curve[2])}</b>, <b>{fmt(curve[3])}</b>
          </span>
        </p>
      </header>

      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div className={styles.plotWrap}>
            <div className={`well ${styles.plot}`} ref={boxRef}>
              <svg viewBox={`${-PAD} ${-PAD} ${SPAN} ${SPAN}`} className={styles.svg} aria-hidden>
                {/* Dot grid in plot units: one dot every 1/16, landing on the 0 and 1
                    edges, fading out toward the edges of the plot. */}
                <defs>
                  <pattern id={`${dotsId}-p`} width={DOT_STEP} height={DOT_STEP} patternUnits="userSpaceOnUse" x={-DOT_STEP / 2} y={-DOT_STEP / 2}>
                    <circle cx={DOT_STEP / 2} cy={DOT_STEP / 2} r={0.0034} className={styles.dot} />
                  </pattern>
                  <radialGradient id={`${dotsId}-g`} cx="50%" cy="50%" r="60%">
                    <stop offset="55%" stopColor="#fff" />
                    <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                  </radialGradient>
                  <mask id={`${dotsId}-m`}>
                    <rect x={-PAD} y={-PAD} width={SPAN} height={SPAN} fill={`url(#${dotsId}-g)`} />
                  </mask>
                </defs>
                <rect x={0} y={0} width={1} height={1} className={styles.frame} />
                <rect
                  x={-PAD}
                  y={-PAD}
                  width={SPAN}
                  height={SPAN}
                  fill={`url(#${dotsId}-p)`}
                  mask={`url(#${dotsId}-m)`}
                />
                <line x1={0} y1={1} x2={1} y2={0} className={styles.diagonal} />

                {reference && <path d={pathFor(reference)} className={styles.reference} />}
                {preview && <path d={pathFor(preview)} className={styles.preview} />}

                {ghost && (
                  <motion.path
                    key={changeId}
                    d={pathFor(ghost)}
                    className={styles.ghost}
                    initial={{ opacity: 0.6 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1], delay: 0.15 }}
                  />
                )}

                <line x1={0} y1={sy(0)} x2={x1} y2={sy(y1)} className={styles.arm} />
                <line x1={1} y1={sy(1)} x2={x2} y2={sy(y2)} className={styles.arm} />

                <path d={pathFor(shown)} className={styles.curve} />

                {/* Spacing projected onto the progress axis: each frame's height.
                    Equal-time ticks below, resulting spacing on the left. */}
                {samples.map((v, i) => (
                  <line
                    key={i}
                    x1={-0.05}
                    x2={-0.012}
                    y1={sy(v)}
                    y2={sy(v)}
                    className={styles.spacing}
                    data-active={i === Math.round(t * intervals) || undefined}
                  />
                ))}

                {/* playhead */}
                <line x1={t} x2={t} y1={-PAD} y2={1 + PAD} className={styles.playhead} />
                <line x1={-PAD} x2={t} y1={sy(y)} y2={sy(y)} className={styles.playheadH} />
                <circle cx={t} cy={sy(y)} r={0.018} className={styles.playDot} />
              </svg>

              <button
                className={styles.handle}
                style={{ left: pct(x1), top: pct(1 - y1) }}
                aria-label={`Start handle, ${fmt(curve[0])}, ${fmt(curve[1])}. Arrow keys to move.`}
                {...handleProps(0)}
              />
              <button
                className={styles.handle}
                style={{ left: pct(x2), top: pct(1 - y2) }}
                aria-label={`Landing handle, ${fmt(curve[2])}, ${fmt(curve[3])}. Arrow keys to move.`}
                {...handleProps(1)}
              />

            </div>
          </div>
        </ContextMenu.Trigger>
        <CurveMenu {...actions} />
      </ContextMenu.Root>
    </section>
  )
}

const fmt = (n: number) => n.toFixed(2)

export type CurveActions = {
  pinned: boolean
  canUndo: boolean
  canRedo: boolean
  onReverse: () => void
  onTogglePin: () => void
  onCopy: () => void
  onUndo: () => void
  onRedo: () => void
}

function CurveMenu(a: CurveActions) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="menu" collisionPadding={8}>
        <ContextMenu.Item className="menu-item" onSelect={a.onReverse}>
          <span className="menu-indicator">
            <LoopIcon />
          </span>
          Reverse
        </ContextMenu.Item>
        <ContextMenu.Item className="menu-item" onSelect={a.onTogglePin}>
          <span className="menu-indicator">{a.pinned ? <DrawingPinFilledIcon /> : <DrawingPinIcon />}</span>
          {a.pinned ? 'Unpin reference' : 'Pin as reference'}
        </ContextMenu.Item>
        <ContextMenu.Item className="menu-item" onSelect={a.onCopy}>
          <span className="menu-indicator">
            <CopyIcon />
          </span>
          Copy cubic-bezier()
        </ContextMenu.Item>
        <ContextMenu.Separator className="menu-separator" />
        <ContextMenu.Item className="menu-item" disabled={!a.canUndo} onSelect={a.onUndo}>
          <span className="menu-indicator">
            <ResetIcon />
          </span>
          Undo
          <span className="menu-shortcut">⌘Z</span>
        </ContextMenu.Item>
        <ContextMenu.Item className="menu-item" disabled={!a.canRedo} onSelect={a.onRedo}>
          <span className="menu-indicator">
            <ResetIcon style={{ transform: 'scaleX(-1)' }} />
          </span>
          Redo
          <span className="menu-shortcut">⇧⌘Z</span>
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  )
}
