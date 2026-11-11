import { useReducer } from 'react'
import { PRESETS, sameCurve, type Curve, type TickRate } from './bezier'

export type Subject = 'x' | 'y' | 'scale' | 'fade' | 'rotate'
export type Source = 'preset' | 'custom' | 'imported'

type Snapshot = { curve: Curve; source: Source }

export type EditorState = {
  present: Snapshot
  past: Snapshot[]
  future: Snapshot[]
  /** Curve before the last discrete change, shown briefly as a ghost. */
  ghost: Curve | null
  /** Bumps on each discrete change so the ghost can replay. */
  changeId: number
  /** True while a handle is being dragged: no tweening. */
  dragging: boolean
  duration: number
  subject: Subject
  reference: Curve | null
  tickRate: TickRate
}

export type Action =
  | { type: 'commit'; curve: Curve; source: Source }
  /** Start of a held/repeated gesture: one history entry for the whole gesture. */
  | { type: 'checkpoint'; drag?: boolean }
  | { type: 'update'; curve: Curve; source: Source }
  | { type: 'endDrag' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'duration'; value: number }
  | { type: 'subject'; value: Subject }
  | { type: 'tickRate'; value: TickRate }
  | { type: 'pin' }
  | { type: 'unpin' }

const LIMIT = 100

function reducer(s: EditorState, a: Action): EditorState {
  switch (a.type) {
    case 'commit':
      if (sameCurve(a.curve, s.present.curve) && a.source === s.present.source) return s
      return {
        ...s,
        past: [...s.past, s.present].slice(-LIMIT),
        future: [],
        present: { curve: a.curve, source: a.source },
        ghost: s.present.curve,
        changeId: s.changeId + 1,
        dragging: false,
      }
    case 'checkpoint':
      return {
        ...s,
        past: [...s.past, s.present].slice(-LIMIT),
        future: [],
        ghost: a.drag ? null : s.present.curve,
        changeId: s.changeId + 1,
        dragging: !!a.drag,
      }
    case 'update':
      return { ...s, present: { curve: a.curve, source: a.source } }
    case 'endDrag':
      return { ...s, dragging: false }
    case 'undo': {
      const prev = s.past.at(-1)
      if (!prev) return s
      return {
        ...s,
        past: s.past.slice(0, -1),
        future: [s.present, ...s.future],
        present: prev,
        ghost: s.present.curve,
        changeId: s.changeId + 1,
      }
    }
    case 'redo': {
      const next = s.future[0]
      if (!next) return s
      return {
        ...s,
        past: [...s.past, s.present],
        future: s.future.slice(1),
        present: next,
        ghost: s.present.curve,
        changeId: s.changeId + 1,
      }
    }
    case 'duration':
      return { ...s, duration: a.value }
    case 'subject':
      return { ...s, subject: a.value }
    case 'tickRate':
      return { ...s, tickRate: a.value }
    case 'pin':
      return { ...s, reference: s.present.curve }
    case 'unpin':
      return { ...s, reference: null }
  }
}

const initial: EditorState = {
  present: { curve: PRESETS[0].curve, source: 'preset' },
  past: [],
  future: [],
  ghost: null,
  changeId: 0,
  dragging: false,
  duration: 600,
  subject: 'x',
  reference: null,
  tickRate: 24,
}

export function useEditor() {
  return useReducer(reducer, initial)
}

export function presetName(curve: Curve) {
  return PRESETS.find((p) => sameCurve(p.curve, curve))?.name ?? null
}
