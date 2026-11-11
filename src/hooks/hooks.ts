import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useReducedMotion } from 'motion/react'
import { solve, type Curve } from '../lib/bezier'

/** The UI's own easing, eaten as dogfood. */
export const UI_EASE: Curve = [0.2, 0.9, 0.1, 1]

/** Tweens the displayed curve toward its target; interruptible, instant while dragging. */
export function useTweenedCurve(target: Curve, instant: boolean): Curve {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState<Curve>(target)
  const shownRef = useRef<Curve>(target)

  useEffect(() => {
    if (instant || reduced) {
      shownRef.current = target
      setShown(target)
      return
    }
    const from = shownRef.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 280)
      const e = solve(UI_EASE, p)
      const next = from.map((v, i) => v + (target[i] - v) * e) as unknown as Curve
      shownRef.current = next
      setShown(next)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, instant, reduced])

  return shown
}

const HOLD_MS = 500

/**
 * How the preview loops:
 * - 'alternate': forward, hold, backward, hold (CSS animation-direction: alternate).
 *   Nothing ever snaps back.
 * - 'continue': forward, hold, forward again from where it left off. `cycle`
 *   counts completed runs so cumulative properties (rotation) keep going.
 */
export type LoopMode = 'alternate' | 'continue'

/** Looping playback clock. t is elapsed fraction of the duration (0–1). */
export function usePlayback(duration: number, mode: LoopMode) {
  const reduced = useReducedMotion()
  const [t, setT] = useState(0)
  const [cycle, setCycle] = useState(0)
  const [playing, setPlaying] = useState(!reduced)
  const tRef = useRef(0)
  const dirRef = useRef<1 | -1>(1)
  const cycleRef = useRef(0)

  // Switching to 'continue' always runs forward.
  useEffect(() => {
    if (mode === 'continue') dirRef.current = 1
  }, [mode])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let hold = 0
    const tick = (now: number) => {
      // Cap the step so a backgrounded tab resumes smoothly instead of skipping.
      const dt = Math.min(now - last, 50)
      last = now
      if (hold > 0) {
        hold -= dt
        if (hold <= 0) {
          // End of a pause: turn around, or start the next forward run.
          if (mode === 'alternate') {
            dirRef.current = tRef.current >= 1 ? -1 : 1
          } else if (tRef.current >= 1) {
            tRef.current = 0
            cycleRef.current += 1
            setCycle(cycleRef.current)
          }
        }
      } else {
        let next = tRef.current + (dirRef.current * dt) / duration
        if (next >= 1 || next <= 0) {
          next = next >= 1 ? 1 : 0
          hold = HOLD_MS
        }
        tRef.current = next
      }
      setT(tRef.current)
      raf = requestAnimationFrame(tick)
    }
    // Resuming exactly at an end: pause there first, then continue.
    if (tRef.current >= 1 || (tRef.current <= 0 && dirRef.current === -1)) hold = HOLD_MS
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, duration, mode])

  const scrub = (value: number) => {
    setPlaying(false)
    tRef.current = value
    setT(value)
  }
  return { t, cycle, playing, setPlaying, scrub }
}

export function useElementWidth<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Measure now so the first paint is right; observe for later changes.
    setWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

export type ThemeChoice = 'light' | 'dark' | 'system'

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    try {
      return (localStorage.getItem('theme') as ThemeChoice) || 'system'
    } catch {
      return 'system'
    }
  })

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = choice === 'system' ? (mq.matches ? 'dark' : 'light') : choice
      document.documentElement.dataset.theme = resolved
    }
    apply()
    try {
      localStorage.setItem('theme', choice)
    } catch {
      /* private mode */
    }
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [choice])

  return [choice, setChoice] as const
}
