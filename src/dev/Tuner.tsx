import { useEffect, useState } from 'react'
import { Slider } from 'radix-ui'
import { AnimatePresence, motion } from 'motion/react'
import { CheckIcon, CopyIcon, MixerHorizontalIcon, ResetIcon } from '@radix-ui/react-icons'
import styles from './Tuner.module.css'

/** Dev-only live editor for the --k-* knobs in tokens.css. Toggle with \ */

type Knob = { key: string; label: string; min: number; max: number; step: number; def: number }

const GROUPS: { title: string; knobs: Knob[] }[] = [
  {
    title: 'Accent',
    knobs: [
      { key: 'accent-h', label: 'Hue', min: 0, max: 360, step: 1, def: 275 },
      { key: 'accent-c', label: 'Chroma', min: 0, max: 0.2, step: 0.005, def: 0.11 },
      { key: 'accent-l', label: 'Lightness', min: 0.4, max: 0.72, step: 0.01, def: 0.56 },
    ],
  },
  {
    title: 'Neutrals',
    knobs: [
      { key: 'neutral-h', label: 'Surface hue', min: 0, max: 360, step: 1, def: 78 },
      { key: 'neutral-c', label: 'Surface tint', min: 0, max: 0.03, step: 0.001, def: 0.004 },
      { key: 'ink-h', label: 'Ink hue', min: 0, max: 360, step: 1, def: 270 },
      { key: 'contrast', label: 'Surface contrast', min: 0, max: 2.5, step: 0.05, def: 1 },
      { key: 'border', label: 'Borders', min: 0, max: 2.5, step: 0.05, def: 1 },
    ],
  },
  {
    title: 'Depth',
    knobs: [
      { key: 'shadow', label: 'Shadow strength', min: 0, max: 3, step: 0.05, def: 1 },
      { key: 'soft', label: 'Shadow size', min: 0.25, max: 3, step: 0.05, def: 1 },
      { key: 'highlight', label: 'Top highlight', min: 0, max: 2, step: 0.05, def: 1 },
      { key: 'gradient', label: 'Gradient depth', min: 0, max: 2.5, step: 0.05, def: 1 },
    ],
  },
  {
    title: 'Shape',
    knobs: [{ key: 'radius', label: 'Radius', min: 0, max: 2, step: 0.05, def: 0.6 }],
  },
]

const ALL = GROUPS.flatMap((g) => g.knobs)
const DEFAULTS = Object.fromEntries(ALL.map((k) => [k.key, k.def]))

const ACCENTS: { name: string; h: number; c: number; l: number }[] = [
  { name: 'Iris', h: 275, c: 0.11, l: 0.56 },
  { name: 'Slate', h: 250, c: 0.05, l: 0.5 },
  { name: 'Teal', h: 195, c: 0.08, l: 0.55 },
  { name: 'Moss', h: 140, c: 0.07, l: 0.55 },
  { name: 'Amber', h: 65, c: 0.12, l: 0.64 },
  { name: 'Rose', h: 15, c: 0.1, l: 0.58 },
  { name: 'Graphite', h: 270, c: 0.01, l: 0.42 },
]

type Values = Record<string, number>

function load(): Values {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('tuner') || '{}') }
  } catch {
    return DEFAULTS
  }
}

const decimals = (step: number) => (String(step).split('.')[1] ?? '').length

export function Tuner() {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Values>(load)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const root = document.documentElement.style
    for (const k of ALL) root.setProperty(`--k-${k.key}`, String(values[k.key]))
    try {
      localStorage.setItem('tuner', JSON.stringify(values))
    } catch {
      /* ignore */
    }
  }, [values])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '\\' && !(e.target as HTMLElement).closest('input, textarea')) setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const set = (patch: Values) => setValues((v) => ({ ...v, ...patch }))
  const changed = ALL.filter((k) => values[k.key] !== k.def).length

  const copy = async () => {
    const body = ALL.map((k) => `  --k-${k.key}: ${values[k.key]};`).join('\n')
    try {
      await navigator.clipboard.writeText(`:root {\n  /* ---- Knobs ---- */\n${body}\n}`)
    } catch {
      /* ignore */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <>
      <button
        className={`btn btn-icon ${styles.fab}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Token tuner"
        title="Token tuner (\)"
        data-open={open || undefined}
      >
        <MixerHorizontalIcon />
        {changed > 0 && <span className={`${styles.badge} tnum`}>{changed}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.aside
            className={`card ${styles.panel}`}
            aria-label="Token tuner"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
          >
            <header className={styles.head}>
              <h2 className={styles.title}>Tokens</h2>
              <div className={styles.actions}>
                <button className="btn btn-ghost btn-icon" onClick={() => setValues(DEFAULTS)} title="Reset" aria-label="Reset">
                  <ResetIcon />
                </button>
                <button className="btn btn-primary" onClick={copy}>
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </header>

            <div className={styles.body}>
              <div className={styles.swatches}>
                {ACCENTS.map((a) => {
                  const on = values['accent-h'] === a.h && values['accent-c'] === a.c && values['accent-l'] === a.l
                  return (
                    <button
                      key={a.name}
                      className={styles.swatch}
                      data-on={on || undefined}
                      title={a.name}
                      aria-label={`${a.name} accent`}
                      style={{ background: `oklch(${a.l} ${a.c} ${a.h})` }}
                      onClick={() => set({ 'accent-h': a.h, 'accent-c': a.c, 'accent-l': a.l })}
                    />
                  )
                })}
              </div>

              {GROUPS.map((g) => (
                <section key={g.title} className={styles.group}>
                  <h3 className="eyebrow">{g.title}</h3>
                  {g.knobs.map((k) => (
                    <div key={k.key} className={styles.row}>
                      <label className={styles.label} onDoubleClick={() => set({ [k.key]: k.def })} title="Double-click to reset">
                        {k.label}
                        <span className={`${styles.value} tnum`} data-changed={values[k.key] !== k.def || undefined}>
                          {values[k.key].toFixed(decimals(k.step))}
                        </span>
                      </label>
                      <Slider.Root
                        className={styles.slider}
                        min={k.min}
                        max={k.max}
                        step={k.step}
                        value={[values[k.key]]}
                        onValueChange={([v]) => set({ [k.key]: +v.toFixed(decimals(k.step)) })}
                        aria-label={k.label}
                      >
                        <Slider.Track className={styles.track} data-hue={k.key.endsWith('-h') || undefined}>
                          <Slider.Range className={styles.range} />
                          {/* default marker */}
                          <span className={styles.def} style={{ left: `${((k.def - k.min) / (k.max - k.min)) * 100}%` }} />
                        </Slider.Track>
                        <Slider.Thumb className={styles.thumb} />
                      </Slider.Root>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
