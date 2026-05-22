import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { PresenceSlider } from '../components/PresenceSlider';
import { cycleInfo } from '../lib/cycle';
import { addDays, dateFromIso, diffMinutes, formatDateLong, isoToday, lastDays, minutesToSleepLabel, relativeDateLabel } from '../lib/dates';
import { hasSupabase, supabase } from '../lib/supabase';
import { useAutoSave } from '../lib/useAutoSave';
import { useLocalState } from '../lib/useLocalState';
import { useApp } from '../store/useStore';
import type { CyclePhase, SleepLog } from '../types';

const SIGNAL_TAGS = [
  { id: 'cabeça pesada', label: 'cabeça pesada', icon: '◜' },
  { id: 'fome', label: 'fome', icon: '◒' },
  { id: 'tensão nos ombros', label: 'tensão nos ombros', icon: '⌁' },
  { id: 'ansiedade leve', label: 'ansiedade leve', icon: '◇' },
  { id: 'sede', label: 'sede', icon: '◍' },
  { id: 'cansaço', label: 'cansaço', icon: '◡' },
  { id: 'frio', label: 'frio', icon: '∴' },
  { id: 'calor', label: 'calor', icon: '☉' },
  { id: 'inquietação', label: 'inquietação', icon: '∿' },
  { id: 'paz', label: 'paz', icon: '○' },
];

const PHASE_META: Record<CyclePhase, { label: string; short: string; color: string }> = {
  menstrual: { label: 'menstrual', short: 'men', color: 'var(--spirit)' },
  folicular: { label: 'folicular', short: 'fol', color: 'var(--diet)' },
  ovulatoria: { label: 'ovulatória', short: 'ovu', color: 'var(--skin)' },
  lutea: { label: 'lútea', short: 'lut', color: 'var(--body)' },
};

type EnergyCheckin = {
  energy: number;
  calm: number;
  skinState: number;
  bodyState: number;
  signals: string[];
  note: string;
};

type CyclePrefs = {
  start: string;
  length: number;
  tracking: boolean;
};

function initialCheckin(): EnergyCheckin {
  return {
    energy: 6,
    calm: 5,
    skinState: 7,
    bodyState: 6,
    signals: [],
    note: '',
  };
}

