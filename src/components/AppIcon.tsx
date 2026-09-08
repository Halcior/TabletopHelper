export type AppIconName =
  | 'army'
  | 'cards'
  | 'chevron'
  | 'eliminate'
  | 'home'
  | 'host'
  | 'import'
  | 'log'
  | 'mark'
  | 'mission'
  | 'movement'
  | 'next'
  | 'objectives'
  | 'overview'
  | 'qr'
  | 'ready'
  | 'signal'
  | 'shared'
  | 'target'

type AppIconProps = {
  name: AppIconName
  className?: string
}

export function AppIcon({ name, className = '' }: AppIconProps) {
  const commonProps = {
    className: `app-icon${className ? ` ${className}` : ''}`,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  }

  switch (name) {
    case 'mark':
      return <svg {...commonProps} viewBox="0 0 32 32">
        <path d="M16 2.5 27.7 9v14L16 29.5 4.3 23V9Z" />
        <circle cx="16" cy="16" r="6.5" />
        <path d="M16 6.5v5M16 20.5v5M6.5 16h5M20.5 16h5" />
        <circle cx="16" cy="16" r="1.8" fill="currentColor" stroke="none" />
      </svg>
    case 'home':
      return <svg {...commonProps}><path d="m3 10 9-7 9 7" /><path d="M5.5 9v11h13V9M9.5 20v-6h5v6" /></svg>
    case 'shared':
      return <svg {...commonProps}><circle cx="7" cy="8" r="3" /><circle cx="17" cy="7" r="2.5" /><path d="M2.5 20v-2.2A4.8 4.8 0 0 1 7.3 13h.4a4.8 4.8 0 0 1 4.8 4.8V20M14 13.2a4.3 4.3 0 0 1 7.5 2.9V19" /></svg>
    case 'host':
      return <svg {...commonProps}><path d="m4 8 4 4 4-7 4 7 4-4-1.5 10h-13Z" /><path d="M6 21h12" /></svg>
    case 'signal':
      return <svg {...commonProps}><path d="M4.5 10.5a10.6 10.6 0 0 1 15 0M7.5 13.5a6.4 6.4 0 0 1 9 0M10.5 16.5a2.1 2.1 0 0 1 3 0" /><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none" /></svg>
    case 'qr':
      return <svg {...commonProps}><rect x="3" y="3" width="6" height="6" rx=".5" /><rect x="15" y="3" width="6" height="6" rx=".5" /><rect x="3" y="15" width="6" height="6" rx=".5" /><path d="M15 15h2v2h-2zM19 15h2v4h-2zM15 19h4v2h-4z" /></svg>
    case 'ready':
      return <svg {...commonProps}><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></svg>
    case 'import':
      return <svg {...commonProps}><path d="M5 3h9l5 5v13H5Z" /><path d="M14 3v5h5M12 11v7M9 15l3 3 3-3" /></svg>
    case 'overview':
      return <svg {...commonProps}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2.5" /><path d="M12 3.5V7M12 17v3.5M3.5 12H7M17 12h3.5" /></svg>
    case 'army':
      return <svg {...commonProps}><path d="M12 3 20 6v5.3c0 4.7-3.3 8-8 9.7-4.7-1.7-8-5-8-9.7V6Z" /><path d="M8.5 12h7M12 8.5v7" /></svg>
    case 'objectives':
      return <svg {...commonProps}><path d="M5 21V4M5 5h11l-2 4 2 4H5" /><circle cx="5" cy="21" r="1" fill="currentColor" stroke="none" /></svg>
    case 'target':
      return <svg {...commonProps}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>
    case 'movement':
      return <svg {...commonProps}><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /><path d="M7 18h3.5a3 3 0 0 0 3-3v-6a3 3 0 0 1 3-3H17M14 12l-3 3 3 3" /></svg>
    case 'mission':
      return <svg {...commonProps}><path d="M12 3 20 7v5c0 4.2-3 7.3-8 9-5-1.7-8-4.8-8-9V7Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>
    case 'eliminate':
      return <svg {...commonProps}><path d="M6.5 16.5v-2.2a6.2 6.2 0 1 1 11 0v2.2l-2 2H8.5Z" /><path d="M9 19v2M12 18.5V21M15 19v2" /><circle cx="10" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="14" cy="12" r="1" fill="currentColor" stroke="none" /></svg>
    case 'cards':
      return <svg {...commonProps}><rect x="5" y="4" width="13" height="16" rx="1.5" /><path d="M8 8h7M8 12h7M8 16h4M3 7H2v13h12v-1" /></svg>
    case 'log':
      return <svg {...commonProps}><path d="M8 5h12M8 12h12M8 19h12" /><path d="M3.5 5h.1M3.5 12h.1M3.5 19h.1" /></svg>
    case 'chevron':
      return <svg {...commonProps}><path d="m9 5 7 7-7 7" /></svg>
    case 'next':
      return <svg {...commonProps}><path d="M4 12h14M13 6l6 6-6 6" /></svg>
  }
}
