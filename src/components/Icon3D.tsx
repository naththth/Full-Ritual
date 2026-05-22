import type { CSSProperties } from 'react';

export type Icon3DKind =
  | 'home'
  | 'labs'
  | 'supplements'
  | 'vitals'
  | 'pain'
  | 'health'
  | 'skincare'
  | 'library'
  | 'body'
  | 'running'
  | 'cycling'
  | 'lifting'
  | 'olympic';

const COLOR_MAP: Record<Icon3DKind, { accent: string; deep: string }> = {
  home:        { accent: 'var(--gold)',   deep: 'var(--chocolate)'   },
  labs:        { accent: 'var(--mind)',   deep: 'var(--mind-deep)'   },
  supplements: { accent: 'var(--diet)',   deep: 'var(--diet-deep)'   },
  vitals:      { accent: 'var(--body)',   deep: 'var(--body-deep)'   },
  pain:        { accent: 'var(--spirit)', deep: 'var(--spirit-deep)' },
  health:      { accent: 'var(--mind)',   deep: 'var(--mind-deep)'   },
  skincare:    { accent: 'var(--skin)',   deep: 'var(--skin-deep)'   },
  library:     { accent: 'var(--mind)',   deep: 'var(--mind-deep)'   },
  body:        { accent: 'var(--body)',   deep: 'var(--body-deep)'   },
  running:     { accent: 'var(--body)',   deep: 'var(--body-deep)'   },
  cycling:     { accent: 'var(--body)',   deep: 'var(--body-deep)'   },
  lifting:     { accent: 'var(--diet)',   deep: 'var(--diet-deep)'   },
  olympic:     { accent: 'var(--spirit)', deep: 'var(--spirit-deep)' },
};

function IconSvg({ kind }: { kind: Icon3DKind }) {
  switch (kind) {
    case 'home':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M6.5 15.2 16 7.4l9.5 7.8" />
          <path d="M9.2 14.2v10.3h13.6V14.2" />
          <path d="M13.1 24.5v-6.2h5.8v6.2" />
          <path d="M20.8 9.8V7.4h3.3v5.1" />
        </svg>
      );
    case 'labs':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M13 8v8l-4 8h14l-4-8V8" />
          <path d="M11 8h10" />
          <path d="M10.5 19.5h11" />
          <circle cx="14" cy="22" r="1" fill="currentColor" />
          <circle cx="18" cy="20.5" r="0.8" fill="currentColor" />
        </svg>
      );
    case 'supplements':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <rect x="8" y="14" width="16" height="10" rx="5" />
          <rect x="8" y="14" width="8" height="10" fill="currentColor" opacity="0.35" />
          <path d="M16 14v10" />
          <circle cx="22" cy="9" r="3" />
          <path d="M22 7v4M20 9h4" />
        </svg>
      );
    case 'vitals':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <polyline points="4,16 8,10 12,20 16,8 20,18 24,12 28,16" />
        </svg>
      );
    case 'pain':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <circle cx="16" cy="16" r="9" />
          <path d="M16 12v5" />
          <circle cx="16" cy="20" r="0.8" fill="currentColor" />
        </svg>
      );
    case 'health':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M16 7c-4 0-7 2.7-7 6 0 5 7 12 7 12s7-7 7-12c0-3.3-3-6-7-6z" />
          <path d="M13 15h6M16 12v6" />
        </svg>
      );
    case 'skincare':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M11.5 25.5h9" />
          <path d="M13 11.5h6v14h-6z" />
          <path d="M13.8 8.2h4.4v3.3h-4.4z" />
          <path d="M14.7 6.2h2.6" />
          <path d="M16 15.2c2 1.7 3 3.3 3 4.8a3 3 0 0 1-6 0c0-1.5 1-3.1 3-4.8Z" />
        </svg>
      );
    case 'library':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M9 8.2h6.2c1.3 0 2.4.4 3.1 1.2v16.4c-.7-.8-1.8-1.2-3.1-1.2H9z" />
          <path d="M18.3 9.4c.7-.8 1.8-1.2 3.1-1.2H23v16.4h-1.6c-1.3 0-2.4.4-3.1 1.2" />
          <path d="M12 12.8h3.2M12 16.2h3.2" />
          <path d="M21 12v6.5l1.3-1 1.3 1V12" />
        </svg>
      );
    case 'body':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M16 7.2v17.6" />
          <path d="M11.2 10.8h9.6" />
          <path d="M12.8 24.8h6.4" />
          <path d="M9.2 13.2 6 20h6.4z" />
          <path d="m22.8 13.2-3.2 6.8H26z" />
          <path d="M7.8 20c.9 1.1 2.2 1.6 3.8 0" />
          <path d="M21.2 20c.9 1.1 2.2 1.6 3.8 0" />
        </svg>
      );
    case 'running':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <circle cx="20" cy="7" r="2.5" />
          <path d="M18 11l-4 3-3 6" />
          <path d="M14 14l5 3 2 6" />
          <path d="M9.5 19.5l-2 4" />
          <path d="M17 14l3-2" />
        </svg>
      );
    case 'cycling':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <circle cx="9" cy="22" r="5" />
          <circle cx="23" cy="22" r="5" />
          <path d="M9 22l5-9h5l4 9" />
          <path d="M14 13l3-5" />
          <circle cx="17" cy="7.5" r="1.5" />
        </svg>
      );
    case 'lifting':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M4 16h4M24 16h4" />
          <rect x="5" y="12" width="3" height="8" rx="1.5" />
          <rect x="24" y="12" width="3" height="8" rx="1.5" />
          <path d="M8 16h16" />
          <rect x="9" y="14" width="2" height="4" rx="1" />
          <rect x="21" y="14" width="2" height="4" rx="1" />
          <circle cx="16" cy="10" r="2.2" />
          <path d="M16 12.2v6" />
        </svg>
      );
    case 'olympic':
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M4 16h4M24 16h4" />
          <rect x="5" y="13" width="3" height="6" rx="1.5" />
          <rect x="24" y="13" width="3" height="6" rx="1.5" />
          <path d="M8 16h16" />
          <path d="M16 9v-2" />
          <path d="M14 10l-2-2M18 10l2-2" />
        </svg>
      );
  }
}

interface Icon3DProps {
  kind: Icon3DKind;
  size?: number;
  accentOverride?: string;
  deepOverride?: string;
  className?: string;
}

export function Icon3D({ kind, size = 42, accentOverride, deepOverride, className }: Icon3DProps) {
  const { accent, deep } = COLOR_MAP[kind];
  const a = accentOverride ?? accent;
  const d = deepOverride ?? deep;

  const style: CSSProperties = {
    '--icon3d-accent': a,
    '--icon3d-deep': d,
    width: size,
    height: size,
  } as CSSProperties;

  return (
    <span className={`icon3d${className ? ` ${className}` : ''}`} style={style} aria-hidden="true">
      <IconSvg kind={kind} />
    </span>
  );
}

export function Icon3DLarge({ kind, size = 64, accentOverride, deepOverride, className }: Icon3DProps) {
  const { accent, deep } = COLOR_MAP[kind];
  const a = accentOverride ?? accent;
  const d = deepOverride ?? deep;

  const style: CSSProperties = {
    '--icon3d-accent': a,
    '--icon3d-deep': d,
    width: size,
    height: size,
  } as CSSProperties;

  return (
    <span className={`icon3d icon3d--lg${className ? ` ${className}` : ''}`} style={style} aria-hidden="true">
      <IconSvg kind={kind} />
    </span>
  );
}
