/**
 * DevTools-style number nudging, but the step follows the digit next to the
 * caret: after the ones digit → ±1, after the first decimal → ±0.1, and so on.
 * Returns the new text and caret, or null when the caret isn't touching a number.
 */
export function nudgeNumberAt(
  text: string,
  caret: number,
  direction: 1 | -1,
  multiplier = 1,
  /** Optional [min, max] to clamp the result to. */
  bounds?: readonly [number, number],
): { text: string; caret: number } | null {
  for (const m of text.matchAll(/-?\d*\.?\d+/g)) {
    const start = m.index!
    const raw = m[0]
    const end = start + raw.length
    if (caret < start || caret > end) continue

    const c = caret - start
    const isDigit = (i: number) => i >= 0 && i < raw.length && /\d/.test(raw[i])
    // Prefer the digit left of the caret, then right, then skip over the point.
    const idx = isDigit(c - 1) ? c - 1 : isDigit(c) ? c : isDigit(c - 2) ? c - 2 : -1
    if (idx < 0) return null

    const point = raw.includes('.') ? raw.indexOf('.') : raw.length
    const exponent = idx < point ? point - idx - 1 : -(idx - point)
    const decimals = Math.max(raw.length - point - 1, 0, -exponent)
    const step = 10 ** exponent * multiplier

    let value = Number(raw) + direction * step
    if (bounds) value = Math.min(bounds[1], Math.max(bounds[0], value))
    const next = (Math.round(value * 10 ** decimals) / 10 ** decimals).toFixed(decimals)
    // Keep the caret at the same distance from the number's end so it stays
    // beside the same decimal place even if the integer part grows.
    return {
      text: text.slice(0, start) + next + text.slice(end),
      caret: start + next.length - (end - caret),
    }
  }
  return null
}
