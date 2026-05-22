import { useEffect, useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BackButton } from '../components/BackButton';
import { DIMENSIONS, type Checkin, type DailyScore, type SleepLog } from '../types';
import { buildAutomaticCorrelations } from '../lib/correlations';
import { fiveWeekCycle } from '../lib/cycle';
import { lastDays } from '../lib/dates';
import { hasSupabase, supabase } from '../lib/supabase';
import { useApp } from '../store/useStore';

export function Evolution() {
  const userId = useApp((s) => s.userId);
  const profile = useApp((s) => s.profile);
  const [scores, setScores] = useState<DailyScore[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);

  useEffect(() => {
    if (!hasSupabase || !userId) return;
    const since = lastDays(30)[0];

    void Promise.all([
      supabase.from('daily_scores').select('*').gte('date', since).order('date', { ascending: true }),
      supabase.from('sleep_logs').select('*').gte('date', since).order('date', { ascending: true }),
      supabase.from('checkins').select('*').gte('date', since).order('date', { ascending: true }),
    ]).then(([scoreRes, sleepRes, checkinRes]) => {
      setScores((scoreRes.data ?? []) as DailyScore[]);
      setSleepLogs((sleepRes.data ?? []) as SleepLog[]);
      setCheckins((checkinRes.data ?? []) as Checkin[]);
    });
  }, [userId]);

  const fallbackScores = useMemo(() => makeFallbackScores(userId ?? 'local'), [userId]);
  const chartScores = scores.length ? scores : fallbackScores;
  const chartData = chartScores.map((score) => ({
    date: new Date(`${score.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit' }),
    pele: score.score_skin,
    corpo: score.score_body,
    mente: score.score_mind,
    dieta: score.score_diet,
    espirito: score.score_spirit,
    total: totalScore(score),
  }));
  const correlations = buildAutomaticCorrelations({ sleepLogs, checkins, scores: chartScores });
  const cycle = fiveWeekCycle(profile?.cycle_start, profile?.cycle_length ?? 28);

  return (
    <div className="screen stack-md">
      <header className="screen-header stack">
        <BackButton />
        <span className="eyebrow">evolução · 30 dias</span>
        <h1 className="t-display-lg">
          O ritual visto <em className="t-display-italic">de fora.</em>
        </h1>
        <p className="t-body muted">
          Linhas de presença por dimensão, ciclo de cinco semanas e correlações automáticas.
        </p>
      </header>

      <section className="card stack">
        <span className="eyebrow">gráfico · 30 dias</span>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 0, left: -28 }}>
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: 'rgba(74,44,34,.55)', fontSize: 10 }} />
              <YAxis hide domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: 'var(--chocolate)', color: 'var(--ivory)', border: 0, borderRadius: 12 }}
                cursor={{ stroke: 'rgba(74,44,34,.16)' }}
              />
              <Line type="monotone" dataKey="pele" stroke={DIMENSIONS.skin.color} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="corpo" stroke={DIMENSIONS.body.color} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="mente" stroke={DIMENSIONS.mind.color} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="dieta" stroke={DIMENSIONS.diet.color} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="espirito" stroke={DIMENSIONS.spirit.color} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="legend-row">
          {Object.entries(DIMENSIONS).map(([key, dimension]) => (
            <span key={key}><i style={{ background: dimension.color }} />{dimension.label}</span>
          ))}
        </div>
      </section>

      <section className="card stack">
        <span className="eyebrow">calendário-ciclo · 5 semanas</span>
        <div className="cycle-grid">
          {cycle.map((day) => (
            <div key={day.date} className={`cycle-day cycle-day--${day.phase} ${day.isToday ? 'cycle-day--today' : ''}`}>
              <strong>{new Date(`${day.date}T12:00:00`).getDate()}</strong>
              <span>{day.day}</span>
            </div>
          ))}
        </div>
        <p className="t-body-sm muted">
          {cycle.find((day) => day.isToday)?.text}
        </p>
      </section>

      <section className="stack">
        <span className="eyebrow">correlações automáticas</span>
        {correlations.map((correlation) => (
          <article key={correlation.title} className="card stack">
            <div className="row-between">
              <strong>{correlation.title}</strong>
              <span className="chip">{Math.round(correlation.strength * 100)}%</span>
            </div>
            <p className="t-body muted">{correlation.body}</p>
          </article>
        ))}
      </section>

      <section className="card stack">
        <span className="eyebrow">exportar · dados</span>
        <p className="t-body-sm muted">CSV com sono, energia, scores e ciclo dos últimos 30 dias. Útil para compartilhar com médico, nutri ou personal.</p>
        <button
          className="btn btn--secondary btn--full"
          onClick={() => exportCsv({ scores: chartScores, sleepLogs, checkins })}
          disabled={chartScores.length === 0}
        >
          baixar CSV (30 dias)
        </button>
      </section>
    </div>
  );
}

function exportCsv({
  scores,
  sleepLogs,
  checkins,
}: {
  scores: DailyScore[];
  sleepLogs: SleepLog[];
  checkins: Checkin[];
}) {
  const sleepByDate = new Map(sleepLogs.map((l) => [l.date, l]));
  const checkinByDate = new Map(checkins.map((c) => [c.date, c]));

  const headers = [
    'data', 'sono_h', 'qualidade_sono', 'energia', 'calma',
    'score_pele', 'score_corpo', 'score_mente', 'score_dieta', 'score_espirito', 'sinais',
  ];

  const rows = scores.map((s) => {
    const sleep = sleepByDate.get(s.date);
    const checkin = checkinByDate.get(s.date);
    return [
      s.date,
      sleep?.duration_min != null ? (sleep.duration_min / 60).toFixed(1) : '',
      sleep?.quality ?? '',
      checkin?.energy ?? '',
      checkin?.calm ?? '',
      s.score_skin,
      s.score_body,
      s.score_mind,
      s.score_diet,
      s.score_spirit,
      (checkin?.signals ?? []).join('|'),
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `full-ritual-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function totalScore(score: DailyScore) {
  return score.score_total ?? Math.round(
    (score.score_skin + score.score_body + score.score_mind + score.score_diet + score.score_spirit) / 5
  );
}

function makeFallbackScores(userId: string): DailyScore[] {
  return lastDays(30).map((date, index) => ({
    user_id: userId,
    date,
    score_skin: wave(index, 58, 16),
    score_body: wave(index, 68, 12),
    score_mind: wave(index, 54, 18),
    score_diet: wave(index, 62, 14),
    score_spirit: wave(index, 72, 10),
  }));
}

function wave(index: number, base: number, amplitude: number) {
  const value = base + Math.sin(index / 3) * amplitude + Math.cos(index / 5) * 8;
  return Math.max(15, Math.min(96, Math.round(value)));
}
