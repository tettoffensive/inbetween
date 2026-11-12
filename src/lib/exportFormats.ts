import { format, type Curve } from './bezier'
import type { Subject } from './useEditor'

export type ExportFormat = 'css' | 'transition' | 'tailwind' | 'motion' | 'swiftui'

type Ctx = { curve: Curve; duration: number; subject: Subject }

/** The CSS property each preview subject animates. */
const PROPERTY: Record<Subject, string> = {
  x: 'transform',
  scale: 'transform',
  rotate: 'transform',
  resize: 'width',
  fade: 'opacity',
}

const nums = (c: Curve, sep = ', ') => c.map((v) => +v.toFixed(3)).join(sep)
const seconds = (ms: number) => +(ms / 1000).toFixed(3)
/** Tailwind's built-in duration steps; anything else uses an arbitrary value. */
const TW_DURATIONS = [75, 100, 150, 200, 300, 500, 700, 1000]

export const FORMATS: { id: ExportFormat; label: string; render: (c: Ctx) => string }[] = [
  { id: 'css', label: 'CSS', render: ({ curve }) => format(curve) },
  {
    id: 'transition',
    label: 'Transition',
    render: ({ curve, duration, subject }) => `transition: ${PROPERTY[subject]} ${duration}ms ${format(curve)};`,
  },
  {
    id: 'tailwind',
    label: 'Tailwind',
    render: ({ curve, duration }) =>
      `ease-[cubic-bezier(${nums(curve, ',')})] ${TW_DURATIONS.includes(duration) ? `duration-${duration}` : `duration-[${duration}ms]`}`,
  },
  {
    id: 'motion',
    label: 'Motion',
    render: ({ curve, duration }) => `{ duration: ${seconds(duration)}, ease: [${nums(curve)}] }`,
  },
  {
    id: 'swiftui',
    label: 'SwiftUI',
    render: ({ curve, duration }) => `.timingCurve(${nums(curve)}, duration: ${seconds(duration)})`,
  },
]

const KEY = 'export-format'

export function loadFormat(): ExportFormat {
  try {
    const v = localStorage.getItem(KEY)
    if (FORMATS.some((f) => f.id === v)) return v as ExportFormat
  } catch {
    /* private mode */
  }
  return 'css'
}

export function saveFormat(f: ExportFormat) {
  try {
    localStorage.setItem(KEY, f)
  } catch {
    /* private mode */
  }
}
