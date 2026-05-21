interface RingProps {
  size?: number;
  stroke?: number;
  value: number; // 0..1
  color?: string;
  track?: string;
  children?: React.ReactNode;
  ariaLabel?: string;
  glow?: boolean;
}

export function Ring({
  size = 80,
  stroke = 8,
  value,
  color = 'var(--chocolate)',
  track = 'rgba(58,31,22,0.08)',
  children,
  ariaLabel,
  glow = false,
}: RingProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * clamped;

  return (
    <div
      style={{ width: size, height: size, position: 'relative' }}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {glow && (
          <defs>
            <filter id={`ring-glow-${size}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        )}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={track}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          filter={glow ? `url(#ring-glow-${size})` : undefined}
          style={{ transition: 'stroke-dasharray 640ms cubic-bezier(.16,.84,.4,1)' }}
        />
      </svg>
      {children && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--display)',
            color: 'var(--chocolate)',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * MultiRing — anel composto com gradientes vibrantes e glow.
 * Cada dimensão recebe um stroke degradê próprio (definido em <defs>).
 */
interface MultiRingProps {
  size?: number;
  stroke?: number;
  gap?: number;
  values: { value: number; color: string; key?: string }[];
  glow?: boolean;
}

const GRAD_STOPS: Record<string, [string, string]> = {
  '#E07A55': ['#F4A084', '#B8472A'],
  '#D89A82': ['#F4B89E', '#C9755A'],
  '#D9501A': ['#F47A3A', '#8E2E08'],
  '#B85A1F': ['#E48039', '#7E3508'],
  '#0E5B6E': ['#2FA0B8', '#062F3B'],
  '#1F4751': ['#3B8294', '#0A2229'],
  '#5B7A38': ['#92B95F', '#2E4419'],
  '#54683E': ['#86A55F', '#2B3A1C'],
  '#6B2856': ['#B25893', '#3A0F2D'],
  '#4A2A3F': ['#8B4A77', '#22101C'],
};

export function MultiRing({
  size = 180,
  stroke = 8,
  gap = 4,
  values,
  glow = true,
}: MultiRingProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' }}
    >
      <defs>
        {glow && (
          <filter id={`mr-glow-${size}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
        {values.map((v, i) => {
          const stops = GRAD_STOPS[v.color] ?? [v.color, v.color];
          return (
            <linearGradient key={i} id={`mr-grad-${size}-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={stops[0]} />
              <stop offset="100%" stopColor={stops[1]} />
            </linearGradient>
          );
        })}
      </defs>
      {values.map((v, i) => {
        const r = (size - stroke) / 2 - i * (stroke + gap);
        if (r < stroke) return null;
        const c = 2 * Math.PI * r;
        // Garante um arco mínimo visível mesmo quando a dimensão está em 0
        const ratio = Math.max(0, Math.min(1, v.value));
        const displayRatio = Math.max(ratio, 0.06);
        const dash = c * displayRatio;
        return (
          <g key={i}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={v.color}
              strokeOpacity={0.68}
              strokeWidth={stroke + 1}
              fill="none"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={`url(#mr-grad-${size}-${i})`}
              strokeWidth={stroke + 1}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
              opacity={ratio === 0 ? 0.9 : 1}
              filter={glow ? `url(#mr-glow-${size})` : undefined}
              style={{ transition: 'stroke-dasharray 800ms cubic-bezier(.16,.84,.4,1)' }}
            />
          </g>
        );
      })}
    </svg>
  );
}
