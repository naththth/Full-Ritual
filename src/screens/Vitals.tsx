import { useEffect, useRef, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { dateFromIso, isoToday, lastDays } from '../lib/dates';
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

function parseGarminCsv(text: string): Partial<Vital>[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/['"]/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cols[i] ?? ''; });

    const dateStr = row['date'] || row['data'] || row['day'] || '';
    if (!dateStr) return null;

    const date = dateStr.slice(0, 10);
    return {
      date,
      resting_hr:  num(row['resting heart rate'] || row['fc repouso'] || row['avg resting heart rate']),
      hrv_ms:      num(row['hrv'] || row['avg stress'] || row['hrv rmssd']),
      steps:       num(row['steps'] || row['passos'] || row['total steps']),
      spo2_pct:    num(row['avg spo2'] || row['spo2'] || row['pulse ox']),
      weight_kg:   num(row['weight'] || row['peso'] || row['weight (kg)']),
      source: 'garmin',
    };
  }).filter(Boolean) as Partial<Vital>[];
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function Vitals() {
  const userId = useApp((s) => s.userId);
  const showToast = useApp((s) => s.showToast);
  const selectedDate = useApp((s) => s.selectedDate);
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const today = isoToday();
  const current = vitals.find((v) => v.date === selectedDate) ?? null;

  const [form, setForm] = useState({
    resting_hr: '',
    hrv_ms: '',
    steps: '',
    spo2_pct: '',
    weight_kg: '',
  });

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

  useEffect(() => {
    if (!current) {
      setForm({ resting_hr: '', hrv_ms: '', steps: '', spo2_pct: '', weight_kg: '' });
      return;
    }
    setForm({
      resting_hr: current.resting_hr?.toString() ?? '',
      hrv_ms: current.hrv_ms?.toString() ?? '',
      steps: current.steps?.toString() ?? '',
      spo2_pct: current.spo2_pct?.toString() ?? '',
      weight_kg: current.weight_kg?.toString() ?? '',
    });
  }, [selectedDate, current?.id]);

  const saveManual = async () => {
    if (!userId) return;
    const payload = {
      user_id: userId,
      date: selectedDate,
      resting_hr: form.resting_hr ? parseInt(form.resting_hr) : null,
      hrv_ms: form.hrv_ms ? parseFloat(form.hrv_ms) : null,
      steps: form.steps ? parseInt(form.steps) : null,
      spo2_pct: form.spo2_pct ? parseFloat(form.spo2_pct) : null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      source: 'manual',
    };

    setVitals((prev) => {
      const without = prev.filter((v) => v.date !== selectedDate);
      return [{ ...payload, id: current?.id ?? crypto.randomUUID() } as Vital, ...without];
    });

    if (!hasSupabase) return;
    const { error } = await supabase.from('vitals').upsert(payload, { onConflict: 'user_id,date' });
    if (error) {
      console.error(error);
      showToast('não foi possível salvar os sinais.');
    }
  };

  const handleCsvImport = async (file: File) => {
    if (!userId) return;
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseGarminCsv(text).filter((r) => r.date);
      if (!rows.length) { showToast('nenhum dado reconhecido no CSV.'); return; }

      if (hasSupabase) {
        const upserts = rows.map((r) => ({ user_id: userId, ...r }));
        const { error } = await supabase.from('vitals').upsert(upserts, { onConflict: 'user_id,date' });
        if (error) throw error;
        const { data } = await supabase.from('vitals').select('*').eq('user_id', userId).gte('date', lastDays(30)[0]).order('date', { ascending: false });
        setVitals((data ?? []) as Vital[]);
      } else {
        setVitals((prev) => {
          const map = new Map(prev.map((v) => [v.date, v]));
          rows.forEach((r) => map.set(r.date!, { ...map.get(r.date!), ...r, id: crypto.randomUUID(), user_id: userId } as Vital));
          return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
        });
      }
      showToast(`${rows.length} dias importados.`);
    } catch (err) {
      console.error(err);
      showToast('erro ao importar CSV.');
    } finally {
      setImporting(false);
    }
  };

  const days = lastDays(14);
  const vitalsByDate = new Map(vitals.map((v) => [v.date, v]));

  return (
    <div className="screen stack-md">
      <header className="screen-header stack">
        <BackButton />
        <span className="eyebrow">saúde · sinais vitais</span>
        <h1 className="t-display-lg">
          O que o corpo <em className="t-display-italic">mede.</em>
        </h1>
        <p className="t-body muted">
          FC repouso, HRV, passos e SpO₂. Importe do Garmin ou registre manualmente.
        </p>
      </header>

      {/* Garmin import */}
      <section className="card stack vitals-import-card">
        <div className="row-between">
          <span className="eyebrow">importar · Garmin / Apple Health</span>
        </div>
        <p className="t-body-sm muted">
          Exporte o CSV de "Resumo de Saúde" do Garmin Connect ou do Apple Health e importe aqui.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleCsvImport(f); }}
        />
        <button
          className="btn btn--secondary btn--full"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
        >
          {importing ? 'importando...' : '↑ importar CSV (Garmin / Apple Health)'}
        </button>
      </section>

      {/* Manual entry */}
      <section className="card stack">
        <span className="eyebrow">entrada manual · {selectedDate === today ? 'hoje' : selectedDate}</span>
        <div className="vitals-form-grid">
          {(Object.keys(VITAL_META) as VitalKey[]).map((key) => {
            const meta = VITAL_META[key];
            return (
              <label key={key} className="vitals-field">
                <span style={{ color: meta.color }}>{meta.label}</span>
                <div className="vitals-input-row">
                  <input
                    type="number"
                    step={key === 'weight_kg' || key === 'hrv_ms' || key === 'spo2_pct' ? '0.1' : '1'}
                    placeholder="—"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                  <span className="vitals-unit">{meta.unit}</span>
                </div>
                {meta.goalLabel && <span className="vitals-goal-label">{meta.goalLabel}</span>}
              </label>
            );
          })}
        </div>
        <button className="btn btn--primary btn--full" onClick={() => void saveManual()}>
          salvar sinais
        </button>
      </section>

      {/* 14-day chart */}
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
                    const isToday = p.date === today;
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
                              opacity: isToday ? 1 : 0.55,
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
    </div>
  );
}
