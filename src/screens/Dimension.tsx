import { Ring } from '../components/Ring';
import { DIMENSIONS, type DimensionKey } from '../types';
import { useApp } from '../store/useStore';

const COPY: Record<DimensionKey, { phrase: string; steps: { label: string; done: boolean }[] }> = {
  skin: {
    phrase: 'Hoje, a barreira primeiro.',
    steps: [
      { label: 'limpeza suave · gel sem ácidos', done: true },
      { label: 'sérum de reparação · vitamina B5', done: true },
      { label: 'hidratante denso · ceramidas', done: false },
      { label: 'protetor solar · FPS 50', done: false },
    ],
  },
  body: {
    phrase: 'Movimento como retorno, não como dívida.',
    steps: [
      { label: 'mobilidade · 8 minutos', done: true },
      { label: 'treino de força · pernas', done: false },
      { label: 'água · 2,5L até as 18h', done: false },
    ],
  },
  mind: {
    phrase: 'Volte mais lento do que partiu.',
    steps: [
      { label: '20 min de leitura · sem celular', done: true },
      { label: 'sessão de foco · 90 minutos', done: false },
      { label: 'pausa de respiração · 4-7-8', done: false },
    ],
  },
  diet: {
    phrase: 'Comer com presença, não com pressa.',
    steps: [
      { label: 'café da manhã com proteína', done: true },
      { label: 'almoço com cor de verdade', done: true },
      { label: 'jantar leve · 3h antes de dormir', done: false },
    ],
  },
  spirit: {
    phrase: 'A intenção orienta o que o dia carrega.',
    steps: [
      { label: 'intenção do dia · escrita', done: true },
      { label: 'três gratidões · final do dia', done: false },
    ],
  },
};

export function Dimension({ dim }: { dim: DimensionKey }) {
  const goTo = useApp((s) => s.goTo);
  const d = DIMENSIONS[dim];
  const c = COPY[dim];
  const done = c.steps.filter((s) => s.done).length;

  return (
    <div
      className="screen"
      style={{
        background: d.color,
        minHeight: '100dvh',
        margin: '-20px -22px 0',
        padding: '20px 22px 120px',
      }}
    >
      <button
        onClick={() => goTo('home')}
        aria-label="voltar"
        style={{
          color: 'var(--ivory)',
          fontSize: 22,
          opacity: 0.85,
          marginBottom: 16,
        }}
      >
        ←
      </button>

      <div className="stack-md" style={{ color: 'var(--ivory)' }}>
        <header className="stack">
          <span className="eyebrow" style={{ color: 'rgba(245,238,223,0.7)' }}>
            {d.label.toLowerCase()} · hoje
          </span>
          <Ring
            size={170}
            stroke={11}
            value={done / c.steps.length}
            color="var(--ivory)"
            track="rgba(245,238,223,0.18)"
          >
            <div style={{ textAlign: 'center', color: 'var(--ivory)' }}>
              <div className="t-display-md" style={{ fontSize: 40 }}>
                {done}<span style={{ fontSize: 18, opacity: 0.7 }}>/{c.steps.length}</span>
              </div>
              <div className="eyebrow" style={{ color: 'rgba(245,238,223,0.7)', marginTop: 4 }}>
                presença
              </div>
            </div>
          </Ring>

          <p
            className="t-display-md"
            style={{
              color: 'var(--ivory)',
              maxWidth: 320,
              fontStyle: 'italic',
              marginTop: 12,
            }}
          >
            {c.phrase}
          </p>
        </header>

        <section
          style={{
            background: 'var(--ivory)',
            borderRadius: 22,
            margin: '0 -8px',
            padding: '20px 18px',
            color: 'var(--chocolate)',
          }}
        >
          <span className="eyebrow">passos · do dia</span>
          <div style={{ marginTop: 12 }}>
            {c.steps.map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 0',
                  borderBottom: i < c.steps.length - 1 ? '1px solid var(--line)' : 'none',
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    border: `1.5px solid ${s.done ? 'var(--chocolate)' : 'var(--line-strong)'}`,
                    background: s.done ? 'var(--chocolate)' : 'transparent',
                    color: 'var(--ivory)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  {s.done && '✓'}
                </span>
                <span
                  className="t-body"
                  style={{
                    textDecoration: s.done ? 'line-through' : 'none',
                    opacity: s.done ? 0.55 : 1,
                  }}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
