import { useEffect, useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Ring } from '../components/Ring';
import { buildAutomaticCorrelations, type CorrelationInsight } from '../lib/correlations';
import { lastDays, minutesToSleepLabel } from '../lib/dates';
import { hasSupabase, supabase } from '../lib/supabase';
import { DIMENSIONS, type Checkin, type DailyScore, type DimensionKey, type Insight as InsightRow, type SleepLog } from '../types';
import { useApp } from '../store/useStore';

export function Insight() {
  const goTo = useApp((s) => s.goTo);
  const userId = useApp((s) => s.userId);
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [scores, setScores] = useState<DailyScore[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);

  useEffect(() => {
    if (!hasSupabase || !userId) return;
    const since = lastDays(7)[0];

    void Promise.all([
      supabase.from('insights').select('*').order('date', { ascending: false }).limit(4),
      supabase.from('daily_scores').select('*').gte('date', since).order('date', { ascending: true }),
      supabase.from('sleep_logs').select('*').gte('date', since).order('date', { ascending: true }),
      supabase.from('checkins').select('*').gte('date', since).order('date', { ascending: true }),
    ]).then(([insightRes, scoreRes, sleepRes, checkinRes]) => {
      if (insightRes.error) console.error(insightRes.error);
      if (scoreRes.error) console.error(scoreRes.error);
      if (sleepRes.error) console.error(sleepRes.error);
      if (checkinRes.error) console.error(checkinRes.error);
      setInsights((insightRes.data ?? []) as InsightRow[]);
      setScores((scoreRes.data ?? []) as DailyScore[]);
      setSleepLogs((sleepRes.data ?? []) as SleepLog[]);
      setCheckins((checkinRes.data ?? []) as Checkin[]);
    });
  }, [userId]);

  const fallbackScores = useMemo(() => makeWeekScores(userId ?? 'local'), [userId]);
  const visibleScores = scores.length ? scores : fallbackScores;
  const correlations = buildAutomaticCorrelations({ sleepLogs, checkins, scores: visibleScores });
  const primaryInsight = insights[0] ?? fallbackInsight(correlations[0]);
  const avgSleep = sleepLogs.length
    ? Math.round(sleepLogs.reduce((sum, log) => sum + (log.duration_min ?? 0), 0) / sleepLogs.length)
    : 372;

  return (
    <div className="screen stack-md">
      <header className="stack">
        <span className="eyebrow">insight · semana</span>
        <h1 className="t-display-lg">
          {primaryInsight.title.split(' ').slice(0, 4).join(' ')} <em className="t-display-italic">apareceu.</em>
        </h1>
        <p className="t-body muted">{primaryInsight.body}</p>
      </header>

      <section className="card stack">
        <div className="row-between">
          <span className="eyebrow">evolução · 7 dias</span>
          <button className="chip" onClick={() => goTo('evolution')}>30 dias →</button>
        </div>
        <div style={{ width: '100%', height: 180 }}>
          <ResponsiveContainer>
            <LineChart data={chartData(visibleScores)} margin={{ top: 8, right: 8, left: -32, bottom: 0 }}>
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'rgba(74,44,34,0.5)', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: 'var(--chocolate)', border: 'none', borderRadius: 12, color: 'var(--ivory)', fontSize: 11 }}
                cursor={{ stroke: 'rgba(74,44,34,0.18)' }}
              />
              {(['skin', 'body', 'mind', 'diet', 'spirit'] as DimensionKey[]).map((key) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={DIMENSIONS[key].color}
                  strokeWidth={1.8}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card stack">
        <span className="eyebrow">sono · semana</span>
        <div className="row" style={{ gap: 18 }}>
          <Ring size={86} stroke={9} value={Math.min(1, (avgSleep || 0) / 440)} color="var(--mind)">
            <div style={{ textAlign: 'center' }}>
              <div className="t-mono-num" style={{ fontSize: 18 }}>{minutesToSleepLabel(avgSleep)}</div>
            </div>
          </Ring>
          <div style={{ flex: 1 }}>
            <div className="t-display-md">Abaixo do seu ritmo.</div>
            <p className="t-body-sm muted" style={{ marginTop: 6 }}>
              média ideal: 7h20 · variação de horário em observação
            </p>
          </div>
        </div>
        <button className="btn btn--secondary btn--full" onClick={() => goTo('sleep')}>
          ver detalhe do sono
        </button>
      </section>

      <section className="stack">
        <span className="eyebrow">correlações</span>
        {correlations.slice(0, 3).map((correlation) => (
          <article key={correlation.title} className="card stack">
            <div className="row-between">
              <strong>{correlation.title}</strong>
              <span className="chip">{Math.round(correlation.strength * 100)}%</span>
            </div>
            <p className="t-body muted">{correlation.body}</p>
          </article>
        ))}
      </section>

      <button className="card card--ai chat-cta" onClick={() => goTo('chat')}>
        <span className="eyebrow">conversar · ✦</span>
        <p className="t-display-md" style={{ color: 'var(--ivory)', marginTop: 8 }}>
          O que sua semana ainda quer te dizer?
        </p>
        <span className="btn btn--sm" style={{ background: 'var(--ivory)', color: 'var(--chocolate)', marginTop: 14 }}>
          abrir conversa
        </span>
      </button>
    </div>
  );
}

function chartData(scores: DailyScore[]) {
  return scores.slice(-7).map((score) => ({
    day: new Date(`${score.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
    skin: score.score_skin,
    body: score.score_body,
    mind: score.score_mind,
    diet: score.score_diet,
    spirit: score.score_spirit,
  }));
}

function fallbackInsight(correlation: CorrelationInsight): InsightRow {
  return {
    id: 'fallback',
    user_id: 'local',
    date: lastDays(1)[0],
    type: 'correlation',
    title: correlation.title,
    body: correlation.body,
    correlations: null,
    source: 'rule',
    created_at: new Date().toISOString(),
  };
}

function makeWeekScores(userId: string): DailyScore[] {
  return lastDays(7).map((date, index) => ({
    user_id: userId,
    date,
    score_skin: [60, 65, 55, 62, 70, 75, 62][index],
    score_body: [70, 75, 68, 80, 72, 65, 75][index],
    score_mind: [55, 60, 70, 65, 75, 80, 48][index],
    score_diet: [45, 50, 55, 60, 65, 70, 55][index],
    score_spirit: [80, 75, 82, 78, 85, 88, 80][index],
  }));
}
