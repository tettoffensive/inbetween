import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { DesktopIcon, MoonIcon, ResetIcon, SunIcon } from '@radix-ui/react-icons'
import { useEditor, presetName } from './lib/useEditor'
import { usePlayback, useTheme, useTweenedCurve } from './hooks/hooks'
import { Segmented } from './components/Segmented'
import { Stage } from './components/Stage'
import { CurveEditor } from './components/CurveEditor'
import { ShapePanel } from './components/Controls'
import { OutputBar } from './components/OutputBar'
import styles from './App.module.css'

export default function App() {
  const [state, dispatch] = useEditor()
  const [theme, setTheme] = useTheme()
  const { curve, source } = state.present
  const shown = useTweenedCurve(curve, state.dragging)
  const playback = usePlayback(state.duration)
  const { setPlaying } = playback

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea')) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
      } else if (e.key === ' ') {
        // Global play/pause. Captured before focused buttons/toggles see it,
        // so it never double-fires; Enter still activates focused controls.
        e.preventDefault()
        e.stopPropagation()
        if (!e.repeat) setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [dispatch, setPlaying])

  const name = presetName(curve)
  const sourceLabel = name ? name : source === 'imported' ? 'CSS' : 'Custom'

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Logo />
          <h1 className={styles.wordmark}>Inbetween</h1>
          <span className={styles.divider} />
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={sourceLabel}
              className={styles.source}
              initial={{ opacity: 0, y: 6, filter: 'blur(2px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            >
              <span className={styles.sourceKind}>{name ? 'Preset' : source === 'imported' ? 'Imported' : 'Edited'}</span>
              {sourceLabel}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className={styles.tools}>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => dispatch({ type: 'undo' })}
            disabled={!state.past.length}
            aria-label="Undo"
            title="Undo (⌘Z)"
          >
            <ResetIcon />
          </button>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => dispatch({ type: 'redo' })}
            disabled={!state.future.length}
            aria-label="Redo"
            title="Redo (⇧⌘Z)"
          >
            <ResetIcon style={{ transform: 'scaleX(-1)' }} />
          </button>
          <Segmented
            id="theme"
            label="Theme"
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
        <ShapePanel curve={curve} reference={state.reference} dispatch={dispatch} />
        <CurveEditor
          curve={curve}
          shown={shown}
          ghost={state.ghost}
          changeId={state.changeId}
          reference={state.reference}
          t={playback.t}
          duration={state.duration}
          tickRate={state.tickRate}
          onDragStart={() => dispatch({ type: 'checkpoint', drag: true })}
          onDrag={(c) => dispatch({ type: 'update', curve: c, source: 'custom' })}
          onDragEnd={() => dispatch({ type: 'endDrag' })}
        />
        <Stage
          curve={curve}
          reference={state.reference}
          duration={state.duration}
          subject={state.subject}
          onSubject={(value) => dispatch({ type: 'subject', value })}
          t={playback.t}
          playing={playback.playing}
          onPlaying={playback.setPlaying}
          onScrub={playback.scrub}
          onDuration={(value) => dispatch({ type: 'duration', value })}
          tickRate={state.tickRate}
          onTickRate={(value) => dispatch({ type: 'tickRate', value })}
        />
      </main>
      <OutputBar curve={curve} dispatch={dispatch} />
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
