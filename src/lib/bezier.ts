/** A CSS cubic-bezier(x1, y1, x2, y2). x values are in [0, 1]; y may overshoot. */
export type Curve = readonly [number, number, number, number]

const a = (p1: number, p2: number) => 1 - 3 * p2 + 3 * p1
const b = (p1: number, p2: number) => 3 * p2 - 6 * p1
const c = (p1: number) => 3 * p1
const at = (t: number, p1: number, p2: number) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t
const slope = (t: number, p1: number, p2: number) => 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1)

/** Progress (y) at a given fraction of elapsed time (x). */
export function solve([x1, y1, x2, y2]: Curve, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  if (x1 === y1 && x2 === y2) return x

  // Newton–Raphson, falling back to bisection where the slope is flat.
  let t = x
  for (let i = 0; i < 8; i++) {
    const err = at(t, x1, x2) - x
    if (Math.abs(err) < 1e-6) return at(t, y1, y2)
    const d = slope(t, x1, x2)
    if (Math.abs(d) < 1e-6) break
    t -= err / d
  }
  let lo = 0
  let hi = 1
  t = x
  for (let i = 0; i < 40; i++) {
    const v = at(t, x1, x2)
    if (Math.abs(v - x) < 1e-6) break
    if (v < x) lo = t
    else hi = t
    t = (lo + hi) / 2
  }
  return at(t, y1, y2)
}

/** Tick sampling rate (ticks per second), like drawings in a film spacing chart.
    Playback itself runs at the display's refresh rate. */
export type TickRate = 12 | 24 | 30
export const TICK_RATES: TickRate[] = [12, 24, 30]
export function frameCount(durationMs: number, rate: TickRate = 24) {
  return Math.max(2, Math.round((durationMs / 1000) * rate))
}

/** Progress at equal time intervals: index i is at time i / intervals. */
export function sample(curve: Curve, intervals: number): number[] {
  return Array.from({ length: intervals + 1 }, (_, i) => solve(curve, i / intervals))
}

const round = (n: number) => Math.round(n * 1000) / 1000
const fmt = (n: number) => String(Math.round(n * 100) / 100)

export function format(curve: Curve) {
  return `cubic-bezier(${curve.map(fmt).join(', ')})`
}

export function clampCurve([x1, y1, x2, y2]: Curve): Curve {
  const cx = (v: number) => round(Math.min(1, Math.max(0, v)))
  const cy = (v: number) => round(Math.min(1.5, Math.max(-0.5, v)))
  return [cx(x1), cy(y1), cx(x2), cy(y2)]
}

export const sameCurve = (p: Curve, q: Curve) => p.every((v, i) => Math.abs(v - q[i]) < 0.005)

const KEYWORDS: Record<string, Curve> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
}

export type ParseResult = { ok: true; curve: Curve } | { ok: false; error: string }

