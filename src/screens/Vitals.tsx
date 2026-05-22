import { useEffect, useState } from 'react';
import { dateFromIso, lastDays } from '../lib/dates';
import { hasSupabase, supabase } from '../lib/supabase';
import { useApp } from '../store/useStore';

interface Vital {
  id: string;
  user_id: string;
  date: string;
  resting_hr: number | null;
  hrv_ms: number | null;
  steps: number | null;
  spo2_pct: number | null;
  weight_kg: number | null;
  source: string;
}

type VitalKey = 'resting_hr' | 'hrv_ms' | 'steps' | 'spo2_pct' | 'weight_kg';

const VITAL_META: Record<VitalKey, { label: string; unit: string; color: string; goal?: number; goalLabel?: string }> = {
  resting_hr: { label: 'FC repouso', unit: 'bpm',  color: 'var(--body)',   goal: 60,    goalLabel: '<60 = excelente' },
  hrv_ms:     { label: 'HRV',        unit: 'ms',   color: 'var(--diet)',   goal: 50,    goalLabel: 'quanto maior, melhor' },
  steps:      { label: 'Passos',     unit: 'pass', color: 'var(--spirit)', goal: 8000,  goalLabel: 'meta: 8.000' },
  spo2_pct:   { label: 'SpO₂',       unit: '%',    color: 'var(--mind)',   goal: 96,    goalLabel: '>96% = normal' },
  weight_kg:  { label: 'Peso',       unit: 'kg',   color: 'var(--skin)' },
};

export function Vitals() {
  const userId = useApp((s) => s.userId);
  const selectedDate = useApp((s) => s.selectedDate);
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [loading, setLoading] = useState(true);
  const current = vitals.find((v) => v.date === selectedDate) ?? vitals[0] ?? null;

  useEffect(() => {
    if (!hasSupabase || !userId) { setLoading(false); return; }
    const since = lastDays(30)[0];
    supabase
      .from('vitals')
      .select('*')
      .eq('user_id', userId)
      .gte('date', since)
      .order('date', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error);
        setVitals((data ?? []) as Vital[]);
        setLoading(false);
      });
  }, [userId]);

  const days = lastDays(14);
  const vitalsByDate = new Map(vitals.map((v) => [v.date, v]));

  return (
    <div className="screen stack-md">
      <header className="stack">
        <span className="eyebrow">saúde · sinais vitais</span>
        <h1 className="t-display-lg">
          O que o corpo <em className="t-display-italic">mede.</em>
        </h1>
        <p className="t-body muted">
          FC repouso, HRV, passos, SpO₂ e peso sincronizados do wearable.
        </p>
      </header>

      {!loading && current && (
        <section className="card stack">
          <span className="eyebrow">snapshot · {current.date}</span>
          <div className="vitals-form-grid">
          {(Object.keys(VITAL_META) as VitalKey[]).map((key) => {
            const meta = VITAL_META[key];
            const value = current[key];
            return (
              <div key={key} className="vitals-field">
                <span style={{ color: meta.color }}>{meta.label}</span>
                <div className="vitals-input-row">
                  <strong className="vitals-read-value">{formatVital(value)}</strong>
                  <span className="vitals-unit">{meta.unit}</span>
                </div>
                {meta.goalLabel && <span className="vitals-goal-label">{meta.goalLabel}</span>}
              </div>
            );
          })}
          </div>
        </section>
      )}

      {!loading && vitals.length > 0 && (
        <section className="stack">
          <span className="eyebrow">últimos 14 dias</span>
          {(['resting_hr', 'hrv_ms', 'steps'] as VitalKey[]).map((key) => {
            const meta = VITAL_META[key];
            const points = days.map((d) => ({ date: d, val: vitalsByDate.get(d)?.[key] as number | null ?? null }));
            const maxVal = Math.max(...points.map((p) => p.val ?? 0), meta.goal ?? 0, 1);
            return (
              <article key={key} className="card stack">
                <div className="row-between">
                  <span className="eyebrow">{meta.label}</span>
                  {current?.[key] != null && (
                    <span style={{ fontFamily: 'var(--display)', fontSize: 20, color: meta.color }}>
                      {current[key]} {meta.unit}
                    </span>
                  )}
                </div>
                <div className="vitals-mini-chart">
                  {points.map((p) => {
                    const pct = p.val != null ? Math.min((p.val / maxVal) * 100, 100) : 0;
                    const isSelected = p.date === selectedDate;
                    const day = dateFromIso(p.date);
                    const label = day.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3);
                    return (
                      <div key={p.date} className="vitals-bar-col">
                        <div className="vitals-bar-track">
                          <div
                            className="vitals-bar-fill"
                            style={{
                              height: `${pct}%`,
                              background: meta.color,
                              opacity: isSelected ? 1 : 0.55,
                            }}
                          />
                        </div>
                        <span className="vitals-bar-label">{label}</span>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {!loading && vitals.length === 0 && (
        <section className="card stack">
          <span className="eyebrow">sem dados</span>
          <p className="t-body-sm muted">
            Os sinais vitais aparecerão aqui quando a sincronização do Garmin Connect gravar os primeiros registros.
          </p>
        </section>
      )}
    </div>
  );
}

function formatVital(value: number | null) {
  if (value == null) return '—';
  return Number.isInteger(value) ? value.toLocaleString('pt-BR') : value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}
