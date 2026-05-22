import type { CSSProperties } from 'react';
import { Ring } from '../components/Ring';
import { DIMENSION_COPY, getRoutineTasks } from '../data/ritualContent';
import { relativeDateLabel } from '../lib/dates';
import { DIMENSIONS, type DimensionKey } from '../types';
import { useApp } from '../store/useStore';

export function Dimension({ dim }: { dim: DimensionKey }) {
  const goTo = useApp((s) => s.goTo);
  const selectedDate = useApp((s) => s.selectedDate);
  const dimension = DIMENSIONS[dim];
  const copy = DIMENSION_COPY[dim];
  const tasks = getRoutineTasks(copy.period, copy.area, selectedDate);
  const done = Math.max(1, Math.floor(tasks.length / 2));
  const dateLabel = relativeDateLabel(selectedDate);

  return (
    <div className="dimension-screen" style={{ '--dim': dimension.color } as CSSProperties}>
      <div className="dimension-hero">
        <button onClick={() => goTo('home')} aria-label="voltar" className="back-button">←</button>
        <span className="eyebrow">{dimension.label.toLowerCase()} · {dateLabel}</span>

        <Ring
          size={156}
          stroke={11}
          value={done / tasks.length}
          color="var(--ivory)"
          track="rgba(245,238,223,0.22)"
        >
          <div style={{ textAlign: 'center', color: 'var(--ivory)' }}>
            <div className="t-display-md" style={{ fontSize: 38 }}>
              {done}<span style={{ fontSize: 18, opacity: 0.72 }}>/{tasks.length}</span>
            </div>
            <div className="eyebrow" style={{ color: 'rgba(245,238,223,0.72)', marginTop: 4 }}>
              presença
            </div>
          </div>
        </Ring>

        <h1>{copy.phrase}</h1>
        <p>{copy.support}</p>
      </div>

      <section className="dimension-sheet">
        <span className="eyebrow">passos · do dia</span>
        <div className="task-list">
          {tasks.map((task, index) => {
            const checked = index < done;
            return (
              <div key={task.title} className={`task-row ${checked ? 'task-row--done' : ''}`}>
                <span className="task-check">{checked ? '✓' : ''}</span>
                <span>
                  <strong>{task.title}</strong>
                  <small>{task.description}</small>
                  <em>{task.tag}</em>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="dimension-actions">
        <button className="btn btn--full" onClick={() => goTo('ritual')}>
          abrir ritual completo
        </button>
        {dim === 'diet' && (
          <button className="btn btn--full" onClick={() => goTo('diet')}>
            registrar refeições
          </button>
        )}
        {dim === 'skin' && (
          <button className="btn btn--full" onClick={() => goTo('ritual')}>
            registrar foto da pele
          </button>
        )}
      </section>
    </div>
  );
}
