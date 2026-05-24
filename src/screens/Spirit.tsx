import { relativeDateLabel } from '../lib/dates';
import { useSpiritDay } from '../lib/useSpiritDay';
import { useApp } from '../store/useStore';
import type { SpiritTheme } from '../types';

const THEMES: { value: SpiritTheme; label: string; mark: string }[] = [
  { value: 'presenca', label: 'presença', mark: '◌' },
  { value: 'gratidao', label: 'gratidão', mark: '✧' },
  { value: 'proposito', label: 'propósito', mark: '◇' },
  { value: 'silencio', label: 'silêncio', mark: '○' },
  { value: 'natureza', label: 'natureza', mark: '◒' },
  { value: 'criatividade', label: 'criatividade', mark: '△' },
];

export function Spirit() {
  const userId = useApp((s) => s.userId);
  const selectedDate = useApp((s) => s.selectedDate);
  const { state: spirit, update } = useSpiritDay(userId, selectedDate);
  const dateLabel = relativeDateLabel(selectedDate);

  return (
    <div className="screen stack-md spirit-screen">
      <section className="spirit-hero">
        <span className="eyebrow">espírito · {dateLabel}</span>
        <h1>
          A intenção orienta o que o dia <em>carrega.</em>
        </h1>
        <p>
          Um espaço para nomear intenção, aliviar peso e registrar uma gratidão sem transformar presença em tarefa.
        </p>
      </section>

      <section className="card stack spirit-card">
        <span className="eyebrow">tema do dia</span>
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <button
              key={theme.value}
              className={spirit.theme === theme.value ? 'theme-button theme-button--active' : 'theme-button'}
              onClick={() => update('theme', theme.value)}
            >
              <span>{theme.mark}</span>
              {theme.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <div className="field-group">
          <label htmlFor="intention">intenção</label>
          <textarea
            id="intention"
            className="field"
            rows={3}
            placeholder="o que eu quero cultivar hoje?"
            value={spirit.intention}
            onChange={(event) => update('intention', event.target.value)}
          />
        </div>
        <div className="field-group">
          <label htmlFor="relief">alívio</label>
          <textarea
            id="relief"
            className="field"
            rows={3}
            placeholder="o que não precisa seguir comigo?"
            value={spirit.relief}
            onChange={(event) => update('relief', event.target.value)}
          />
        </div>
        <div className="field-group">
          <label htmlFor="gratitude">gratidão</label>
          <textarea
            id="gratitude"
            className="field"
            rows={3}
            placeholder="uma coisa real pela qual sou grata"
            value={spirit.gratitude}
            onChange={(event) => update('gratitude', event.target.value)}
          />
        </div>
      </section>

      <section className="card stack">
        <div className="row-between">
          <span className="eyebrow">humor espiritual</span>
          <strong className="spirit-mood">{spirit.mood}/10</strong>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          value={spirit.mood}
          onChange={(event) => update('mood', Number(event.target.value))}
        />
      </section>

    </div>
  );
}
