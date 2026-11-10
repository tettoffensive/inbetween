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

/** Looping playback clock. t is elapsed fraction of the duration (0–1). */
export function usePlayback(duration: number) {
  const reduced = useReducedMotion()
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(!reduced)
  const tRef = useRef(0)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    // Resume from the current position.
    let origin = performance.now() - tRef.current * duration
    const tick = (now: number) => {
      let elapsed = now - origin
      if (elapsed > duration + HOLD_MS) {
        origin = now
        elapsed = 0
      }
      const next = Math.min(1, elapsed / duration)
      tRef.current = next
      setT(next)
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
  return { t, playing, setPlaying, scrub }
}

export function useElementWidth<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
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
