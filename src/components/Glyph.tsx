type GlyphKind = 'mandala' | 'sun' | 'flame' | 'moon' | 'leaf' | 'lotus' | 'spark' | 'orbit';

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
    case 'flame':
      return (
        <svg {...base} aria-hidden>
          <path d="M12 3c1.5 3 4.5 4.5 4.5 8a4.5 4.5 0 0 1-9 0c0-1.8.9-3 2-4-.3 1.4.3 2.5 1.3 2.8C10.5 7.5 11 5 12 3z" fill={filled ? color : 'none'} />
          <path d="M10.5 14a2 2 0 0 0 3 0" />
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
    case 'leaf':
      return (
        <svg {...base} aria-hidden>
          <path d="M5 19c0-7 5-13 14-14-1 9-7 14-14 14z" fill={filled ? color : 'none'} />
          <path d="M5 19c3-3 6-5 10-7" />
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