/** Accepts a bare cubic-bezier(), a CSS keyword, or a full declaration containing one. */
export function parse(input: string): ParseResult {
  const text = input.trim().toLowerCase()
  if (!text) return { ok: false, error: 'Paste a cubic-bezier() or an easing keyword.' }

  if (/\blinear\s*\(/.test(text))
    return { ok: false, error: 'linear() isn’t supported yet. Paste a cubic-bezier() instead.' }
  if (/\bsteps\s*\(/.test(text)) return { ok: false, error: 'steps() can’t be shaped as a curve.' }

  const match = text.match(/cubic-bezier\s*\(([^)]*)\)?/)
  if (match) {
    if (!text.slice(match.index!).includes(')'))
      return { ok: false, error: 'Missing a closing parenthesis.' }
    const parts = match[1].split(',').map((s) => s.trim())
    if (parts.length !== 4)
      return { ok: false, error: `cubic-bezier() needs 4 numbers. Found ${parts.filter(Boolean).length}.` }
    const nums = parts.map(Number)
    const bad = parts.find((_, i) => !Number.isFinite(nums[i]) || parts[i] === '')
    if (bad !== undefined) return { ok: false, error: `“${bad || '(empty)'}” isn’t a number.` }
    const [x1, , x2] = nums
    for (const x of [x1, x2])
      if (x < 0 || x > 1) return { ok: false, error: `x values must be between 0 and 1. Got ${x}.` }
    return { ok: true, curve: nums.map(round) as unknown as Curve }
  }

  const word = text.replace(/;$/, '').split(/[\s:]+/).reverse().find((w) => w in KEYWORDS)
  if (word) return { ok: true, curve: KEYWORDS[word] }
  return { ok: false, error: 'Couldn’t find a cubic-bezier() or easing keyword.' }
}

/** Duration from pasted CSS, e.g. "600ms" or ".3s". Clamped to the slider range. */
export function parseDuration(input: string): number | null {
  const m = input.match(/(?:^|[\s:,(])(\d*\.?\d+)(ms|s)\b/i)
  if (!m) return null
  const ms = m[2].toLowerCase() === 's' ? parseFloat(m[1]) * 1000 : parseFloat(m[1])
  return Math.round(Math.min(1500, Math.max(100, ms)) / 10) * 10
}

/**
 * Deterministic feel nudges; work on any curve. Start/landing move one handle.
 * Overall scales both handles' distance from the linear diagonal: gentler
 * lowers the top speed, snappier raises it, and the curve keeps its shape.
 */
export type Nudge = 'gentler' | 'snappier' | 'start-slower' | 'start-quicker' | 'land-softer' | 'land-firmer'
const STEP = 0.08
/** Per-press scale of the handles' offset from linear for overall nudges. */
const OVERALL = 0.85

export function nudge([x1, y1, x2, y2]: Curve, kind: Nudge): Curve {
  // Keep nudges inside the unit square; they never introduce overshoot.
  const u = (v: number) => Math.min(1, Math.max(0, v))
  // Linear's own handles, at the thirds of the diagonal.
  const toward = (v: number, base: number, k: number) => u(base + (v - base) * k)
  switch (kind) {
    case 'gentler':
    case 'snappier': {
      const k = kind === 'gentler' ? OVERALL : 1 / OVERALL
      return clampCurve([toward(x1, 1 / 3, k), toward(y1, 1 / 3, k), toward(x2, 2 / 3, k), toward(y2, 2 / 3, k)])
    }
    case 'start-quicker': // steeper departure: first handle up and left
      return clampCurve([u(x1 - STEP), u(y1 + STEP), x2, y2])
    case 'start-slower': // ease in: first handle down and right
      return clampCurve([u(x1 + STEP), u(y1 - STEP), x2, y2])
    case 'land-softer': // ease out: second handle up and left
      return clampCurve([x1, y1, u(x2 - STEP), u(y2 + STEP)])
    case 'land-firmer': // arrives at speed: second handle down and right
      return clampCurve([x1, y1, u(x2 + STEP), u(y2 - STEP)])
  }
}

/** Point on the curve (P0 = 0,0, P3 = 1,1) at Bézier parameter u. */
export function pointAt([x1, y1, x2, y2]: Curve, u: number): [number, number] {
  const a = 3 * (1 - u) * (1 - u) * u
  const b = 3 * (1 - u) * u * u
  const c = u * u * u
  return [a * x1 + b * x2 + c, a * y1 + b * y2 + c]
}

/** Bézier parameter of the curve point nearest (x, y), by sampling then refining. */
export function nearestParam(curve: Curve, x: number, y: number): number {
  const dist = (u: number) => {
    const [px, py] = pointAt(curve, u)
    return (px - x) ** 2 + (py - y) ** 2
  }
  let best = 0
  for (let i = 1; i <= 100; i++) if (dist(i / 100) < dist(best)) best = i / 100
  // Narrow in around the best sample.
  let lo = Math.max(0, best - 0.01)
  let hi = Math.min(1, best + 0.01)
  for (let k = 0; k < 20; k++) {
    const m1 = lo + (hi - lo) / 3
    const m2 = hi - (hi - lo) / 3
    if (dist(m1) < dist(m2)) hi = m2
    else lo = m1
  }
  return (lo + hi) / 2
}

/** Bend grabs stay away from the ends, where the handles barely affect the curve. */
export const BEND_RANGE = [0.15, 0.85] as const

/**
 * Bend tool: move the curve so its point at parameter u travels by (dx, dy),
 * changing the two handles as little as possible (the minimal-norm solution:
 * each handle moves in proportion to its Bernstein weight at u). Exact unless
 * the result has to be clamped to CSS's 0–1 range for x.
 */
export function bend([x1, y1, x2, y2]: Curve, u: number, dx: number, dy: number): Curve {
  const b1 = 3 * (1 - u) * (1 - u) * u
  const b2 = 3 * (1 - u) * u * u
  const n = b1 * b1 + b2 * b2
  return clampCurve([x1 + (dx * b1) / n, y1 + (dy * b1) / n, x2 + (dx * b2) / n, y2 + (dy * b2) / n])
}

/**
 * The enter-leg time whose position matches an exit-leg moment: the exit leg
 * shows 1 - p(t), so find t' with p(t') = 1 - p(t). Nearest of 240 samples,
 * which handles overshooting curves and stays under a pixel at preview sizes.
 */
export function enterTimeFor(curve: Curve, t: number): number {
  const target = 1 - solve(curve, t)
  let best = 0
  let bestD = Infinity
  for (let i = 0; i <= 240; i++) {
    const u = i / 240
    const d = Math.abs(solve(curve, u) - target)
    if (d < bestD) {
      bestD = d
      best = u
    }
  }
  return best
}

/**
 * Time-reversed curve: an ease-out becomes the matching ease-in (and back).
 * Rotating the handles 180° around the centre plays the motion backwards.
 */
export function reverse([x1, y1, x2, y2]: Curve): Curve {
  return clampCurve([1 - x2, 1 - y2, 1 - x1, 1 - y1])
}

/** Named by when to use them; each suggests a duration. */
export const PRESETS: { name: string; curve: Curve; duration: number; use: string }[] = [
  { name: 'Enter/exit', curve: [0.23, 1, 0.32, 1], duration: 300, use: 'Strong ease-out: things appearing or leaving' },
  { name: 'Drawer', curve: [0.32, 0.72, 0, 1], duration: 500, use: 'Sheets and panels sliding in' },
  { name: 'Move', curve: [0.77, 0, 0.175, 1], duration: 250, use: 'Strong ease-in-out: moving on screen' },
  { name: 'Resize', curve: [0.25, 1, 0.5, 1], duration: 270, use: 'A container changing size' },
  { name: 'Fade', curve: [0.26, 0.08, 0.25, 1], duration: 200, use: 'Content crossfading inside a container' },
  { name: 'Linear', curve: [0, 0, 1, 1], duration: 600, use: 'Constant speed: hold-to-confirm, progress' },
]
