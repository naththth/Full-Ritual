import { useEffect, useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import CircleButton from '../components/CircleButton';
import { Ring } from '../components/Ring';
import { buildAutomaticCorrelations, correlationsToText, type CorrelationInsight } from '../lib/correlations';
import { isoToday, lastDays, minutesToSleepLabel } from '../lib/dates';
import { dimensionScoreField, normalizeActiveDimensions } from '../lib/dimensions';
import { resolveInsightText } from '../lib/insightText';
import { hasSupabase, supabase } from '../lib/supabase';
import { DIMENSIONS, type Checkin, type DailyScore, type Insight as InsightRow, type SleepLog } from '../types';
import { useApp } from '../store/useStore';

export function Insight() {
  const goTo = useApp((s) => s.goTo);
  const userId = useApp((s) => s.userId);
  const profile = useApp((s) => s.profile);
  const selectedDimensions = useApp((s) => s.activeDimensions);
  const activeDimensions = useMemo(() => normalizeActiveDimensions(selectedDimensions), [selectedDimensions]);
  const showToast = useApp((s) => s.showToast);
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [scores, setScores] = useState<DailyScore[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [generatingAi, setGeneratingAi] = useState(false);

  useEffect(() => {
    if (!hasSupabase || !userId) return;
    const since = lastDays(14)[0];

    void Promise.all([
      supabase.from('insights').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(6),
      supabase.from('daily_scores').select('*').eq('user_id', userId).gte('date', since).order('date', { ascending: true }),
      supabase.from('sleep_logs').select('*').eq('user_id', userId).gte('date', since).order('date', { ascending: true }),
      supabase.from('checkins').select('*').eq('user_id', userId).gte('date', since).order('date', { ascending: true }),
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

  const generateAiInsight = async () => {
    if (!hasSupabase || !userId || generatingAi) return;
    setGeneratingAi(true);
    try {
      const currentScores = scores.length ? scores : makeWeekScores(userId);
      const correlations = buildAutomaticCorrelations({ sleepLogs, checkins, scores: currentScores, activeDimensions });
      const scoreSummary = activeDimensions
        .map((key) => `${DIMENSIONS[key].label.toLowerCase()} ${avgScore(currentScores, dimensionScoreField(key))}`)
        .join(' | ');
      const context = [
        `Data: ${isoToday()}`,
        `Sono médio 14 dias: ${avgSleep ? minutesToSleepLabel(avgSleep) : 'sem dados'}`,
        `Correlações detectadas:\n${correlationsToText(correlations)}`,
        `Dimensões ativas: ${activeDimensions.map((key) => DIMENSIONS[key].label).join(', ')}`,
        `Scores médios: ${scoreSummary}`,
      ].join('\n');

      const { data, error } = await supabase.functions.invoke('gemini-chat', {
        body: {
          message: 'Gere um insight semanal personalizado baseado nos dados da usuária. Seja direta, específica, com no máximo 3 frases. Foque no padrão mais forte.',
          context: { recent_summary: context },
          userId,
          saveInsight: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      if (data?.reply) {
        const newInsight: InsightRow = {
          id: data.insight?.id ?? crypto.randomUUID(),
          user_id: userId,
          date: isoToday(),
          type: 'weekly',
          title: data.insight?.title ?? 'Insight da semana',
          body: data.insight?.body ?? data.reply,
          correlations: data.insight?.correlations ?? null,
          source: 'gemini',
          created_at: data.insight?.created_at ?? new Date().toISOString(),
        };
        setInsights((current) => [newInsight, ...current]);
      }
    } catch (error) {
      console.error(error);
      showToast('não foi possível gerar o insight agora.');
    } finally {
      setGeneratingAi(false);
    }
  };

  const fallbackScores = useMemo(() => makeWeekScores(userId ?? 'local'), [userId]);
  const visibleScores = scores.length ? scores : fallbackScores;
  const correlations = buildAutomaticCorrelations({ sleepLogs, checkins, scores: visibleScores, activeDimensions });
  const primaryInsight = insights[0] ?? fallbackInsight(correlations[0]);
  const primaryInsightBody = resolveInsightText(primaryInsight.body, profile?.name);
  const aiHistory = insights
    .filter((insight) => insight.source === 'gemini')
    .slice(0, 5);
  const avgSleep = sleepLogs.length
    ? Math.round(sleepLogs.reduce((sum, log) => sum + (log.duration_min ?? 0), 0) / sleepLogs.length)
    : 372;
  const idealSleepMin = 440;
  const sleepDelta = avgSleep - idealSleepMin;
  const sleepStatus = sleepDelta >= 15
    ? 'Acima do seu ritmo.'
    : sleepDelta <= -15
      ? 'Abaixo do seu ritmo.'
      : 'Dentro do seu ritmo.';
  const sleepDeltaLabel = Math.abs(sleepDelta) < 15
    ? 'dentro da faixa da média ideal'
    : `${minutesToSleepLabel(Math.abs(sleepDelta))} ${sleepDelta > 0 ? 'acima' : 'abaixo'} da média ideal`;

  return (
    <div className="screen stack-md">
      <header className="stack">
        <span className="eyebrow">insight · semana</span>
        <h1 className="t-display-lg">
          {primaryInsight.title.split(' ').slice(0, 4).join(' ')} <em className="t-display-italic">apareceu.</em>
        </h1>
        <p className="t-body muted">{primaryInsightBody}</p>
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
              {activeDimensions.map((key) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={DIMENSIONS[key].label}
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
            <div className="t-display-md">{sleepStatus}</div>
            <p className="t-body-sm muted" style={{ marginTop: 6 }}>
              média ideal: {minutesToSleepLabel(idealSleepMin)} · {sleepDeltaLabel}
            </p>
          </div>
        </div>
        <button className="btn btn--secondary btn--full" onClick={() => goTo('energy')}>
          registrar sono em energia
        </button>
      </section>

      <section className="stack">
        <div className="row-between">
          <span className="eyebrow">correlações</span>
          <button
            className="chip"
            onClick={() => void generateAiInsight()}
            disabled={generatingAi}
            aria-busy={generatingAi}
          >
            {generatingAi ? 'gerando...' : '✦ gerar com IA'}
          </button>
        </div>
        {correlations.slice(0, 4).map((correlation) => (
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

      {aiHistory.length > 0 && (
        <details className="card stack insight-history">
          <summary>
            <span>
              <span className="eyebrow">insights da IA · histórico</span>
              <strong>{aiHistory.length} leitura{aiHistory.length > 1 ? 's' : ''} anterior{aiHistory.length > 1 ? 'es' : ''}</strong>
            </span>
            <CircleButton
              ariaLabel="Abrir histórico de insights"
              color="var(--spirit)"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const details = event.currentTarget.closest('details');
                if (details) details.open = !details.open;
              }}
            />
          </summary>
          <div className="stack">
            {aiHistory.map((insight) => (
              <article key={insight.id} className="insight-history__item">
                <div className="row-between">
                  <strong>{insight.title}</strong>
                  <span className="chip">{new Date(insight.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                </div>
                <p className="t-body-sm muted">{resolveInsightText(insight.body, profile?.name)}</p>
              </article>
            ))}
          </div>
        </details>
      )}
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

function avgScore(scores: DailyScore[], key: keyof DailyScore): string {
  const vals = scores.map((s) => s[key]).filter((v): v is number => typeof v === 'number');
  if (!vals.length) return '—';
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) + '%';
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
