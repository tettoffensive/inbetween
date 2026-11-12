import type { ReactNode } from 'react'
import { Tooltip } from 'radix-ui'

/**
 * Designed tooltip in place of the native `title`. Timing lives on the single
 * Tooltip.Provider in main.tsx: the first tip waits, neighbours then show
 * instantly with no animation (see `.tooltip` in base.css).
 */
export function Tip({
  label,
  shortcut,
  side = 'top',
  children,
}: {
  label: ReactNode
  /** Keyboard shortcut shown after the label, e.g. "⌘Z". */
  shortcut?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactNode
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" side={side} sideOffset={6} collisionPadding={8}>
          {label}
          {shortcut && <kbd className="tooltip-kbd">{shortcut}</kbd>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
