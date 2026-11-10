import type { ReactNode } from 'react'
import { ToggleGroup } from 'radix-ui'
import { motion } from 'motion/react'
import styles from './Segmented.module.css'

type Option<T extends string> = { value: T; label: ReactNode; title?: string }

/** Radix ToggleGroup with a raised pill that glides between options. */
export function Segmented<T extends string>({
  id,
  value,
  onChange,
  options,
  size = 'md',
  label,
}: {
  id: string
  value: T
  onChange: (value: T) => void
  options: Option<T>[]
  size?: 'sm' | 'md'
  label: string
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className={styles.root}
      data-size={size}
      aria-label={label}
    >
      {options.map((o) => (
        <ToggleGroup.Item key={o.value} value={o.value} className={styles.item} title={o.title} aria-label={o.title}>
          {value === o.value && (
            <motion.span
              layoutId={`${id}-pill`}
              className={styles.pill}
              transition={{ type: 'spring', duration: 0.35, bounce: 0.12 }}
            />
          )}
          <span className={styles.label}>{o.label}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
