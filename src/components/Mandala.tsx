interface MandalaProps {
  size?: number;
  petals?: number;
  spin?: boolean;
  glow?: boolean;
  variant?: 'aurora' | 'gold' | 'mono';
}

/**
 * Mandala — símbolo central do app. Geometria sagrada (flor da vida + raios)
 * em SVG animado. Usado na Home (centro do anel), Login, e como logo.
 */
export function Mandala({
  size = 96,
  petals = 8,
  spin = true,
  glow = true,
  variant = 'aurora',
}: MandalaProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const innerR = size * 0.18;
  const dotR = size * 0.045;

  const stroke = variant === 'gold' ? 'url(#mandalaGold)' : variant === 'mono' ? 'currentColor' : 'url(#mandalaAurora)';
  const filter = glow ? 'url(#mandalaGlow)' : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={spin ? 'mandala mandala--spin' : 'mandala'}
      aria-hidden
    >
      <defs>
        <linearGradient id="mandalaAurora" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#B25893" />
          <stop offset="33%" stopColor="#2FA0B8" />
          <stop offset="66%" stopColor="#92B95F" />
          <stop offset="100%" stopColor="#F47A3A" />
        </linearGradient>
        <linearGradient id="mandalaGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F4D88A" />
          <stop offset="50%" stopColor="#D4A24C" />
          <stop offset="100%" stopColor="#B8862F" />
        </linearGradient>
        <filter id="mandalaGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* anel externo */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth={1.2} opacity="0.55" filter={filter} />
      <circle cx={cx} cy={cy} r={r * 0.84} fill="none" stroke={stroke} strokeWidth={0.8} opacity="0.4" />

      {/* pétalas (círculos rotacionados) */}
      {Array.from({ length: petals }).map((_, i) => {
        const angle = (i / petals) * Math.PI * 2;
        const px = cx + Math.cos(angle) * r * 0.55;
        const py = cy + Math.sin(angle) * r * 0.55;
        return (
          <circle
            key={i}
            cx={px}
            cy={py}
            r={r * 0.34}
            fill="none"
            stroke={stroke}
            strokeWidth={1}
            opacity="0.55"
            filter={filter}
          />
        );
      })}

      {/* raios internos */}
      {Array.from({ length: petals * 2 }).map((_, i) => {
        const angle = (i / (petals * 2)) * Math.PI * 2;
        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * r * 0.78;
        const y2 = cy + Math.sin(angle) * r * 0.78;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={stroke}
            strokeWidth={0.6}
            opacity="0.3"
          />
        );
      })}

      {/* círculo central + ponto */}
      <circle cx={cx} cy={cy} r={innerR} fill="none" stroke={stroke} strokeWidth={1.4} opacity="0.85" filter={filter} />
      <circle cx={cx} cy={cy} r={dotR} fill={stroke} opacity="0.95" filter={filter} />
    </svg>
  );
}
