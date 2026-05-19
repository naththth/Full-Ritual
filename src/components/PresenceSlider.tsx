import { useState } from 'react';

interface PresenceSliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color?: string;
  min?: number;
  max?: number;
}

/**
 * Slider de presença 0-10. Visual ritualístico, não esportivo.
 * Track fino chocolate, thumb circular com número mono dentro.
 */
export function PresenceSlider({
  label,
  value,
  onChange,
  color = 'var(--chocolate)',
  min = 0,
  max = 10,
}: PresenceSliderProps) {
  const [v, setV] = useState(value);
  const pct = ((v - min) / (max - min)) * 100;

  return (
    <div style={{ padding: '12px 0' }}>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <span className="eyebrow">{label}</span>
        <span className="t-mono-num" style={{ fontSize: 22 }}>
          {v}
          <span style={{ color: 'var(--chocolate-soft)', fontSize: 12 }}>/{max}</span>
        </span>
      </div>
      <div style={{ position: 'relative', height: 32, display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            position: 'absolute',
            left: 0, right: 0,
            height: 2,
            background: 'rgba(74,44,34,0.12)',
            borderRadius: 1,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: `${pct}%`,
            height: 2,
            background: color,
            borderRadius: 1,
            transition: 'width 180ms cubic-bezier(.4,0,.2,1)',
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={v}
          onChange={(e) => {
            const newV = Number(e.target.value);
            setV(newV);
            onChange(newV);
          }}
          aria-label={label}
          style={{
            position: 'absolute',
            left: 0, right: 0, top: 0, bottom: 0,
            width: '100%',
            opacity: 0,
            cursor: 'pointer',
            WebkitAppearance: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `calc(${pct}% - 16px)`,
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: color,
            color: 'var(--ivory)',
            display: 'grid',
            placeItems: 'center',
            fontFamily: 'var(--mono)',
            fontSize: 12,
            fontWeight: 500,
            boxShadow: '0 4px 12px rgba(74,44,34,0.18)',
            transition: 'left 180ms cubic-bezier(.4,0,.2,1)',
            pointerEvents: 'none',
          }}
        >
          {v}
        </div>
      </div>
    </div>
  );
}
