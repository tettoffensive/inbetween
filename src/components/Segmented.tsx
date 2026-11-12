import { Fragment, type ReactNode } from 'react'
import { ToggleGroup } from 'radix-ui'
import { motion } from 'motion/react'
import { useModifier } from '../hooks/hooks'
import { Tip } from './Tip'
import styles from './Segmented.module.css'

type Option<T extends string> = {
  value: T
  label: ReactNode
  /** Tooltip text on hover. */
  title?: string
  /** Inline shortcut pill that fades in while the modifier (⌘ / Ctrl) is held.
   *  The same string is also shown in the hover tooltip unless `shortcut` overrides it. */
  hint?: string
  /** Tooltip-only shortcut, when the hint pill should stay hidden. */
  shortcut?: string
}

const SWAP = { duration: 0.15, ease: [0.23, 1, 0.32, 1] } as const

/** Radix ToggleGroup with a raised pill that glides between options.
 *  While ⌥/Alt is held, each option with a `hint` swaps its label for a
 *  small kbd chip in the same spot, so the tabs never change size. */
export function Segmented<T extends string>({
  id,
  value,
  onChange,
  options,
  size = 'md',
  label,
  tipSide = 'top',
}: {
  id: string
  value: T
  onChange: (value: T) => void
  options: Option<T>[]
  size?: 'sm' | 'md'
  label: string
  tipSide?: 'top' | 'bottom'
}) {
  const modifier = useModifier()

  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className={styles.root}
      data-size={size}
      aria-label={label}
    >
      {options.map((o) => {
        const shortcut = o.shortcut ?? o.hint
        const swap = modifier && !!o.hint
        const item = (
          <ToggleGroup.Item value={o.value} className={styles.item} aria-label={o.title}>
            {value === o.value && (
              <motion.span
                layoutId={`${id}-pill`}
                className={styles.pill}
                transition={{ type: 'spring', duration: 0.35, bounce: 0.12 }}
              />
            )}
            {/* Label and shortcut share one cell: while the modifier is held the
                label crossfades to its chip, so nothing reserves extra width. */}
            <span className={styles.label}>
              <motion.span
                initial={false}
                animate={{ opacity: swap ? 0 : 1, scale: swap ? 0.85 : 1 }}
                transition={SWAP}
              >
                {o.label}
              </motion.span>
              {o.hint && (
                <motion.span
                  aria-hidden
                  className={styles.hint}
                  initial={false}
                  animate={{ opacity: swap ? 1 : 0, scale: swap ? 1 : 0.85 }}
                  transition={SWAP}
                >
                  {o.hint}
                </motion.span>
              )}
            </span>
          </ToggleGroup.Item>
        )
        return (
          <Fragment key={o.value}>
            {o.title || shortcut ? (
              <Tip label={o.title ?? shortcut} shortcut={shortcut} side={tipSide}>
                {item}
              </Tip>
            ) : (
              item
            )}
          </Fragment>
        )
      })}
    </ToggleGroup.Root>
  )
}
