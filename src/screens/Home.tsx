import { useEffect, useMemo, useState } from 'react';
import { MultiRing } from '../components/Ring';
import { QUOTES } from '../data/ritualContent';
import { cycleInfo } from '../lib/cycle';
import { dateFromIso, isoToday, relativeDateLabel, weekDaysAround } from '../lib/dates';
import { hasSupabase, supabase } from '../lib/supabase';
import { DIMENSIONS, type DailyScore, type DimensionKey, type Insight } from '../types';
import { useApp } from '../store/useStore';

const FALLBACK_SCORES: Record<DimensionKey, number> = {
  skin: 0.62,
  body: 0.75,
  mind: 0.48,
  diet: 0.55,
  spirit: 0.8,
};

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
    if (!dailyScore) return FALLBACK_SCORES;
    return {
      skin: dailyScore.score_skin / 100,
      body: dailyScore.score_body / 100,
      mind: dailyScore.score_mind / 100,
      diet: dailyScore.score_diet / 100,
      spirit: dailyScore.score_spirit / 100,
    };
  }, [dailyScore]);
  const totalScore = Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / 5) * 100);

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
          {latestInsight?.title ?? 'Hoje, comece pela pele.'}{' '}
          {cycle.phase === 'lutea' ? 'A fase lútea pede menos cobrança e mais água.' : 'A noite pediu mais calma do que o corpo deu.'}
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

      <section className="card card--ai quote-card">
        <p>{quote}</p>
      </section>

      <section className="card card--ai insight-review-card">
        <span className="eyebrow">review · {shortDateLabel}</span>
        <div className="insight-number-grid">
          <button onClick={() => goTo('sleep')}>
            <strong>6h12</strong>
            <span>sono</span>
          </button>
          <button onClick={() => goTo('evolution')}>
            <strong>{cycle.day}</strong>
            <span>ciclo</span>
          </button>
          <button onClick={() => goTo('body')}>
            <strong>{Math.round(scores.body * 10)}/10</strong>
            <span>energia</span>
          </button>
        </div>
        <div className="insight-copy">
          <p className="insight-title">
            {latestInsight?.title ?? 'Quando você dorme menos de seis horas, sua pele aparece reativa.'}
          </p>
          <p className="t-body">
            {latestInsight?.body ?? 'Hoje vale priorizar a barreira: menos ácidos, mais reparação.'}
          </p>
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
            <div className="weather-pill">
              <strong>{weather.source === 'local' ? 'local' : 'SP'}</strong>
              <small>base</small>
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
