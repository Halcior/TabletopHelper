import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDismissableLayer } from './CommandPopover'

export function CommandDialog({ children, label, onClose }: { children: ReactNode; label: string; onClose: () => void }) {
  const surface = useRef<HTMLDivElement>(null)
  useDismissableLayer(surface, onClose)
  return createPortal(<div className="command-dialog-backdrop"><div className="command-dialog" ref={surface} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div></div>, document.body)
}
