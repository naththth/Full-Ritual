import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { diffMinutes, isoToday, lastDays, minutesToSleepLabel } from '../lib/dates';
import { useLocalState } from '../lib/useLocalState';
import { hasSupabase, supabase } from '../lib/supabase';
import { useApp } from '../store/useStore';
import type { SleepLog } from '../types';

interface SleepDraft {
  date: string;
  bedtime: string;
  wakeTime: string;
  durationMin: string;
  quality: number;
  notes: string;
}

const emptyDraft: SleepDraft = {
  date: isoToday(),
  bedtime: '23:30',
  wakeTime: '06:40',
  durationMin: '',
  quality: 7,
  notes: '',
};

export function Sleep() {
  const userId = useApp((s) => s.userId);
  const showToast = useApp((s) => s.showToast);
  const [localLogs, setLocalLogs] = useLocalState<SleepLog[]>('full-ritual-sleep', []);
  const [logs, setLogs] = useState<SleepLog[]>([]);
  const [draft, setDraft] = useState<SleepDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  const source = hasSupabase ? logs : localLogs;
  const ordered = useMemo(
    () => [...source].sort((a, b) => a.date.localeCompare(b.date)).slice(-14),
    [source]
  );
  const duration = Number(draft.durationMin) || diffMinutes(draft.bedtime, draft.wakeTime) || null;
  const averageSleep = ordered.length
    ? Math.round(ordered.reduce((sum, log) => sum + (log.duration_min ?? 0), 0) / ordered.length)
    : null;
  const averageQuality = ordered.length
    ? ordered.reduce((sum, log) => sum + (log.quality ?? 0), 0) / ordered.length
    : null;

  useEffect(() => {
    if (!hasSupabase || !userId) return;
    const since = lastDays(21)[0];
    supabase
      .from('sleep_logs')
      .select('*')
      .gte('date', since)
      .order('date', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error);
        setLogs((data ?? []) as SleepLog[]);
      });
  }, [userId]);

  const saveSleep = async () => {
    if (!duration) {
      showToast('preencha duração ou horários.');
      return;
    }
    setSaving(true);

    const log: SleepLog = {
      id: crypto.randomUUID(),
      user_id: userId ?? 'local',
      date: draft.date,
      bedtime: draft.bedtime ? `${draft.date}T${draft.bedtime}:00` : null,
      wake_time: draft.wakeTime ? `${draft.date}T${draft.wakeTime}:00` : null,
      duration_min: duration,
      quality: draft.quality,
      notes: draft.notes || null,
    };

    try {
      if (hasSupabase && userId) {
        const { data, error } = await supabase
          .from('sleep_logs')
          .upsert({
            user_id: userId,
            date: log.date,
            bedtime: log.bedtime,
            wake_time: log.wake_time,
            duration_min: log.duration_min,
            quality: log.quality,
            notes: log.notes,
          }, { onConflict: 'user_id,date' })
          .select('*')
          .single();
        if (error) throw error;
        setLogs((current) => [...current.filter((item) => item.date !== log.date), data as SleepLog]);
      } else {
        setLocalLogs((current) => [...current.filter((item) => item.date !== log.date), log]);
      }
      showToast('sono registrado.');
    } catch (error) {
      console.error(error);
      showToast('não foi possível salvar o sono.');
    } finally {
      setSaving(false);
    }
  };

  const chartData = ordered.map((log) => ({
    date: new Date(`${log.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit' }),
    horas: Number(((log.duration_min ?? 0) / 60).toFixed(1)),
    qualidade: log.quality ?? 0,
  }));

  return (
    <div className="screen stack-md">
      <header className="stack">
        <span className="eyebrow">sono · detalhe</span>
        <h1 className="t-display-lg">
          O eixo da <em className="t-display-italic">recuperação.</em>
        </h1>
        <p className="t-body muted">
          Duração, qualidade e regularidade para conectar sono com pele, treino e energia.
        </p>
      </header>

      <section className="metric-grid">
        <Metric label="média" value={minutesToSleepLabel(averageSleep)} />
        <Metric label="qualidade" value={averageQuality ? `${averageQuality.toFixed(1)}/10` : '—'} />
        <Metric label="hoje" value={duration ? minutesToSleepLabel(duration) : '—'} />
      </section>

      <section className="card stack">
        <span className="eyebrow">registrar noite</span>
        <div className="form-grid">
          <input className="field" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} />
          <input className="field" type="time" value={draft.bedtime} onChange={(event) => setDraft({ ...draft, bedtime: event.target.value })} />
          <input className="field" type="time" value={draft.wakeTime} onChange={(event) => setDraft({ ...draft, wakeTime: event.target.value })} />
          <input className="field" type="number" placeholder="minutos" value={draft.durationMin} onChange={(event) => setDraft({ ...draft, durationMin: event.target.value })} />
        </div>
        <label className="slider-field">
          <span className="eyebrow">qualidade · {draft.quality}/10</span>
          <input type="range" min={0} max={10} value={draft.quality} onChange={(event) => setDraft({ ...draft, quality: Number(event.target.value) })} />
        </label>
        <textarea className="field" placeholder="observações: despertares, sonhos, tela, treino..." value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        <button className="btn btn--primary btn--full" onClick={saveSleep} disabled={saving}>
          {saving ? 'salvando…' : 'salvar sono'}
        </button>
      </section>

      <section className="card stack">
        <span className="eyebrow">últimas 2 semanas</span>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: 'rgba(74,44,34,.55)', fontSize: 10 }} />
              <YAxis hide domain={[0, 10]} />
              <Tooltip
                contentStyle={{ background: 'var(--chocolate)', color: 'var(--ivory)', border: 0, borderRadius: 12 }}
                cursor={{ fill: 'rgba(74,44,34,.06)' }}
              />
              <Bar dataKey="horas" fill="var(--mind)" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="t-body-sm muted">
          Abaixo de seis horas, a pele tende a pedir rotina de barreira e menos ativos.
        </p>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
