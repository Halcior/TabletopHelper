import type { ReactNode } from 'react'

export function InfoDisclosure({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <details className={`info-disclosure ${className}`}>
    <summary><span className="info-disclosure__icon" aria-hidden="true">i</span>{label}</summary>
    <div className="info-disclosure__content">{children}</div>
  </details>
}
