import { useEffect, useMemo, useState } from 'react';
import { QUOTES, ROUTINES, getRoutineTasks } from '../data/ritualContent';
import { cycleInfo } from '../lib/cycle';
import { addDays, dateFromIso, isoToday, lastDays, relativeDateLabel, weekDaysAround } from '../lib/dates';
import { readJson } from '../lib/storage';
import { hasSupabase, supabase } from '../lib/supabase';
import { type DailyScore, type DimensionKey, type Insight } from '../types';
import { useApp } from '../store/useStore';

function readLocal<T>(key: string, fallback: T): T {
  return readJson(key, fallback);
}

function filled(value: unknown) {
  if (Array.isArray(value)) return value.some(filled);
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return Boolean(value);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function computeLocalScores(date: string): Record<DimensionKey, number> {
  // Skin: % de tarefas do ritual marcadas no período dia
  const checks = readLocal<Record<string, boolean>>(`full-ritual-routine-checks-${date}`, {});
  const skinTotal =
    getRoutineTasks('day', 'face', date).length +
    ROUTINES.day.body.length +
    ROUTINES.day.aromas.length;
  const skinDone = Object.entries(checks).filter(([k, v]) => k.startsWith('day:') && v).length;

  // Spirit: campos preenchidos. Humor/tema têm valores padrão e não devem inflar o score inicial.
  const spirit = readLocal<{ intention?: unknown; relief?: unknown; gratitude?: unknown }>(
    `full-ritual-spirit-${date}`,
    { intention: '', relief: '', gratitude: '' },
  );
  const spiritScore =
    [spirit.intention, spirit.relief, spirit.gratitude].filter(filled).length / 3;

  // Diet: água (0-6 copos) + refeições registradas (0-3)
  const diet = readLocal<{ water?: unknown; meals?: unknown }>(
    `full-ritual-diet-${date}`,
    { water: 0, meals: {} },
  );
  const water = typeof diet.water === 'number' ? diet.water : 0;
  const mealScore = Math.min(Object.keys(objectValue(diet.meals)).length / 3, 1);
  const waterScore = Math.min(water / 6, 1);

  // Mind: práticas com notas ou sensação diferente da padrão
  const mind = readLocal<{ practiceLogs?: unknown }>(
    `full-ritual-mind-${date}`,
    { practiceLogs: {} },
  );
  const engagedPractices = Object.values(objectValue(mind.practiceLogs)).filter(
    (log) => {
      const l = objectValue(log);
      return filled(l.notes) || (typeof l.feeling === 'string' && l.feeling !== 'clara');
    },
  ).length;

  return {
    skin: skinTotal > 0 ? Math.min(skinDone / skinTotal, 1) : 0,
    body: computeLocalWorkoutScore(date) ?? 0,
    mind: Math.min(engagedPractices / 3, 1),
    diet: waterScore * 0.5 + mealScore * 0.5,
    spirit: spiritScore,
  };
}

function computeLocalWorkoutScore(date: string): number | null {
  const summary = readLocal<{ done: number; total: number } | null>(
    `full-ritual-workout-summary-${date}`,
    null,
  );
  if (summary && summary.total > 0) {
    return Math.max(0, Math.min(summary.done / summary.total, 1));
  }

  const checks = readLocal<Record<string, boolean>>(`full-ritual-workout-blocks-${date}`, {});
  const keys = Object.keys(checks);
  if (keys.length === 0) return null;
  return Math.max(0, Math.min(keys.filter((key) => checks[key]).length / keys.length, 1));
}

type WeatherSource = 'local' | 'fallback';

type WeatherData = {
  temp: number;
  humidity: number;
  uv: number;
  source: WeatherSource;
};

type WeatherCare = {
  label: string;
  text: string;
};

const FALLBACK_WEATHER_COORDS = {
  latitude: -23.5505,
  longitude: -46.6333,
};

export function Home() {
  const profile = useApp((s) => s.profile);
  const userId = useApp((s) => s.userId);
  const goTo = useApp((s) => s.goTo);
  const selectedDate = useApp((s) => s.selectedDate);
  const setSelectedDate = useApp((s) => s.setSelectedDate);
  const [latestInsight, setLatestInsight] = useState<Insight | null>(null);
  const [dailyScore, setDailyScore] = useState<DailyScore | null>(null);
  const [streak, setStreak] = useState(0);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const selectedDay = dateFromIso(selectedDate);
  const greeting = timeOfDayGreeting();
  const dateLabel = selectedDay
    .toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    .toLowerCase();
  const shortDateLabel = relativeDateLabel(selectedDate);
  const quote = QUOTES[(selectedDay.getDay() + 6) % 7];
  const cycle = cycleInfo(profile?.cycle_start, profile?.cycle_length ?? 28, selectedDay);
  const weekDays = useMemo(() => weekDaysAround(selectedDate), [selectedDate]);
  const scores = useMemo<Record<DimensionKey, number>>(() => {
    const localScores = computeLocalScores(selectedDate);
    const localWorkoutScore = computeLocalWorkoutScore(selectedDate);
    if (!dailyScore) return localScores;
    return {
      skin: localScores.skin || dailyScore.score_skin / 100,
      body: localWorkoutScore ?? dailyScore.score_body / 100,
      mind: localScores.mind || dailyScore.score_mind / 100,
      diet: localScores.diet || dailyScore.score_diet / 100,
      spirit: localScores.spirit || dailyScore.score_spirit / 100,
    };
  }, [dailyScore, selectedDate]);
  const energyFromCheckin = readLocal<{ energy?: number }>(`full-ritual-energy-${selectedDate}`, {}).energy;
  const energyScoreNorm = typeof energyFromCheckin === 'number'
    ? Math.max(0, Math.min(1, energyFromCheckin / 10))
    : scores.body;
  const totalScore = Math.round(
    ((scores.skin + scores.body + scores.mind + scores.diet + scores.spirit + energyScoreNorm) / 6) * 100,
  );

  const sleepMin = useMemo(() => {
    const logs = readLocal<Array<{ date: string; duration_min: number | null }>>('full-ritual-sleep', []);
    return logs.find((l) => l.date === selectedDate)?.duration_min ?? null;
  }, [selectedDate]);

  const sleepLabel = sleepMin !== null
    ? `${Math.floor(sleepMin / 60)}h${String(sleepMin % 60).padStart(2, '0')}`
    : '—';

  const energyValue = typeof energyFromCheckin === 'number'
    ? energyFromCheckin
    : dailyScore ? Math.round(scores.body * 10) : null;
  const energyLabel = energyValue !== null ? `${energyValue}/10` : '—';

  const dailyInsight = useMemo(
    () => buildDailyInsight(sleepMin, cycle, latestInsight),
    [sleepMin, cycle, latestInsight],
  );

  const openDimension = (key: DimensionKey) => {
    if (key === 'skin') {
      goTo('ritual', key);
      return;
    }
    if (key === 'body') {
      goTo('body', key);
      return;
    }
    if (key === 'mind') {
      goTo('mind', key);
      return;
    }
    if (key === 'diet') {
      goTo('diet', key);
      return;
    }
    goTo('spirit', key);
  };

  const loadFallbackWeather = async (message: string) => {
    const fallbackWeather = await fetchWeather(FALLBACK_WEATHER_COORDS.latitude, FALLBACK_WEATHER_COORDS.longitude, 'fallback');
    setWeather(fallbackWeather);
    setWeatherError(message);
  };

  const loadWeather = () => {
    setWeatherLoading(true);
    setWeatherError(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      void loadFallbackWeather('Sem acesso ao local agora. Usei São Paulo como referência.').finally(() => {
        setWeatherLoading(false);
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          try {
            const localWeather = await fetchWeather(position.coords.latitude, position.coords.longitude, 'local');
            setWeather(localWeather);
            setWeatherError(null);
          } catch {
            await loadFallbackWeather('Não consegui ler seu clima local. Usei São Paulo como referência.');
          } finally {
            setWeatherLoading(false);
          }
        })();
      },
      () => {
        void loadFallbackWeather('Localização sem permissão. Usei São Paulo como referência.').finally(() => {
          setWeatherLoading(false);
        });
      },
      { enableHighAccuracy: false, maximumAge: 1000 * 60 * 45, timeout: 8000 },
    );
  };

  useEffect(() => {
    loadWeather();
  }, []);

  useEffect(() => {
    if (!hasSupabase || !userId) {
      // Compute streak from localStorage
      let count = 0;
      let date = new Date();
      while (count < 365) {
        const iso = isoToday(date);
        const hasActivity =
          localStorage.getItem(`full-ritual-energy-${iso}`) !== null ||
          localStorage.getItem(`full-ritual-spirit-${iso}`) !== null ||
          localStorage.getItem(`full-ritual-diet-${iso}`) !== null;
        if (!hasActivity) break;
        count++;
        date = addDays(date, -1);
      }
      setStreak(count);
      return;
    }

    const since = lastDays(90)[0];
    void Promise.all([
      supabase.from('insights').select('*').order('date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('daily_scores').select('*').eq('date', selectedDate).maybeSingle(),
      supabase.from('checkins').select('date').gte('date', since).order('date', { ascending: false }),
    ]).then(([insightRes, scoreRes, checkinRes]) => {
      if (insightRes.error) console.error(insightRes.error);
      if (scoreRes.error) console.error(scoreRes.error);
      setLatestInsight((insightRes.data as Insight | null) ?? null);
      setDailyScore((scoreRes.data as DailyScore | null) ?? null);

      const activeDates = new Set((checkinRes.data ?? []).map((r: { date: string }) => r.date));
      let count = 0;
      let date = new Date();
      while (count < 90) {
        if (!activeDates.has(isoToday(date))) break;
        count++;
        date = addDays(date, -1);
      }
      setStreak(count);
    });
  }, [selectedDate, userId]);

  return (
    <div className="screen stack-md">
      <header className="stack" style={{ paddingTop: 8 }}>
        <div className="row-between">
          <span className="eyebrow">{dateLabel}</span>
          <button
            onClick={() => goTo('profile')}
            aria-label="Perfil"
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: profile?.photo_url ? `url(${profile.photo_url}) center/cover` : 'var(--camel)',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--display)',
              fontSize: 22,
              color: 'var(--chocolate)',
            }}
          >
            {!profile?.photo_url && (profile?.name?.[0] ?? 'N')}
          </button>
        </div>

        <h1 className="t-display-lg" style={{ marginTop: 8 }}>
          {greeting}, <em className="t-display-italic">{(profile?.name ?? 'você').split(' ')[0]}.</em>
        </h1>
        <p className="t-body" style={{ color: 'var(--chocolate-soft)', maxWidth: 340, margin: '12px 0 0' }}>
          {quote}
        </p>

        <DaySelector days={weekDays} selectedDate={selectedDate} onSelect={setSelectedDate} />
      </header>

      <section className="card presence-card">
        <span className="eyebrow" style={{ alignSelf: 'flex-start' }}>presença · {shortDateLabel}</span>
        <PresenceFlower
          petals={[
            { key: 'skin', label: 'Pele', color: '#E07A55', value: scores.skin, onClick: () => openDimension('skin') },
            { key: 'body', label: 'Corpo', color: '#D9501A', value: scores.body, onClick: () => openDimension('body') },
            { key: 'energy', label: 'Energia', color: '#E8A23B', value: energyScoreNorm, onClick: () => goTo('energy') },
            { key: 'diet', label: 'Dieta', color: '#5B7A38', value: scores.diet, onClick: () => openDimension('diet') },
            { key: 'spirit', label: 'Espírito', color: '#6B2856', value: scores.spirit, onClick: () => openDimension('spirit') },
            { key: 'mind', label: 'Mente', color: '#0E5B6E', value: scores.mind, onClick: () => openDimension('mind') },
          ]}
          totalScore={totalScore}
        />
      </section>

      <section className="card card--ai insight-review-card">
        <span className="eyebrow">review · {shortDateLabel}</span>
        <div className="insight-number-grid">
          <button onClick={() => goTo('energy')}>
            <strong>{sleepLabel}</strong>
            <span>sono</span>
          </button>
          <button onClick={() => goTo('energy')}>
            <strong>dia {cycle.day}</strong>
            <span>{phaseLabel(cycle.phase)}</span>
          </button>
          <button onClick={() => goTo('energy')}>
            <strong>{energyLabel}</strong>
            <span>energia</span>
          </button>
          {streak > 0 && (
            <button onClick={() => goTo('insight')}>
              <strong>{streak}d</strong>
              <span>sequência</span>
            </button>
          )}
        </div>
        <div className="insight-copy">
          <p className="insight-title">{dailyInsight.title}</p>
          <p className="t-body">{dailyInsight.body}</p>
        </div>
        <button
          className="btn btn--full"
          style={{ background: 'var(--ivory)', color: 'var(--chocolate)' }}
          onClick={() => goTo('insight')}
        >
          ver no detalhe
        </button>
      </section>

      <WeatherCard
        weather={weather}
        loading={weatherLoading}
        error={weatherError}
        onRefresh={loadWeather}
      />

      <section className="stack">
        <span className="eyebrow">saúde · acessar</span>
        <div className="home-health-card">
          <button className="home-health-pill" onClick={() => goTo('labs')}>
            <span className="home-health-pill-icon" style={{ color: 'var(--mind)' }}>◐</span>
            <div className="home-health-pill-text">
              <strong>Exames</strong>
              <span>laudos e marcadores</span>
            </div>
          </button>
          <button className="home-health-pill" onClick={() => goTo('supplements')}>
            <span className="home-health-pill-icon" style={{ color: 'var(--diet)' }}>◍</span>
            <div className="home-health-pill-text">
              <strong>Suplementos</strong>
              <span>aderência diária</span>
            </div>
          </button>
          <button className="home-health-pill" onClick={() => goTo('vitals')}>
            <span className="home-health-pill-icon" style={{ color: 'var(--body)' }}>◑</span>
            <div className="home-health-pill-text">
              <strong>Sinais vitais</strong>
              <span>FC, HRV, passos</span>
            </div>
          </button>
          <button className="home-health-pill" onClick={() => goTo('pain')}>
            <span className="home-health-pill-icon" style={{ color: 'var(--spirit)' }}>○</span>
            <div className="home-health-pill-text">
              <strong>Dor e lesões</strong>
              <span>registro e evolução</span>
            </div>
          </button>
        </div>
        <button className="btn btn--secondary btn--sm" style={{ alignSelf: 'flex-end' }} onClick={() => goTo('health')}>
          visão geral →
        </button>
      </section>

      <button className="card home-ai-card" onClick={() => goTo('chat')}>
        <span className="eyebrow">IA · conversa</span>
        <strong>abrir chat com presença</strong>
      </button>
    </div>
  );
}

function timeOfDayGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Boa noite';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

const PETAL_DEEP: Record<string, string> = {
  '#E07A55': '#B8472A',
  '#D9501A': '#8E2E08',
  '#E8A23B': '#A6661A',
  '#5B7A38': '#2E4419',
  '#6B2856': '#3A0F2D',
  '#0E5B6E': '#062F3B',
};

type Petal = {
  key: string;
  label: string;
  color: string;
  value: number;
  onClick: () => void;
};

function PresenceFlower({ petals, totalScore }: { petals: Petal[]; totalScore: number }) {
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 110;
  const innerR = 40;
  const ink = 'rgba(74,44,34,0.32)';
  const inkSoft = 'rgba(74,44,34,0.14)';

  const pointAt = (i: number, r: number) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
  };

  const hexPath = (r: number) =>
    Array.from({ length: 6 })
      .map((_, i) => {
        const [x, y] = pointAt(i, r);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ') + ' Z';

  return (
    <div className="presence-sigil">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="presence-sigil__svg"
        role="img"
        aria-label={`presença ${totalScore} de 100`}
      >
        {/* outer + mid hex frames */}
        <path d={hexPath(outerR)} fill="none" stroke={ink} strokeWidth={0.8} />
        <path d={hexPath(outerR * 0.66)} fill="none" stroke={inkSoft} strokeWidth={0.6} />
        <path d={hexPath(outerR * 0.33)} fill="none" stroke={inkSoft} strokeWidth={0.6} />

        {/* full spokes (hairline) */}
        {petals.map((p, i) => {
          const [x, y] = pointAt(i, outerR);
          return (
            <line
              key={`spoke-${p.key}`}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={inkSoft}
              strokeWidth={0.6}
            />
          );
        })}

        {/* score bars + dimension tick */}
        {petals.map((p, i) => {
          const v = Math.max(0, Math.min(1, p.value));
          const reach = innerR + (outerR - innerR) * v;
          const [bx, by] = pointAt(i, reach);
          const [ix, iy] = pointAt(i, innerR);
          const [ox, oy] = pointAt(i, outerR);
          return (
            <g key={p.key} className="presence-sigil__spoke" onClick={p.onClick} style={{ cursor: 'pointer' }}>
              {/* invisible wide hit area */}
              <line x1={ix} y1={iy} x2={ox} y2={oy} stroke="transparent" strokeWidth={18} />
              {/* filled bar */}
              <line
                x1={ix}
                y1={iy}
                x2={bx}
                y2={by}
                stroke={p.color}
                strokeWidth={3}
                strokeLinecap="round"
                style={{
                  transition: 'all 700ms cubic-bezier(.16,.84,.4,1)',
                  filter: `drop-shadow(0 0 4px ${p.color}55)`,
                }}
              />
              {/* tip node */}
              <circle cx={bx} cy={by} r={3.4} fill={p.color} />
              {/* vertex glyph */}
              <circle cx={ox} cy={oy} r={2} fill={ink} />
            </g>
          );
        })}

        {/* center disc */}
        <circle cx={cx} cy={cy} r={innerR + 2} fill="var(--paper, #FBF6EB)" />
        <circle cx={cx} cy={cy} r={innerR - 2} fill="var(--paper, #FBF6EB)" stroke={ink} strokeWidth={0.8} />
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          className="presence-sigil__number"
        >
          {totalScore}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          dominantBaseline="middle"
          className="presence-sigil__sublabel"
        >
          presença
        </text>
      </svg>

      <div className="presence-sigil__legend">
        {petals.map((p) => {
          const v = Math.max(0, Math.min(1, p.value));
          const deep = PETAL_DEEP[p.color] ?? p.color;
          return (
            <button key={p.key} onClick={p.onClick} className="presence-sigil__chip">
              <small>{p.label}</small>
              <em>{Math.round(v * 10)}</em>
              <span className="presence-sigil__bar" aria-hidden>
                <span
                  className="presence-sigil__bar-fill"
                  style={{
                    width: `${v * 100}%`,
                    background: `linear-gradient(180deg, ${p.color} 0%, ${deep} 100%)`,
                    boxShadow: `0 1px 0 rgba(255,255,255,0.4) inset, 0 -1px 1px ${deep}66 inset, 0 1px 3px ${deep}55`,
                  }}
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DaySelector({
  days,
  selectedDate,
  onSelect,
}: {
  days: string[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const todayIso = isoToday();
  const [monthOpen, setMonthOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => dateFromIso(selectedDate));
  const monthDays = useMemo(() => getMonthCalendarDays(visibleMonth), [visibleMonth]);
  const monthLabel = visibleMonth
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .toLowerCase();

  const selectDate = (dateIso: string) => {
    onSelect(dateIso);
    setVisibleMonth(dateFromIso(dateIso));
  };

  const selectMonthDate = (dateIso: string) => {
    selectDate(dateIso);
    setMonthOpen(false);
  };

  const shiftMonth = (months: number) => {
    setVisibleMonth((current) => {
      const next = new Date(current);
      next.setDate(1);
      next.setMonth(next.getMonth() + months);
      return next;
    });
  };

  return (
    <div className="date-picker">
      <div className="date-picker-top">
        <button
          type="button"
          className="date-picker-month-toggle"
          onClick={() => {
            setVisibleMonth(dateFromIso(selectedDate));
            setMonthOpen((open) => !open);
          }}
          aria-expanded={monthOpen}
        >
          mês
        </button>
        <button
          type="button"
          className="date-picker-today"
          onClick={() => selectDate(todayIso)}
        >
          hoje
        </button>
      </div>

      <div className="week-strip" aria-label="Escolher dia da semana">
        {days.map((dateIso) => {
          const date = dateFromIso(dateIso);
          const active = dateIso === selectedDate;
          const isToday = dateIso === todayIso;
          const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');

          return (
            <button
              key={dateIso}
              className={`day-chip ${active ? 'day-chip--active' : ''} ${isToday ? 'day-chip--today' : ''}`}
              onClick={() => selectDate(dateIso)}
              aria-pressed={active}
            >
              <span>{weekday}</span>
              <strong>{date.getDate()}</strong>
            </button>
          );
        })}
      </div>

      {monthOpen && (
        <div className="month-picker" aria-label="Escolher dia do mês">
          <div className="month-picker-header">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">‹</button>
            <strong>{monthLabel}</strong>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Próximo mês">›</button>
          </div>
          <div className="month-picker-weekdays" aria-hidden>
            {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="month-picker-grid">
            {monthDays.map((dateIso, index) => {
              if (!dateIso) return <span key={`empty-${index}`} className="month-day month-day--empty" />;

              const date = dateFromIso(dateIso);
              const active = dateIso === selectedDate;
              const isToday = dateIso === todayIso;

              return (
                <button
                  key={dateIso}
                  type="button"
                  className={`month-day ${active ? 'month-day--active' : ''} ${isToday ? 'month-day--today' : ''}`}
                  onClick={() => selectMonthDate(dateIso)}
                  aria-pressed={active}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function getMonthCalendarDays(monthDate: Date): Array<string | null> {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const leadingEmptyDays = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = Array.from({ length: leadingEmptyDays }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(isoToday(new Date(year, month, day)));
  }

  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

async function fetchWeather(latitude: number, longitude: number, source: WeatherSource): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,uv_index',
    timezone: 'auto',
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) throw new Error('Falha ao buscar clima.');

  const data = await response.json() as {
    current?: {
      temperature_2m?: number;
      relative_humidity_2m?: number;
      uv_index?: number;
    };
  };
  const current = data.current;

  if (
    !current ||
    typeof current.temperature_2m !== 'number' ||
    typeof current.relative_humidity_2m !== 'number'
  ) {
    throw new Error('Dados de clima incompletos.');
  }

  return {
    temp: current.temperature_2m,
    humidity: current.relative_humidity_2m,
    uv: typeof current.uv_index === 'number' ? current.uv_index : 0,
    source,
  };
}

function WeatherCard({
  weather,
  loading,
  error,
  onRefresh,
}: {
  weather: WeatherData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const care = weather ? weatherCare(weather) : [];

  return (
    <section className="card weather-card">
      <div className="weather-top">
        <div>
          <span className="eyebrow">clima · hoje</span>
          <h2 className="weather-temp">{weather ? `${Math.round(weather.temp)}°C` : '--°C'}</h2>
        </div>
        <button className="weather-refresh" onClick={onRefresh} disabled={loading}>
          {loading ? 'atualizando' : 'atualizar'}
        </button>
      </div>

      <p className="weather-title">
        {weather ? weatherHeadline(weather) : 'Temperatura, umidade e UV ajustam pele, água, treino e descanso.'}
      </p>

      {weather && (
        <>
          <div className="weather-pill-grid">
            <div className="weather-pill">
              <strong>{Math.round(weather.humidity)}%</strong>
              <small>umidade</small>
            </div>
            <div className="weather-pill">
              <strong>{Math.round(weather.uv)}</strong>
              <small>índice UV</small>
            </div>
          </div>

          <div className="weather-care-grid">
            {care.map((item) => (
              <div className="weather-care" key={item.label}>
                <strong>{item.label}</strong>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className="weather-note">{error}</p>}
    </section>
  );
}

function weatherHeadline(weather: WeatherData) {
  if (weather.temp >= 29 && weather.humidity < 45) {
    return 'Calor seco: pele perde água mais rápido e o treino pede reposição antes de pedir intensidade.';
  }
  if (weather.temp >= 27) {
    return 'Dia quente: suor, oleosidade e energia oscilam. Água e limpeza suave entram como base.';
  }
  if (weather.temp <= 14) {
    return 'Dia frio: banho morno, barreira protegida e refeições mais quentes ajudam o corpo a entrar no ritmo.';
  }
  if (weather.humidity >= 75) {
    return 'Umidade alta: pele pode ficar mais reativa a suor e óleo. Rotina leve ganha importância.';
  }
  return 'Clima estável: bom dia para manter rotina sem compensar no café, treino ou skincare.';
}

function weatherCare(weather: WeatherData): WeatherCare[] {
  const hot = weather.temp >= 27;
  const cold = weather.temp <= 14;
  const dry = weather.humidity < 45;
  const humid = weather.humidity >= 75;
  const highUv = weather.uv >= 6;

  return [
    {
      label: 'pele',
      text: highUv
        ? 'FPS 50 e reaplicação. Evite ácido forte se a pele já estiver sensibilizada.'
        : dry
          ? 'Umidade baixa: priorize hidratante de barreira e limpeza sem espuma agressiva.'
          : humid
            ? 'Umidade alta: limpeza suave e textura leve para não pesar a pele.'
            : 'Barreira estável: mantenha o plano sem aumentar ativos só porque o dia parece calmo.',
    },
    {
      label: 'dieta',
      text: hot || dry
        ? 'Água sobe de prioridade. Inclua sal mineral natural, fruta ou refeição mais úmida.'
        : cold
          ? 'Comidas mornas e proteína ajudam energia sem depender de café extra.'
          : 'Plano normal: proteína, cor no prato e água distribuída ao longo do dia.',
    },
    {
      label: 'saúde',
      text: hot
        ? 'Treino funciona melhor cedo ou mais leve. Observe suor, dor de cabeça e sede.'
        : cold
          ? 'Aquecimento maior antes do treino e banho sem água muito quente depois.'
          : 'Intensidade pode seguir planejada. Use energia real do corpo como métrica.',
    },
    {
      label: 'espírito',
      text: dry || hot
        ? 'Pausas curtas de respiração ajudam a não transformar desconforto físico em irritação.'
        : 'Use o clima como âncora: intenção simples, menos pressa e fechamento do dia mais limpo.',
    },
  ];
}

function phaseLabel(phase: string) {
  const labels: Record<string, string> = {
    menstrual: 'menstrual',
    folicular: 'folicular',
    ovulatoria: 'ovulação',
    lutea: 'lútea',
  };
  return labels[phase] ?? 'ciclo';
}

function buildDailyInsight(
  sleepMin: number | null,
  cycle: { phase: string; day: number },
  fallback: { title: string; body: string } | null,
): { title: string; body: string } {
  const shortSleep = sleepMin !== null && sleepMin < 360;
  const goodSleep = sleepMin !== null && sleepMin >= 420;
  const { phase, day } = cycle;

  if (phase === 'menstrual' && shortSleep) return {
    title: 'Recuperação dupla: fase e sono curto.',
    body: 'Reduza estímulos e ativos fortes. Priorize barreira, hidratação e leveza.',
  };
  if (phase === 'menstrual') return {
    title: `Dia ${day} — fase menstrual.`,
    body: 'Corpo em renovação. Rituais lentos, textura leve e menos cobrança hoje.',
  };
  if (phase === 'folicular' && goodSleep) return {
    title: 'Energia em ascensão, sono bem usado.',
    body: 'Janela ideal para rotina completa, ativos como vitamina C e movimento.',
  };
  if (phase === 'folicular') return {
    title: `Dia ${day} — fase folicular.`,
    body: 'Corpo em reconstrução. Mantenha consistência: proteína, sono e rotina.',
  };
  if (phase === 'ovulatoria') return {
    title: 'Pico energético do ciclo.',
    body: 'Melhor momento para ativos mais fortes, treino intenso e presença total.',
  };
  if (phase === 'lutea' && shortSleep) return {
    title: 'Fase lútea com sono curto.',
    body: 'Sensibilidade da pele elevada. Hidratação, menos ácidos e mais descanso.',
  };
  if (phase === 'lutea') return {
    title: `Dia ${day} — fase lútea.`,
    body: 'Priorize regeneração. O corpo pede mais, mas a consistência é o que vale.',
  };
  if (shortSleep) return {
    title: 'Sono abaixo do ideal.',
    body: 'Pele reativa e barreira fragilizada. Produtos reparadores e rotina leve.',
  };
  return {
    title: fallback?.title ?? 'Presença primeiro, performance depois.',
    body: fallback?.body ?? 'Use os dados do dia para ajustar — não para cobrar.',
  };
}
