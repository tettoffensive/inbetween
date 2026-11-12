import { useEffect, useState } from 'react'
import { enterTimeFor, format, frameCount, nudge, reverse, sameCurve, type Nudge } from './lib/bezier'
import { DesktopIcon, MoonIcon, ResetIcon, SunIcon } from '@radix-ui/react-icons'
import { useEditor, type Subject } from './lib/useEditor'
import { usePlayback, useTheme, useTweenedCurve, type Speed } from './hooks/hooks'
import { Segmented } from './components/Segmented'
import { Stage } from './components/Stage'
import { CurveEditor } from './components/CurveEditor'
import { ShapePanel } from './components/Controls'
import { OutputBar } from './components/OutputBar'
import { Tip } from './components/Tip'
import styles from './App.module.css'

export default function App() {
  const [state, dispatch] = useEditor()
  const [theme, setTheme] = useTheme()
  const { curve } = state.present
  const shown = useTweenedCurve(curve, state.dragging)
  const [speed, setSpeed] = useState<Speed>(1)
  const playback = usePlayback(
    state.duration,
    speed,
    state.subject === 'rotate' ? undefined : (t) => enterTimeFor(curve, t),
  )
  const { setPlaying } = playback
  // Hovered/focused Feel nudge: the editor previews where one press lands.
  const [previewKind, setPreviewKind] = useState<Nudge | null>(null)
  const previewed = previewKind && nudge(curve, previewKind)
  const preview = previewed && !sameCurve(previewed, curve) ? previewed : null

  useEffect(() => {
    // An element that already handles ←/→ natively. We defer to it instead of
    // also scrubbing, so a focused Radix slider thumb still moves exactly one
    // frame, a focused bezier handle still moves the point, and a focused
    // ToggleGroup radio still cycles subjects.
    const consumesArrows = (el: HTMLElement | null) => {
      if (!el) return false
      const role = el.getAttribute('role')
      if (role === 'slider' || role === 'radio') return true
      // Bezier handles render as <button aria-label="…Start handle…, …">.
      if (el.tagName === 'BUTTON' && el.getAttribute('aria-label')?.includes('handle')) return true
      return false
    }
    const onKey = (e: KeyboardEvent) => {
      // Synthetic events can target window/document, which have no closest().
      const target = e.target instanceof HTMLElement ? e.target : null
      // Order matches Stage.tsx's SUBJECTS row so the chip laid out at i lines up with the key code at i.
      const SUBJECT_ORDER: Subject[] = ['x', 'scale', 'resize', 'fade', 'rotate']
      // ⌥1…⌥5 switch the preview subject. Runs BEFORE the input/textarea check
      // because users expect a global app shortcut to work everywhere — the
      // duration field or the CSS import field shouldn't swallow it. We use
      // Option (Alt) instead of ⌘ because Chrome reserves Cmd+1…9 for tab
      // switching on macOS even when focus is inside the tab.
      if (e.altKey && !e.shiftKey) {
        const match = e.code.match(/^Digit([1-5])$/) ?? e.code.match(/^Numpad([1-5])$/)
        if (match) {
          e.preventDefault()
          dispatch({ type: 'subject', value: SUBJECT_ORDER[Number(match[1]) - 1] })
          return
        }
      }
      if (target?.closest('input, textarea')) return
      // ←/→ step the playback one frame. We bail when a slider/radio/bezier
      // handle has focus so we don't double-apply their native arrow behaviour.
      if (!e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !consumesArrows(target)) {
        e.preventDefault()
        const frames = frameCount(state.duration, state.tickRate)
        const dir = e.key === 'ArrowRight' ? 1 : -1
        const frame = Math.round(playback.t * frames) + dir
        const next = Math.min(frames, Math.max(0, frame)) / frames
        // Scrub pauses playback as it seeks, which matches the expected
        // "stepped" feel; we also round to the nearest frame so successive
        // presses don't drift past a tick.
        playback.scrub(next)
        return
      }
      // 0 jumps back to frame 0 (pausing, like any scrub). After the
      // input/textarea check, so typing a 0 in a field is never hijacked.
      if (e.key === '0' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        playback.scrub(0)
        return
      }
      // ⌘Z / ⇧⌘Z — undo / redo. Cmd isn't a Chrome-tab conflict here, and
      // deferring to the focused input/textarea lets its native undo act.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
        return
      }
      if (e.key === ' ') {
        // Global play/pause. Captured before focused buttons/toggles see it,
        // so it never double-fires; Enter still activates focused controls.
        e.preventDefault()
        e.stopPropagation()
        if (!e.repeat) setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [dispatch, setPlaying, playback, state.duration, state.tickRate])

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Logo />
          <h1 className={styles.wordmark}>Inbetween</h1>
          <span className={styles.divider} />
          <p className={styles.tagline}>Design CSS easing by feel</p>
        </div>

        <div className={styles.tools}>
          <Tip label="Undo" shortcut="⌘Z" side="bottom">
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => dispatch({ type: 'undo' })}
              disabled={!state.past.length}
              aria-label="Undo"
            >
              <ResetIcon />
            </button>
          </Tip>
          <Tip label="Redo" shortcut="⇧⌘Z" side="bottom">
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => dispatch({ type: 'redo' })}
              disabled={!state.future.length}
              aria-label="Redo"
            >
              <ResetIcon style={{ transform: 'scaleX(-1)' }} />
            </button>
          </Tip>
          <Segmented
            id="theme"
            label="Theme"
            tipSide="bottom"
            size="sm"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: <SunIcon />, title: 'Light' },
              { value: 'dark', label: <MoonIcon />, title: 'Dark' },
              { value: 'system', label: <DesktopIcon />, title: 'System' },
            ]}
          />
        </div>
      </header>

      <main className={styles.main}>
        <ShapePanel curve={curve} dispatch={dispatch} onPreview={setPreviewKind} />
        <div className={styles.curveColumn}>
          <CurveEditor
            curve={curve}
            shown={shown}
            ghost={state.ghost}
            changeId={state.changeId}
            reference={state.reference}
            preview={preview}
            t={playback.t}
            duration={state.duration}
            tickRate={state.tickRate}
            onDragStart={() => dispatch({ type: 'checkpoint', drag: true })}
            onDrag={(c) => dispatch({ type: 'update', curve: c, source: 'custom' })}
            onDragEnd={() => dispatch({ type: 'endDrag' })}
            actions={{
              pinned: !!state.reference,
              canUndo: state.past.length > 0,
              canRedo: state.future.length > 0,
              onReverse: () => dispatch({ type: 'commit', curve: reverse(curve), source: 'custom' }),
              onTogglePin: () => dispatch({ type: state.reference ? 'unpin' : 'pin' }),
              onCopy: () => navigator.clipboard?.writeText(format(curve)).catch(() => {}),
              onUndo: () => dispatch({ type: 'undo' }),
              onRedo: () => dispatch({ type: 'redo' }),
            }}
          />
          <OutputBar curve={curve} duration={state.duration} subject={state.subject} dispatch={dispatch} />
        </div>
        <Stage
          curve={curve}
          reference={state.reference}
          onPin={() => dispatch({ type: state.reference ? 'unpin' : 'pin' })}
          duration={state.duration}
          subject={state.subject}
          onSubject={(value) => dispatch({ type: 'subject', value })}
          t={playback.t}
          waveT={playback.waveT}
          speed={speed}
          onSpeed={setSpeed}
          cycle={playback.cycle}
          exitLeg={playback.exitLeg}
          playing={playback.playing}
          onPlaying={playback.setPlaying}
          onScrub={playback.scrub}
          onDuration={(value) => dispatch({ type: 'duration', value })}
          tickRate={state.tickRate}
          onTickRate={(value) => dispatch({ type: 'tickRate', value })}
        />
      </main>
    </div>
  )
}

function Logo() {
  // Four drawings, spaced like an ease-out.
  return (
    <span className={styles.logo} aria-hidden>
      {[0, 0.55, 0.82, 0.95].map((x, i) => (
        <span key={i} style={{ left: `${x * 18 + 3}px`, opacity: 1 - i * 0.18 }} />
      ))}
    </span>
  )
}
