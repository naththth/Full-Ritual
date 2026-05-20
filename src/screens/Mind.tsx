import { useState } from 'react';
import { QUICK_LINKS, ROUTINES } from '../data/ritualContent';
import { relativeDateLabel } from '../lib/dates';
import { useLocalState } from '../lib/useLocalState';
import { hasSupabase, supabase } from '../lib/supabase';
import { useApp } from '../store/useStore';
import type { MindLog } from '../types';

type MindType = MindLog['type'];

interface MindState {
  type: MindType;
  duration: string;
  notes: string;
  checks: Record<number, boolean>;
  resourceIndex: number;
}

const initialMind: MindState = {
  type: 'foco',
  duration: '25',
  notes: '',
  checks: {},
  resourceIndex: 0,
};

const MIND_TYPES: { value: MindType; label: string; detail: string }[] = [
  { value: 'foco', label: 'foco', detail: 'bloco curto, ambiente pronto' },
  { value: 'leitura', label: 'leitura', detail: 'sem celular, uma página basta' },
  { value: 'som', label: 'som', detail: 'playlist, brown noise ou silêncio' },
  { value: 'meditacao', label: 'meditação', detail: 'respiração e aterramento' },
  { value: 'pausa', label: 'pausa', detail: 'reset antes de continuar' },
];

export function Mind() {
  const userId = useApp((s) => s.userId);
  const showToast = useApp((s) => s.showToast);
  const selectedDate = useApp((s) => s.selectedDate);
  const [mind, setMind] = useLocalState<MindState>(`full-ritual-mind-${selectedDate}`, initialMind);
  const [saving, setSaving] = useState(false);
  const dateLabel = relativeDateLabel(selectedDate);
  const tasks = ROUTINES.day.aromas;
  const done = tasks.filter((_, index) => mind.checks[index]).length;
  const selectedResource = QUICK_LINKS[mind.resourceIndex] ?? QUICK_LINKS[0];

  const update = <K extends keyof MindState>(key: K, value: MindState[K]) => {
    setMind((current) => ({ ...current, [key]: value }));
  };

  const toggleTask = (index: number) => {
    setMind((current) => ({
      ...current,
      checks: { ...current.checks, [index]: !current.checks[index] },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      if (hasSupabase && userId) {
        const { error } = await supabase.from('mind_logs').insert({
          user_id: userId,
          date: selectedDate,
          type: mind.type,
          duration_min: Number(mind.duration) || null,
          content_ref: selectedResource?.[0] ?? null,
          notes: mind.notes || null,
        });
        if (error) throw error;
      }
      showToast('mente guardada.');
    } catch (error) {
      console.error(error);
      showToast('não foi possível salvar mente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen stack-md mind-screen">
      <section className="mind-hero">
        <span className="eyebrow">mente · {dateLabel}</span>
        <h1>
          Volte mais lento do que <em>partiu.</em>
        </h1>
        <p>
          Foco, leitura, som e pausas pequenas para a cabeça não virar mais uma tarefa do corpo.
        </p>
        <div className="mind-score">
          <strong>{done}/{tasks.length}</strong>
          <span>ambiente preparado</span>
        </div>
      </section>

      <section className="card stack">
        <span className="eyebrow">ritual mental</span>
        <div className="task-list">
          {tasks.map((task, index) => {
            const checked = Boolean(mind.checks[index]);
            return (
              <button
                key={task.title}
                className={`task-row ${checked ? 'task-row--done' : ''}`}
                onClick={() => toggleTask(index)}
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

      <section className="card stack">
        <span className="eyebrow">prática</span>
        <div className="mind-type-grid">
          {MIND_TYPES.map((type) => (
            <button
              key={type.value}
              className={`mind-type ${mind.type === type.value ? 'mind-type--active' : ''}`}
              onClick={() => update('type', type.value)}
            >
              <strong>{type.label}</strong>
              <span>{type.detail}</span>
            </button>
          ))}
        </div>
        <label className="compact-field">
          <span>duração</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={mind.duration}
            onChange={(event) => update('duration', event.target.value)}
          />
        </label>
        <textarea
          className="field"
          rows={3}
          placeholder="observação: distrações, clareza, pressão, ambiente..."
          value={mind.notes}
          onChange={(event) => update('notes', event.target.value)}
        />
      </section>

      <section className="card stack">
        <span className="eyebrow">repertório</span>
        <div className="resource-list">
          {QUICK_LINKS.map((link, index) => (
            <button
              key={link[0]}
              className={`resource-row ${mind.resourceIndex === index ? 'resource-row--active' : ''}`}
              onClick={() => update('resourceIndex', index)}
            >
              <strong>{link[0]}</strong>
              <span>{link[1]}</span>
            </button>
          ))}
        </div>
        {selectedResource && (
          <a className="btn btn--secondary btn--full" href={selectedResource[2]} target="_blank" rel="noreferrer">
            abrir referência
          </a>
        )}
      </section>

      <button className="btn btn--primary btn--full" onClick={save} disabled={saving}>
        {saving ? 'guardando…' : `guardar mente de ${dateLabel}`}
      </button>
    </div>
  );
}
