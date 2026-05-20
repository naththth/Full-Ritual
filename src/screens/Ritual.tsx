import { useState } from 'react';
import { PresenceSlider } from '../components/PresenceSlider';
import { ROUTINES, getRoutineTasks, type RoutineArea, type RoutinePeriod } from '../data/ritualContent';
import { relativeDateLabel } from '../lib/dates';
import { uploadImageOrPreview } from '../lib/uploads';
import { useLocalState } from '../lib/useLocalState';
import { useApp } from '../store/useStore';
import { hasSupabase, supabase } from '../lib/supabase';

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

type RoutineChecks = Record<string, boolean>;

export function Ritual() {
  const showToast = useApp((s) => s.showToast);
  const goTo = useApp((s) => s.goTo);
  const userId = useApp((s) => s.userId);
  const selectedDate = useApp((s) => s.selectedDate);

  const [period, setPeriod] = useState<RoutinePeriod>('day');
  const [checks, setChecks] = useLocalState<RoutineChecks>(`full-ritual-routine-checks-${selectedDate}`, {});
  const [skinPhoto, setSkinPhoto] = useLocalState<string | null>(`full-ritual-skin-photo-${selectedDate}`, null);
  const [energy, setEnergy] = useState(6);
  const [calm, setCalm] = useState(5);
  const [skinState, setSkinState] = useState(7);
  const [bodyState, setBodyState] = useState(6);
  const [signals, setSignals] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const routine: Record<RoutineArea, ReturnType<typeof getRoutineTasks>> = {
    face: getRoutineTasks(period, 'face', selectedDate),
    body: ROUTINES[period].body,
    aromas: ROUTINES[period].aromas,
  };
  const total = Object.values(routine).reduce((sum, tasks) => sum + tasks.length, 0);
  const done = Object.entries(checks).filter(([key, value]) => key.startsWith(`${period}:`) && value).length;
  const dateLabel = relativeDateLabel(selectedDate);

  const toggleRoutine = (area: RoutineArea, index: number) => {
    const key = `${period}:${area}:${index}`;
    setChecks((current) => ({ ...current, [key]: !current[key] }));
  };

  const markArea = (area: RoutineArea) => {
    setChecks((current) => {
      const next = { ...current };
      routine[area].forEach((_, index) => {
        next[`${period}:${area}:${index}`] = true;
      });
      return next;
    });
  };

  const toggleSignal = (signal: string) => {
    setSignals((prev) =>
      prev.includes(signal) ? prev.filter((item) => item !== signal) : [...prev, signal]
    );
  };

  const handleSkinPhoto = async (file: File) => {
    try {
      const photoUrl = await uploadImageOrPreview({
        bucket: 'skin',
        userId,
        file,
        prefix: `skin-${selectedDate}`,
      });
      setSkinPhoto(photoUrl);
      showToast('foto da pele guardada.');
    } catch (error) {
      console.error(error);
      showToast('não foi possível enviar a foto.');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      if (hasSupabase && userId) {
        const { error: checkinError } = await supabase.from('checkins').insert({
          user_id: userId,
          date: selectedDate,
          energy,
          calm,
          skin_state: skinState,
          body_state: bodyState,
          signals,
          note: note || null,
        });
        if (checkinError) throw checkinError;

        if (skinPhoto) {
          const { error: skinError } = await supabase.from('skincare_logs').insert({
            user_id: userId,
            date: selectedDate,
            time_of_day: period === 'day' ? 'manha' : 'noite',
            skin_signal: note || signals.join(', ') || null,
            photo_url: skinPhoto,
          });
          if (skinError) throw skinError;
        }
      }
      showToast('ritual guardado.');
      goTo('home');
    } catch (error) {
      showToast('não foi possível guardar agora.');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen stack-md ritual-screen">
      <header className={`ritual-hero ritual-hero--${period}`}>
        <div className="row-between">
          <span className="eyebrow">rosto · corpo · aromas · {dateLabel}</span>
          <span className="ritual-score">{done}/{total}</span>
        </div>
        <h1 className="t-display-lg">
          {period === 'day' ? 'Acordar a pele sem pressa.' : 'Desacelerar antes de dormir.'}
        </h1>
        <p>{period === 'day' ? 'Ritual do dia: presença antes de performance.' : 'Ritual da noite: o corpo entende que acabou.'}</p>
        <div className="segmented segmented--light">
          <button className={period === 'day' ? 'segmented--active' : ''} onClick={() => setPeriod('day')}>dia</button>
          <button className={period === 'night' ? 'segmented--active' : ''} onClick={() => setPeriod('night')}>noite</button>
        </div>
      </header>

      {(['face', 'body', 'aromas'] as RoutineArea[]).map((area) => (
        <section key={area} className="card stack">
          <div className="row-between">
            <span className="eyebrow">{areaLabel(area)}</span>
            <button className="chip" onClick={() => markArea(area)}>marcar bloco</button>
          </div>
          <div className="task-list">
            {routine[area].map((task, index) => {
              const checked = Boolean(checks[`${period}:${area}:${index}`]);
              return (
                <button
                  key={task.title}
                  className={`task-row ${checked ? 'task-row--done' : ''}`}
                  onClick={() => toggleRoutine(area, index)}
                >
                  <span className="task-check">{checked ? '✓' : ''}</span>
                  <span>
                    <strong>{task.title}</strong>
                    <small>{task.description}</small>
                    <em>{task.tag}</em>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <section className="card stack">
        <span className="eyebrow">check-in · energia</span>
        <PresenceSlider label="energia" value={energy} onChange={setEnergy} color="var(--body)" />
        <div className="divider" />
        <PresenceSlider label="calma" value={calm} onChange={setCalm} color="var(--mind)" />
        <div className="divider" />
        <PresenceSlider label="pele" value={skinState} onChange={setSkinState} color="var(--skin)" />
        <div className="divider" />
        <PresenceSlider label="corpo" value={bodyState} onChange={setBodyState} color="var(--diet)" />
      </section>

      <section className="stack">
        <span className="eyebrow">sinais do corpo</span>
        <div className="signal-grid">
          {SIGNAL_TAGS.map((signal) => (
            <button
              key={signal.id}
              className={`signal-button ${signals.includes(signal.id) ? 'signal-button--active' : ''}`}
              onClick={() => toggleSignal(signal.id)}
              aria-pressed={signals.includes(signal.id)}
            >
              <span className="signal-icon" aria-hidden>{signal.icon}</span>
              <span>{signal.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card stack ritual-photo-card">
        <div className="photo-card-head">
          <div>
            <span className="eyebrow">registro visual</span>
            <h2>Foto da pele</h2>
          </div>
          <span className="optional-badge">opcional</span>
        </div>
        <p className="t-body-sm muted">
          Use quando houver textura, ardor, acne, vermelhidão ou mudança que você queira acompanhar.
        </p>
        <label className="file-button file-button--quiet">
          adicionar foto
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleSkinPhoto(file);
            }}
          />
        </label>
        {skinPhoto && <img className="photo-preview" src={skinPhoto} alt="Foto da pele" />}
        <textarea
          className="field"
          rows={3}
          placeholder="alguma coisa que você quer deixar registrada do dia…"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </section>

      <button className="btn btn--primary btn--full" onClick={save} disabled={saving}>
        {saving ? 'guardando…' : 'guardar este ritual'}
      </button>
    </div>
  );
}

function areaLabel(area: RoutineArea) {
  const labels: Record<RoutineArea, string> = {
    face: 'rosto',
    body: 'corpo',
    aromas: 'aromas',
  };
  return labels[area];
}
