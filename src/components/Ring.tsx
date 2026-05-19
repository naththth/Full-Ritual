interface RingProps {
  size?: number;
  stroke?: number;
  value: number; // 0..1
  color?: string;
  track?: string;
  children?: React.ReactNode;
  ariaLabel?: string;
}

export function Ring({
  size = 80,
  stroke = 8,
  value,
  color = 'var(--chocolate)',
  track = 'rgba(74,44,34,0.08)',
  children,
  ariaLabel,
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
 * Anel composto — várias dimensões em camadas concêntricas.
 * Usado no card central de "Hoje" e nos dias do calendário.
 */
interface MultiRingProps {
  size?: number;
  stroke?: number;
  gap?: number;
  values: { value: number; color: string }[];
}

export function MultiRing({
  size = 180,
  stroke = 8,
  gap = 4,
  values,
}: MultiRingProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' }}
    >
      {values.map((v, i) => {
        const r = (size - stroke) / 2 - i * (stroke + gap);
        if (r < stroke) return null;
        const c = 2 * Math.PI * r;
        const dash = c * Math.max(0, Math.min(1, v.value));
        return (
          <g key={i}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke="rgba(74,44,34,0.06)"
              strokeWidth={stroke}
              fill="none"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={v.color}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
            />
          </g>
        );
      })}
    </svg>
  );
}
