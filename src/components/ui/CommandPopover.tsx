import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/** Small keyboard-accessible overlays shared by CP, navigation and objective controls. */
export function useDismissableLayer(
  surface: RefObject<HTMLElement | null>,
  onClose: () => void,
  trigger?: RefObject<HTMLElement | null>,
) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = trigger?.current?.querySelector<HTMLElement>('button') ?? trigger?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const element = surface.current
    const controls = () => Array.from(element?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []).filter((node) => node.getClientRects().length > 0)
    ;(controls()[0] ?? element)?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !element?.contains(event.target) && !trigger?.current?.contains(event.target)) close.current()
    }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return }
      if (event.key !== 'Tab') return
      const items = controls()
      if (!items.length) { event.preventDefault(); element?.focus(); return }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus() }
    }
    document.addEventListener('pointerdown', outside)
    element?.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('pointerdown', outside)
      element?.removeEventListener('keydown', keyboard)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [surface, trigger])
}

export function CommandPopover({ children, label, onClose, trigger, role = 'dialog', className = '' }: {
  children: ReactNode
  label: string
  onClose: () => void
  trigger?: RefObject<HTMLElement | null>
  role?: 'dialog' | 'menu'
  className?: string
}) {
  const surface = useRef<HTMLDivElement>(null)
  useDismissableLayer(surface, onClose, trigger)
  return createPortal(<div ref={surface} role={role} aria-label={label} tabIndex={-1} className={`command-popover ${className}`} onKeyDown={(event) => {
    if (role !== 'menu' || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'))
    const index = items.indexOf(document.activeElement as HTMLElement)
    items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }}>{children}</div>, document.body)
}
