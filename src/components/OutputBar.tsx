import { useEffect, useRef, useState, type Dispatch } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckIcon, ClipboardIcon, CopyIcon } from '@radix-ui/react-icons'
import { format, parse, parseDuration, type Curve } from '../lib/bezier'
import type { Action } from '../lib/useEditor'
import styles from './OutputBar.module.css'

/**
 * Pinned output: the CSS that reproduces the motion. The same field is the
 * import: click it (or paste anywhere) to replace the motion with pasted CSS.
 */
export function OutputBar({ curve, dispatch }: { curve: Curve; dispatch: Dispatch<Action> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Just the timing function: it drops into any transition or animation.
  const css = format(curve)

  const apply = (text: string) => {
    const r = parse(text)
    if (!r.ok) {
      setError(r.error)
      return false
    }
    setError(null)
    const ms = parseDuration(text)
    if (ms) dispatch({ type: 'duration', value: ms })
    dispatch({ type: 'commit', curve: r.curve, source: 'imported' })
    setEditing(false)
    return true
  }

  /** Open the field: prefilled with the current CSS (click) or empty (Paste). */
  const startEditing = (prefill = css) => {
    setDraft(prefill)
    setError(null)
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setError(null)
  }

  // Paste anywhere (outside other text fields) imports.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      const text = e.clipboardData?.getData('text')
      if (!text) return
      e.preventDefault()
      if (!apply(text)) {
        setDraft(text)
        setEditing(true)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(css)
    } catch {
      /* clipboard blocked; still show state so the demo reads */
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className={styles.dock}>
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            id="import-error"
            role="alert"
            className={styles.error}
            initial={{ opacity: 0, y: 6, clipPath: 'inset(100% 0 0 0)' }}
            animate={{ opacity: 1, y: 0, clipPath: 'inset(0% 0 0 0)' }}
            exit={{ opacity: 0, y: 4, clipPath: 'inset(100% 0 0 0)' }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
          >
            {error} Current motion is unchanged.
          </motion.p>
        )}
      </AnimatePresence>

      <div className={styles.bar} data-invalid={!!error || undefined}>
        <span className={styles.tag}>Easing</span>

        {editing ? (
          <form
            className={styles.field}
            onSubmit={(e) => {
              e.preventDefault()
              apply(draft)
            }}
          >
            <input
              ref={inputRef}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              className={styles.input}
              value={draft}
              placeholder="Paste cubic-bezier() or a transition…"
              spellCheck={false}
              aria-label="Paste CSS easing to import"
              aria-invalid={!!error}
              aria-describedby={error ? 'import-error' : undefined}
              onChange={(e) => {
                setDraft(e.target.value)
                if (error) setError(null)
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text')
                e.preventDefault()
                setDraft(text)
                apply(text)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancel()
              }}
              onBlur={() => {
                if (!error) cancel()
              }}
            />
          </form>
        ) : (
          <button className={styles.code} onClick={() => startEditing()} title="Click or paste anywhere to import CSS">
            <span className={styles.fn}>{css}</span>
          </button>
        )}

        <button
          className={`btn btn-ghost ${styles.paste}`}
          onClick={() => startEditing('')}
          aria-label="Paste CSS to import"
          title="Paste CSS to import (or ⌘V anywhere)"
        >
          <ClipboardIcon /> <span className={styles.copyText}>Paste</span>
        </button>
        <button className={`btn btn-primary ${styles.copy}`} onClick={copy} aria-live="polite" aria-label="Copy CSS">
          <span className={styles.copyLayer}>
            <CopyIcon /> <span className={styles.copyText}>Copy</span>
          </span>
          <span className={styles.copyLayer} data-overlay data-on={copied || undefined} aria-hidden={!copied}>
            <CheckIcon /> <span className={styles.copyText}>Copied</span>
          </span>
        </button>
      </div>
    </div>
  )
}
