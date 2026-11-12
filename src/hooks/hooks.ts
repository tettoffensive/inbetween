import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
  type SetStateAction,
} from 'react'
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
export type Speed = 1 | 0.25 | 0.1

/** `speed` slows the clock for inspection; t still maps to the real duration. */
/**
 * `toEnterTime` maps an exit-leg moment to the enter-leg time with the same
 * position. Pausing on an exit leg uses it so the subject stays exactly where
 * it is while the scrubber moves to the matching point; paused, the timeline
 * always reads as the enter leg (frame 0 = start). Omit it for subjects with
 * no exit leg (Rotate).
 */
/** Playback time, kept outside React state so a frame doesn't re-render the app. */
export type ClockState = {
  t: number
  /** Like t, but keeps running through the hold (> 1) so effects can follow through. */
  waveT: number
  /** Completed runs. Odd runs play the opposite change (exit); rotation accumulates. */
  cycle: number
}
export type Clock = {
  get: () => ClockState
  subscribe: (fn: () => void) => () => void
}

function createClock() {
  let state: ClockState = { t: 0, waveT: 0, cycle: 0 }
  const subs = new Set<() => void>()
  return {
    get: () => state,
    set: (next: ClockState) => {
      state = next
      subs.forEach((fn) => fn())
    },
    subscribe: (fn: () => void) => {
      subs.add(fn)
      return () => void subs.delete(fn)
    },
  }
}

/** Re-render with the clock. For small readouts only; per-frame motion should use `useClockEffect`. */
export function useClock(clock: Clock): ClockState {
  return useSyncExternalStore(clock.subscribe, clock.get)
}

/** Re-renders only when the loop flips between enter and exit legs. */
export function useExitLeg(clock: Clock): boolean {
  return useSyncExternalStore(clock.subscribe, () => clock.get().cycle % 2 === 1)
}

/**
 * Run `apply` on every clock tick and after every render, without re-rendering.
 * For writing styles straight to the DOM.
 */
export function useClockEffect(clock: Clock, apply: (s: ClockState) => void) {
  const applyRef = useRef(apply)
  useLayoutEffect(() => {
    applyRef.current = apply
    apply(clock.get())
  })
  useLayoutEffect(() => clock.subscribe(() => applyRef.current(clock.get())), [clock])
}

export function usePlayback(duration: number, speed: Speed = 1, toEnterTime?: (t: number) => number) {
  const span = duration / speed
  const reduced = useReducedMotion()
  const [clock] = useState(createClock)
  const [playing, setPlayingState] = useState(!reduced)
  const tRef = useRef(0)
  const cycleRef = useRef(0)
  const playingRef = useRef(playing)
  const toEnterRef = useRef(toEnterTime)
  useLayoutEffect(() => {
    toEnterRef.current = toEnterTime
  })

  const setPlaying = useCallback(
    (v: SetStateAction<boolean>) => {
      const next = typeof v === 'function' ? v(playingRef.current) : v
      playingRef.current = next
      if (!next) {
        // Pausing mid exit leg: keep the subject still and move the time
        // instead, then count this loop as an enter leg. Paused, the timeline
        // always reads as the enter leg, and resuming flows into the next
        // exit leg without a snap.
        const map = toEnterRef.current
        if (map && cycleRef.current % 2 === 1) {
          const tt = map(tRef.current)
          tRef.current = tt
          cycleRef.current += 1
          clock.set({ t: tt, waveT: tt, cycle: cycleRef.current })
        }
      }
      setPlayingState(next)
    },
    [clock],
  )

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
        }
      } else {
        tRef.current = Math.min(1, tRef.current + dt / span)
        if (tRef.current >= 1) hold = HOLD_MS
      }
      clock.set({
        t: tRef.current,
        waveT: hold > 0 ? 1 + (HOLD_MS - hold) / span : tRef.current,
        cycle: cycleRef.current,
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, span, clock])

  const scrub = (value: number) => {
    setPlaying(false)
    tRef.current = value
    clock.set({ t: value, waveT: value, cycle: cycleRef.current })
  }
  return { clock: clock as Clock, playing, setPlaying, scrub }
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

/** Captured at import: false on the server, so the initial paint matches the client. */
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)

/** The platform's shortcut modifier. We use Option (⌥) / Alt instead of ⌘ / Ctrl
 *  for the subject shortcuts because Chrome and most browsers swallow Cmd+1…9
 *  (browser tab switching) even when focus is on the page. */
export const MOD_KEY = IS_MAC ? '⌥' : 'Alt'

/** Format a shortcut like "1" → "⌥1" / "Alt+1", or shorthand: "Z" → "⌥Z" / "Alt+Z". */
export function fmtShortcut(...keys: string[]) {
  const tail = keys.join('+')
  return IS_MAC ? `${MOD_KEY}${tail}` : `${MOD_KEY}+${tail}`
}

/** True while the platform's primary modifier (⌘ on macOS, Ctrl elsewhere) is held down.
 *  Used to surface shortcut hints on hover-able controls, a la Claude Desktop.
 *  Module-level so the app shares one window listener and one snapshot; many
 *  `useModifier` calls subscribe without re-attaching. */
const metaModule: {
  subscribe(cb: () => void): () => void
  getSnapshot(): boolean
} = (() => {
  let down = false
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())
  if (typeof window !== 'undefined') {
    const onKey = (e: KeyboardEvent) => {
      // Only the modifier key itself carries state; ignore every other keypress.
      if (e.key !== 'Alt') return
      // Auto-repeat fires keydown repeatedly for a held key — those repeats
      // don't change state, so skip them to keep the snapshot stable.
      if (e.type === 'keydown' && e.repeat) return
      const next = e.type === 'keydown'
      if (next !== down) {
        down = next
        notify()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    // Alt-tabbing releases the key on the OS side without firing keyup to us; self-heal on focus loss.
    window.addEventListener('blur', () => {
      if (down) {
        down = false
        notify()
      }
    })
  }
  return {
    subscribe(cb: () => void) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    getSnapshot: () => down,
  }
})()

export function useModifier() {
  return useSyncExternalStore(metaModule.subscribe, metaModule.getSnapshot, metaModule.getSnapshot)
}

export type ThemeChoice = 'light' | 'dark' | 'system'

/**
 * Switch theme as one coordinated change. Without this, every element with
 * its own colour transition (buttons, segmented pills, sliders) fades at its
 * own speed while the rest snaps, which reads as a random stagger. Per-element
 * transitions are frozen for the swap and the whole page crossfades once via
 * a View Transition; without support (or with reduced motion) it's instant.
 */
function swapTheme(next: string) {
  const root = document.documentElement
  if (root.dataset.theme === next) return
  root.classList.add('theme-swap')
  const release = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-swap')))
  const commit = () => {
    root.dataset.theme = next
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduced && typeof document.startViewTransition === 'function') {
    document.startViewTransition(commit).finished.finally(release)
  } else {
    commit()
    release()
  }
}

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
      swapTheme(resolved)
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
