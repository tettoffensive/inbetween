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
 * Looping playback clock. Time always runs forward: t goes 0 → 1, holds,
 * then the next run starts. `cycle` counts completed runs; the preview uses
 * it to alternate enter/exit (odd runs play the opposite change, still
 * along the curve) and to accumulate rotation.
 */
export function usePlayback(duration: number) {
  const reduced = useReducedMotion()
  const [t, setT] = useState(0)
  const [cycle, setCycle] = useState(0)
  const [playing, setPlaying] = useState(!reduced)
  const tRef = useRef(0)
  const cycleRef = useRef(0)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    // Resuming exactly at the end: hold there first.
    let hold = tRef.current >= 1 ? HOLD_MS : 0
    const tick = (now: number) => {
      // Cap the step so a backgrounded tab resumes smoothly instead of skipping.
      const dt = Math.min(now - last, 50)
      last = now
      if (hold > 0) {
        hold -= dt
        if (hold <= 0) {
          tRef.current = 0
          cycleRef.current += 1
          setCycle(cycleRef.current)
        }
      } else {
        tRef.current = Math.min(1, tRef.current + dt / duration)
        if (tRef.current >= 1) hold = HOLD_MS
      }
      setT(tRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, duration])

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
