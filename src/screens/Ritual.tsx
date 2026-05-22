import { type CSSProperties, useState } from 'react';
import { ROUTINES, getRoutineTasks, type RoutineArea, type RoutinePeriod } from '../data/ritualContent';
import { relativeDateLabel } from '../lib/dates';
import { uploadImageOrPreview } from '../lib/uploads';
import { useAutoSave } from '../lib/useAutoSave';
import { useLocalState } from '../lib/useLocalState';
import { scopedStorageKey } from '../lib/storage';
import { useApp } from '../store/useStore';
import { hasSupabase, supabase } from '../lib/supabase';

type RoutineChecks = Record<string, boolean>;

export function Ritual() {
  const showToast = useApp((s) => s.showToast);
  const userId = useApp((s) => s.userId);
  const selectedDate = useApp((s) => s.selectedDate);

  const [period, setPeriod] = useState<RoutinePeriod>('day');
  const [openAreas, setOpenAreas] = useState<Set<RoutineArea>>(new Set());
  const [checks, setChecks] = useLocalState<RoutineChecks>(scopedStorageKey(`full-ritual-routine-checks-${selectedDate}`, userId), {});
  const [skinPhoto, setSkinPhoto] = useLocalState<string | null>(scopedStorageKey(`full-ritual-skin-photo-${selectedDate}`, userId), null);
  const [note, setNote] = useState('');

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

  useAutoSave(`${period}|${skinPhoto ?? ''}|${note}`, async () => {
    if (!hasSupabase || !userId) return;
    if (!skinPhoto && !note) return;
    try {
      const { error } = await supabase.from('skincare_logs').upsert({
        user_id: userId,
        date: selectedDate,
        time_of_day: period === 'day' ? 'manha' : 'noite',
        skin_signal: note || null,
        photo_url: skinPhoto,
      }, { onConflict: 'user_id,date,time_of_day' });
      if (error) throw error;
    } catch (error) {
      console.error(error);
      showToast('não foi possível guardar agora.');
    }
  });

  return (
    <div className="screen stack-md ritual-screen">
      <header className={`ritual-hero ritual-hero--${period}`}>
        <div className="row-between">
          <span className="eyebrow">pele · aromas · {dateLabel}</span>
          <span className="ritual-score">{done}/{total}</span>
        </div>
        <h1 className="t-display-lg">
          {period === 'day' ? 'Acordar a pele sem pressa.' : 'Desacelerar antes de dormir.'}
        </h1>
        <p>{period === 'day' ? 'Rosto, corpo e aromas sem misturar com check-in corporal.' : 'Cuidado externo para a pele entender que o dia acabou.'}</p>
        <div className="segmented segmented--light">
          <button className={period === 'day' ? 'segmented--active' : ''} onClick={() => setPeriod('day')}>dia</button>
          <button className={period === 'night' ? 'segmented--active' : ''} onClick={() => setPeriod('night')}>noite</button>
        </div>
      </header>

      {(['face', 'body', 'aromas'] as RoutineArea[]).map((area) => {
        const isOpen = openAreas.has(area);
        const areaChecked = routine[area].filter((_, index) =>
          Boolean(checks[`${period}:${area}:${index}`])
        ).length;
        return (
          <details
            key={area}
            className="dimension-panel dimension-panel--skin card stack routine-accordion"
            open={isOpen}
            onToggle={(event) => {
              const nextOpen = event.currentTarget.open;
              setOpenAreas((prev) => {
                const next = new Set(prev);
                if (nextOpen) {
                  next.add(area);
                } else {
                  next.delete(area);
                }
                return next;
              });
            }}
            style={{ '--panel-dim': 'var(--skin)' } as CSSProperties}
          >
            <summary>
              <span>
                <span className="eyebrow">{areaLabel(area)}</span>
                <strong>{areaChecked}/{routine[area].length}</strong>
              </span>
            </summary>
            {isOpen && (
              <div className="dimension-panel-body stack">
                <button className="chip" onClick={() => markArea(area)}>marcar tudo</button>
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
              </div>
            )}
          </details>
        );
      })}

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
