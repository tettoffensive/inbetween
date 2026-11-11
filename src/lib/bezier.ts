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

/** Deterministic feel nudges. Each moves one handle; works on any curve. */
export type Nudge = 'start-gentler' | 'start-snappier' | 'land-softer' | 'land-firmer'
const STEP = 0.06

export function nudge([x1, y1, x2, y2]: Curve, kind: Nudge): Curve {
  // Keep nudges inside the unit square; they never introduce overshoot.
  const u = (v: number) => Math.min(1, Math.max(0, v))
  switch (kind) {
    case 'start-snappier': // steeper departure: first handle up and left
      return clampCurve([u(x1 - STEP), u(y1 + STEP), x2, y2])
    case 'start-gentler': // ease in: first handle down and right
      return clampCurve([u(x1 + STEP), u(y1 - STEP), x2, y2])
    case 'land-softer': // ease out: second handle up and left
      return clampCurve([x1, y1, u(x2 - STEP), u(y2 + STEP)])
    case 'land-firmer': // arrives at speed: second handle down and right
      return clampCurve([x1, y1, u(x2 + STEP), u(y2 - STEP)])
  }
}

export const PRESETS: { name: string; curve: Curve }[] = [
  { name: 'Arrive', curve: [0.16, 1, 0.3, 1] },
  { name: 'Snappy', curve: [0.2, 0.9, 0.1, 1] },
  { name: 'Gentle', curve: [0.4, 0, 0.2, 1] },
  { name: 'In-out', curve: [0.65, 0, 0.35, 1] },
  { name: 'Depart', curve: [0.55, 0, 1, 0.45] },
  { name: 'Linear', curve: [0, 0, 1, 1] },
]
