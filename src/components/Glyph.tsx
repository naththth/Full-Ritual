type GlyphKind =
  | 'mandala'
  | 'skin'
  | 'body'
  | 'brain'
  | 'meal'
  | 'lotus'
  | 'spark'
  | 'orbit'
  | 'sun'
  | 'flame'
  | 'moon'
  | 'leaf';

interface GlyphProps {
  kind: GlyphKind;
  size?: number;
  color?: string;
  filled?: boolean;
  strokeWidth?: number;
}

/**
 * Glyph — sistema icônico do app. SVG vetorial, herda currentColor.
 * Substitui os caracteres unicode usados antes (○ ◌ ◐ etc).
 */
export function Glyph({ kind, size = 22, color = 'currentColor', filled = false, strokeWidth = 1.6 }: GlyphProps) {
  const base = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (kind) {
    case 'mandala':
      return (
        <svg {...base} aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4.5" />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = (i / 6) * Math.PI * 2;
            const x = 12 + Math.cos(a) * 6.5;
            const y = 12 + Math.sin(a) * 6.5;
            return <circle key={i} cx={x} cy={y} r="2.4" opacity="0.7" />;
          })}
          <circle cx="12" cy="12" r="1.2" fill={color} />
        </svg>
      );
    case 'sun':
      return (
        <svg {...base} aria-hidden>
          <circle cx="12" cy="12" r="4" fill={filled ? color : 'none'} />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const a = (i / 8) * Math.PI * 2;
            const x1 = 12 + Math.cos(a) * 7;
            const y1 = 12 + Math.sin(a) * 7;
            const x2 = 12 + Math.cos(a) * 10;
            const y2 = 12 + Math.sin(a) * 10;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </svg>
      );
    case 'skin':
      return (
        <svg {...base} aria-hidden>
          <path
            d="M12 3.5c3.2 3.8 5.2 6.8 5.2 10a5.2 5.2 0 0 1-10.4 0c0-3.2 2-6.2 5.2-10z"
            fill={filled ? color : 'none'}
          />
          <path d="M9.7 14.2c1.2 1 3.4 1 4.6 0" opacity="0.82" />
          <path d="M9.2 10.2h5.6" opacity="0.55" />
        </svg>
      );
    case 'flame':
      return (
        <svg {...base} aria-hidden>
          <path d="M12 3c1.5 3 4.5 4.5 4.5 8a4.5 4.5 0 0 1-9 0c0-1.8.9-3 2-4-.3 1.4.3 2.5 1.3 2.8C10.5 7.5 11 5 12 3z" fill={filled ? color : 'none'} />
          <path d="M10.5 14a2 2 0 0 0 3 0" />
        </svg>
      );
    case 'body':
      return (
        <svg {...base} aria-hidden>
          <circle cx="12" cy="5" r="2.1" fill={filled ? color : 'none'} />
          <path d="M12 7.5v5" />
          <path d="M7 10.2c1.5-1 3.2-1.5 5-1.5s3.5.5 5 1.5" />
          <path d="M10 12.5l-2.8 5M14 12.5l2.8 5" />
          <path d="M7.8 17.5h2.6M13.6 17.5h2.6" opacity="0.8" />
        </svg>
      );
    case 'moon':
      return (
        <svg {...base} aria-hidden>
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill={filled ? color : 'none'} />
          <circle cx="16" cy="9" r="0.8" fill={color} opacity="0.7" />
          <circle cx="19" cy="11" r="0.5" fill={color} opacity="0.5" />
        </svg>
      );
    case 'brain':
      return (
        <svg {...base} aria-hidden>
          <path
            d="M9.5 18.5H8a4 4 0 0 1-1.5-7.7A3.4 3.4 0 0 1 12 6.4a3.4 3.4 0 0 1 5.5 4.4A4 4 0 0 1 16 18.5h-1.5"
            fill={filled ? color : 'none'}
          />
          <path d="M12 6.4v12.1" />
          <path d="M9 10.2c1-.6 2-.5 3 .3M15 10.2c-1-.6-2-.5-3 .3" opacity="0.82" />
          <path d="M8.7 14.2c1.1-.4 2.2-.2 3.3.7M15.3 14.2c-1.1-.4-2.2-.2-3.3.7" opacity="0.82" />
        </svg>
      );
    case 'leaf':
      return (
        <svg {...base} aria-hidden>
          <path d="M5 19c0-7 5-13 14-14-1 9-7 14-14 14z" fill={filled ? color : 'none'} />
          <path d="M5 19c3-3 6-5 10-7" />
        </svg>
      );
    case 'meal':
      return (
        <svg {...base} aria-hidden>
          <circle cx="12" cy="13" r="5.2" fill={filled ? color : 'none'} />
          <circle cx="12" cy="13" r="2.6" opacity="0.65" />
          <path d="M5 4v6M7 4v6M5 7h2" />
          <path d="M18.5 4v16" />
          <path d="M18.5 4c1.1 1.2 1.6 2.5 1.4 3.8-.2 1.1-.7 1.9-1.4 2.4" />
        </svg>
      );
    case 'lotus':
      return (
        <svg {...base} aria-hidden>
          <path d="M12 5c-1 3-3 5-3 8 0 1.5 1.3 3 3 3s3-1.5 3-3c0-3-2-5-3-8z" fill={filled ? color : 'none'} />
          <path d="M5 14c1.5-2 4-3 7-3M19 14c-1.5-2-4-3-7-3" opacity="0.85" />
          <path d="M4 18c2-1 5-1.5 8-1.5s6 .5 8 1.5" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...base} aria-hidden>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
          <circle cx="12" cy="12" r="2" fill={color} />
        </svg>
      );
    case 'orbit':
    default:
      return (
        <svg {...base} aria-hidden>
          <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)" />
          <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(30 12 12)" />
          <circle cx="12" cy="12" r="2" fill={color} />
        </svg>
      );
  }
}