function numberOrFallback(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeCheckin(value: EnergyCheckin): EnergyCheckin {
  return {
    energy: numberOrFallback(value.energy, 6),
    calm: numberOrFallback(value.calm, 5),
    skinState: numberOrFallback(value.skinState, 7),
    bodyState: numberOrFallback(value.bodyState, 6),
    signals: Array.isArray(value.signals) ? value.signals.filter((signal): signal is string => typeof signal === 'string') : [],
    note: typeof value.note === 'string' ? value.note : '',
  };
}

function normalizeCyclePrefs(value: CyclePrefs, fallbackDate: string): CyclePrefs {
  return {
    start: typeof value.start === 'string' && value.start ? value.start : fallbackDate,
    length: numberOrFallback(value.length, 28),
    tracking: Boolean(value.tracking),
  };
}

export function Energy() {
  const selectedDate = useApp((s) => s.selectedDate);
  const userId = useApp((s) => s.userId);
  const profile = useApp((s) => s.profile);
  const setProfile = useApp((s) => s.setProfile);
  const showToast = useApp((s) => s.showToast);

  const previousDate = isoToday(addDays(dateFromIso(selectedDate), -1));
  const [rawCheckin, setCheckin] = useLocalState<EnergyCheckin>(`full-ritual-energy-${selectedDate}`, initialCheckin());
  const [rawSleepLogs, setSleepLogs] = useLocalState<SleepLog[]>('full-ritual-sleep', []);
  const [rawCyclePrefs, setCyclePrefs] = useLocalState<CyclePrefs>('full-ritual-cycle', {
    start: profile?.cycle_start ?? selectedDate,
    length: profile?.cycle_length ?? 28,
    tracking: profile?.cycle_tracking ?? false,
  });
  const checkin = normalizeCheckin(rawCheckin);
  const sleepLogs = Array.isArray(rawSleepLogs) ? rawSleepLogs : [];
  const cyclePrefs = normalizeCyclePrefs(rawCyclePrefs, selectedDate);
  const [bedtime, setBedtime] = useState('23:30');
  const [wakeTime, setWakeTime] = useState('06:40');
  const [sleepQuality, setSleepQuality] = useState(7);
  const [sleepNotes, setSleepNotes] = useState('');
  const [activeCycleDate, setActiveCycleDate] = useState(selectedDate);
  const [sleepHistory, setSleepHistory] = useState<SleepLog[]>([]);
  const sleepInitialized = useRef(false);

  const duration = diffMinutes(bedtime, wakeTime);
  const dateLabel = relativeDateLabel(selectedDate);
  const cycleStart = cyclePrefs.start || profile?.cycle_start || selectedDate;
  const cycleLength = cyclePrefs.length || profile?.cycle_length || 28;
  const cycle = useMemo(() => {
    const selected = dateFromIso(selectedDate);
    const day = selected.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = addDays(selected, mondayOffset - 14);

    return Array.from({ length: 35 }, (_, index) => {
      const date = addDays(start, index);
      const info = cycleInfo(cycleStart, cycleLength, date);
      return { ...info, isToday: isoToday(date) === selectedDate };
    });
  }, [cycleLength, cycleStart, selectedDate]);
  const todayCycle = cycle.find((day) => day.date === selectedDate) ?? cycle.find((day) => day.isToday);
  const activeCycle = cycle.find((day) => day.date === activeCycleDate) ?? todayCycle;
  const currentSleep = sleepLogs.find((log) => log.date === selectedDate);

  useEffect(() => {
    setActiveCycleDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (!hasSupabase || !userId) return;
    const since = isoToday(addDays(new Date(), -13));
    supabase
      .from('sleep_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('date', since)
      .order('date', { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        setSleepHistory(data as SleepLog[]);
        setSleepLogs((current) => {
          const merged = [...current];
          for (const log of data as SleepLog[]) {
            if (!merged.some((l) => l.date === log.date)) merged.push(log);
          }
          return merged;
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    sleepInitialized.current = false;
  }, [selectedDate]);

  useEffect(() => {
    if (sleepInitialized.current) return;
    const existing = sleepHistory.find((l) => l.date === selectedDate) ?? currentSleep;
    if (!existing) return;
    sleepInitialized.current = true;
    if (existing.bedtime) setBedtime(existing.bedtime.slice(11, 16));
    if (existing.wake_time) setWakeTime(existing.wake_time.slice(11, 16));
    if (existing.quality != null) setSleepQuality(existing.quality);
    if (existing.notes) setSleepNotes(existing.notes);
  }, [sleepHistory, selectedDate, currentSleep]);

  useEffect(() => {
    const profileCycleStart = profile?.cycle_start;
    if (!profileCycleStart) return;
    setCyclePrefs((current) => {
      const next = {
        start: profileCycleStart,
        length: profile.cycle_length ?? 28,
        tracking: profile.cycle_tracking,
      };

      if (
        current.start === next.start &&
        current.length === next.length &&
        current.tracking === next.tracking
      ) return current;

      return next;
    });
  }, [profile?.cycle_length, profile?.cycle_start, profile?.cycle_tracking]);

  const setCheckinField = <K extends keyof EnergyCheckin>(field: K, value: EnergyCheckin[K]) => {
    setCheckin((current) => ({ ...normalizeCheckin(current), [field]: value }));
  };

  const toggleSignal = (signal: string) => {
    setCheckin((current) => {
      const normalized = normalizeCheckin(current);
      return {
        ...normalized,
        signals: normalized.signals.includes(signal)
          ? normalized.signals.filter((item) => item !== signal)
          : [...normalized.signals, signal],
      };
    });
  };

  useAutoSave(rawCheckin, async () => {
    if (!hasSupabase || !userId) return;
    try {
      const { error } = await supabase.from('checkins').upsert({
        user_id: userId,
        date: selectedDate,
        energy: checkin.energy,
        calm: checkin.calm,
        skin_state: checkin.skinState,
        body_state: checkin.bodyState,
        signals: checkin.signals,
        note: checkin.note || null,
      }, { onConflict: 'user_id,date' });
      if (error) throw error;
    } catch (error) {
      console.error(error);
      showToast('não foi possível salvar a energia.');
    }
  });

  useAutoSave(`${bedtime}|${wakeTime}|${sleepQuality}|${sleepNotes}`, async () => {
    if (!duration) return;

    const log: SleepLog = {
      id: currentSleep?.id ?? crypto.randomUUID(),
      user_id: userId ?? 'local',
      date: selectedDate,
      bedtime: `${previousDate}T${bedtime}:00`,
      wake_time: `${selectedDate}T${wakeTime}:00`,
      duration_min: duration,
      quality: sleepQuality,
      notes: sleepNotes || null,
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
        setSleepLogs((current) => [...current.filter((item) => item.date !== selectedDate), data as SleepLog]);
      } else {
        setSleepLogs((current) => [...current.filter((item) => item.date !== selectedDate), log]);
      }
    } catch (error) {
      console.error(error);
      showToast('não foi possível salvar o sono.');
    }
  });

  useAutoSave(rawCyclePrefs, async () => {
    const nextPrefs = {
      start: cyclePrefs.start || selectedDate,
      length: Number(cyclePrefs.length) || 28,
      tracking: true,
    };

    try {
      if (hasSupabase && userId) {
        const { data, error } = await supabase
          .from('profiles')
          .upsert({
            id: userId,
            name: profile?.name ?? 'voce',
            cycle_tracking: nextPrefs.tracking,
            cycle_start: nextPrefs.start,
            cycle_length: nextPrefs.length,
          }, { onConflict: 'id' })
          .select('*')
          .single();
        if (error) throw error;
        if (data) setProfile(data);
      } else if (profile) {
        setProfile({
          ...profile,
          cycle_tracking: nextPrefs.tracking,
          cycle_start: nextPrefs.start,
          cycle_length: nextPrefs.length,
        });
      }
    } catch (error) {
      console.error(error);
      showToast('não foi possível salvar o ciclo.');
    }
  });

  return (
    <div className="screen stack-md energy-screen">
      <header className="energy-hero">
        <span className="eyebrow">energia · {dateLabel}</span>
        <h1 className="t-display-lg">
          Como seu corpo <em className="t-display-italic">chegou</em> hoje.
        </h1>
        <p>
          Sono, sinais, ciclo e disposição em um lugar só, antes de decidir o ritmo do dia.
        </p>
      </header>

      <section className="metric-grid">
        <Metric label="energia" value={`${checkin.energy}/10`} />
        <Metric label="sono" value={currentSleep?.duration_min ? minutesToSleepLabel(currentSleep.duration_min) : minutesToSleepLabel(duration)} />
        <Metric label="ciclo" value={todayCycle ? `D${todayCycle.day}` : '—'} />
      </section>

      <section className="card stack">
        <span className="eyebrow">check-in · energia</span>
        <PresenceSlider label="energia" value={checkin.energy} onChange={(value) => setCheckinField('energy', value)} color="var(--body)" />
        <div className="divider" />
        <PresenceSlider label="calma" value={checkin.calm} onChange={(value) => setCheckinField('calm', value)} color="var(--mind)" />
        <div className="divider" />
        <PresenceSlider label="pele" value={checkin.skinState} onChange={(value) => setCheckinField('skinState', value)} color="var(--skin)" />
        <div className="divider" />
        <PresenceSlider label="corpo" value={checkin.bodyState} onChange={(value) => setCheckinField('bodyState', value)} color="var(--diet)" />
      </section>

      <section className="stack">
        <span className="eyebrow">sinais do corpo</span>
        <div className="signal-grid">
          {SIGNAL_TAGS.map((signal) => (
            <button
              key={signal.id}
              className={`signal-button ${checkin.signals.includes(signal.id) ? 'signal-button--active' : ''}`}
              onClick={() => toggleSignal(signal.id)}
              aria-pressed={checkin.signals.includes(signal.id)}
            >
              <span className="signal-icon" aria-hidden>{signal.icon}</span>
              <span>{signal.label}</span>
            </button>
          ))}
        </div>
        <textarea
          className="field"
          rows={3}
          placeholder="alguma sensação, dor, fome, humor ou contexto do dia..."
          value={checkin.note}
          onChange={(event) => setCheckinField('note', event.target.value)}
        />
      </section>

      <section className="card stack">
        <span className="eyebrow">sono · noite anterior</span>
        <div className="energy-sleep-grid">
          <label className="compact-field">
            <span>dormi em {relativeDateLabel(previousDate)}</span>
            <input type="time" value={bedtime} onChange={(event) => setBedtime(event.target.value)} />
          </label>
          <label className="compact-field">
            <span>acordei {dateLabel}</span>
            <input type="time" value={wakeTime} onChange={(event) => setWakeTime(event.target.value)} />
          </label>
        </div>
        <div className="energy-sleep-summary">
          <strong>{minutesToSleepLabel(duration)}</strong>
        </div>
        <label className="slider-field">
          <span className="eyebrow">qualidade · {sleepQuality}/10</span>
          <input type="range" min={0} max={10} value={sleepQuality} onChange={(event) => setSleepQuality(Number(event.target.value))} />
        </label>
        <textarea className="field" placeholder="despertares, tela, treino, álcool, sonhos..." value={sleepNotes} onChange={(event) => setSleepNotes(event.target.value)} />
      </section>

      {sleepHistory.length > 1 && (
        <SleepHistoryChart logs={sleepHistory} selectedDate={selectedDate} />
      )}

      <section className="card stack energy-cycle-card">
        <div className="row-between">
          <span className="eyebrow">ciclo menstrual</span>
          {activeCycle && (
            <span className="energy-cycle-badge" style={{ '--phase-color': PHASE_META[activeCycle.phase].color } as CSSProperties}>
              {PHASE_META[activeCycle.phase].label}
            </span>
          )}
        </div>
        <div className="energy-sleep-grid">
          <label className="compact-field">
            <span>início da última menstruação</span>
            <div className="energy-date-control">
              <strong>{formatDatePt(cyclePrefs.start)}</strong>
              <input
                type="date"
                value={cyclePrefs.start}
                onChange={(event) => setCyclePrefs({ ...cyclePrefs, start: event.target.value })}
                aria-label="Início da última menstruação"
              />
            </div>
          </label>
          <label className="compact-field">
            <span>duração média</span>
            <input type="number" min={20} max={45} value={cyclePrefs.length} onChange={(event) => setCyclePrefs({ ...cyclePrefs, length: Number(event.target.value) })} />
          </label>
        </div>
        {activeCycle && (
          <div className="energy-cycle-current">
            <div>
              <strong>Dia {activeCycle.day}</strong>
              <span>{formatDatePt(activeCycle.date)}</span>
            </div>
            <p>{activeCycle.text}</p>
          </div>
        )}
        <div className="energy-phase-legend">
          {Object.entries(PHASE_META).map(([phase, meta]) => (
            <span key={phase} style={{ '--phase-color': meta.color } as CSSProperties}>
              <i />
              {meta.label}
            </span>
          ))}
        </div>
        <div className="energy-cycle-weekdays" aria-hidden>
          {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="cycle-grid cycle-grid--energy">
          {cycle.map((day) => (
            <button
              key={day.date}
              className={`cycle-day cycle-day--${day.phase} ${day.date === selectedDate ? 'cycle-day--today' : ''} ${day.date === activeCycleDate ? 'cycle-day--selected' : ''}`}
              onClick={() => setActiveCycleDate(day.date)}
              title={`${day.date} · dia ${day.day} · ${PHASE_META[day.phase].label}`}
              aria-pressed={day.date === activeCycleDate}
            >
              <strong>{new Date(`${day.date}T12:00:00`).getDate()}</strong>
              <span>D{day.day}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

const SLEEP_GOAL_MIN = 480; // 8h

function SleepHistoryChart({ logs, selectedDate }: { logs: SleepLog[]; selectedDate: string }) {
  const days = lastDays(7);
  const mapped = days.map((date) => {
    const log = logs.find((l) => l.date === date);
    return { date, min: log?.duration_min ?? null, quality: log?.quality ?? null };
  });

  const maxMin = Math.max(SLEEP_GOAL_MIN, ...mapped.map((d) => d.min ?? 0));
  const debt = mapped.reduce((acc, d) => {
    if (d.min == null) return acc;
    return acc + Math.max(0, SLEEP_GOAL_MIN - d.min);
  }, 0);
  const debtH = Math.round(debt / 60);
  const avg = mapped.filter((d) => d.min != null);
  const avgMin = avg.length ? Math.round(avg.reduce((a, d) => a + (d.min ?? 0), 0) / avg.length) : null;
  const DAYS_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  return (
    <section className="card stack">
      <div className="row-between">
        <span className="eyebrow">histórico de sono · 7 noites</span>
        <span className="eyebrow" style={{ color: debtH > 3 ? 'var(--body)' : 'var(--diet)' }}>
          {debtH > 0 ? `débito ${debtH}h` : 'em dia ✓'}
        </span>
      </div>
      <div className="sleep-history-chart">
        {mapped.map((d) => {
          const pct = d.min != null ? Math.min((d.min / maxMin) * 100, 100) : 0;
          const goalPct = (SLEEP_GOAL_MIN / maxMin) * 100;
          const isToday = d.date === selectedDate;
          const isUnder = d.min != null && d.min < SLEEP_GOAL_MIN;
          const label = DAYS_PT[dateFromIso(d.date).getDay()];
          return (
            <div key={d.date} className="sleep-bar-col">
              <div className="sleep-bar-track" style={{ '--goal-pct': `${goalPct}%` } as CSSProperties}>
                <div
                  className={`sleep-bar-fill ${isUnder ? 'sleep-bar-fill--under' : ''} ${isToday ? 'sleep-bar-fill--today' : ''}`}
                  style={{ height: d.min != null ? `${pct}%` : '0%' }}
                  title={d.min != null ? minutesToSleepLabel(d.min) : '—'}
                />
              </div>
              <span className="sleep-bar-label">{label}</span>
              <span className="sleep-bar-value">{d.min != null ? minutesToSleepLabel(d.min) : '—'}</span>
            </div>
          );
        })}
      </div>
      {avgMin != null && (
        <p className="sleep-history-avg">média semanal · <strong>{minutesToSleepLabel(avgMin)}</strong></p>
      )}
    </section>
  );
}

function formatDatePt(iso: string) {
  if (!iso) return 'selecionar';
  return formatDateLong(iso);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
