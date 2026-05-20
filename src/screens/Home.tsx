import { useEffect, useMemo, useState } from 'react';
import { MultiRing } from '../components/Ring';
import { QUOTES, ROUTINES, getRoutineTasks } from '../data/ritualContent';
import { cycleInfo } from '../lib/cycle';
import { dateFromIso, isoToday, relativeDateLabel, weekDaysAround } from '../lib/dates';
import { hasSupabase, supabase } from '../lib/supabase';
import { DIMENSIONS, type DailyScore, type DimensionKey, type Insight } from '../types';
import { useApp } from '../store/useStore';

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function computeLocalScores(date: string): Record<DimensionKey, number> {
  // Skin: % de tarefas do ritual marcadas no período dia
  const checks = readLocal<Record<string, boolean>>(`full-ritual-routine-checks-${date}`, {});
  const skinTotal =
    getRoutineTasks('day', 'face', date).length +
    ROUTINES.day.body.length +
    ROUTINES.day.aromas.length;
  const skinDone = Object.entries(checks).filter(([k, v]) => k.startsWith('day:') && v).length;

  // Spirit: campos preenchidos (humor, intenção, gratidão)
  const spirit = readLocal<{ mood: string; intention: string; gratitude: string }>(
    `full-ritual-spirit-${date}`,
    { mood: '', intention: '', gratitude: '' },
  );
  const spiritScore =
    [spirit.mood, spirit.intention, spirit.gratitude].filter((s) => s.trim().length > 0).length / 3;

  // Diet: água (0-6 copos) + refeições registradas (0-3)
  const diet = readLocal<{ water: number; meals: Record<string, unknown> }>(
    `full-ritual-diet-${date}`,
    { water: 0, meals: {} },
  );
  const waterScore = Math.min(diet.water / 6, 1);
  const mealScore = Math.min(Object.keys(diet.meals ?? {}).length / 3, 1);

  // Mind: práticas com notas ou sensação diferente da padrão
  const mind = readLocal<{ practiceLogs: Record<string, { notes: string; feeling: string }> }>(
    `full-ritual-mind-${date}`,
    { practiceLogs: {} },
  );
  const engagedPractices = Object.values(mind.practiceLogs ?? {}).filter(
    (l) => l.notes?.trim() || l.feeling !== 'clara',
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
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const selectedDay = dateFromIso(selectedDate);
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
  const totalScore = Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / 5) * 100);

  const sleepMin = useMemo(() => {
    const logs = readLocal<Array<{ date: string; duration_min: number | null }>>('full-ritual-sleep', []);
    return logs.find((l) => l.date === selectedDate)?.duration_min ?? null;
  }, [selectedDate]);

  const sleepLabel = sleepMin !== null
    ? `${Math.floor(sleepMin / 60)}h${String(sleepMin % 60).padStart(2, '0')}`
    : '—';

  const energyLabel = dailyScore ? `${Math.round(scores.body * 10)}/10` : '—';

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
    if (!hasSupabase || !userId) return;

    void Promise.all([
      supabase.from('insights').select('*').order('date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('daily_scores').select('*').eq('date', selectedDate).maybeSingle(),
    ]).then(([insightRes, scoreRes]) => {
      if (insightRes.error) console.error(insightRes.error);
      if (scoreRes.error) console.error(scoreRes.error);
      setLatestInsight((insightRes.data as Insight | null) ?? null);
      setDailyScore((scoreRes.data as DailyScore | null) ?? null);
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
          Bom dia, <em className="t-display-italic">{(profile?.name ?? 'você').split(' ')[0]}.</em>
        </h1>
        <p className="t-body" style={{ color: 'var(--chocolate-soft)', maxWidth: 340, margin: '12px 0 0' }}>
          {quote}
        </p>

        <DaySelector days={weekDays} selectedDate={selectedDate} onSelect={setSelectedDate} />
      </header>

      <section className="card presence-card">
        <span className="eyebrow" style={{ alignSelf: 'flex-start' }}>presença · {shortDateLabel}</span>
        <div className="presence-ring">
          <MultiRing
            size={210}
            stroke={10}
            gap={4}
            values={(['skin', 'body', 'mind', 'diet', 'spirit'] as DimensionKey[]).map((key) => ({
              value: scores[key],
              color: DIMENSIONS[key].color,
            }))}
          />
          <div className="presence-center">
            <div className="presence-medallion">
              <strong>{totalScore}</strong>
              <span>presença</span>
            </div>
          </div>
        </div>

        <div className="dimension-legend">
          {(Object.keys(DIMENSIONS) as DimensionKey[]).map((key) => (
            <button key={key} onClick={() => openDimension(key)}>
              <span style={{ background: DIMENSIONS[key].color }} aria-hidden />
              <small>{DIMENSIONS[key].label}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="card card--ai insight-review-card">
        <span className="eyebrow">review · {shortDateLabel}</span>
        <div className="insight-number-grid">
          <button onClick={() => goTo('sleep')}>
            <strong>{sleepLabel}</strong>
            <span>sono</span>
          </button>
          <button onClick={() => goTo('evolution')}>
            <strong>dia {cycle.day}</strong>
            <span>{phaseLabel(cycle.phase)}</span>
          </button>
          <button onClick={() => goTo('body')}>
            <strong>{energyLabel}</strong>
            <span>energia</span>
          </button>
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

      <button className="card home-ai-card" onClick={() => goTo('chat')}>
        <span className="eyebrow">IA · conversa</span>
        <strong>abrir chat com presença</strong>
      </button>
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

  return (
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
            onClick={() => onSelect(dateIso)}
            aria-pressed={active}
          >
            <span>{weekday}</span>
            <strong>{date.getDate()}</strong>
          </button>
        );
      })}
    </div>
  );
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
