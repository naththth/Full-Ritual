import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Ring } from '../components/Ring';
import { DIMENSIONS, type DimensionKey } from '../types';
import { useApp } from '../store/useStore';

// Mock até a query real chegar
const WEEK_DATA = [
  { day: 'seg', skin: 60, body: 70, mind: 55, diet: 45, spirit: 80 },
  { day: 'ter', skin: 65, body: 75, mind: 60, diet: 50, spirit: 75 },
  { day: 'qua', skin: 55, body: 68, mind: 70, diet: 55, spirit: 82 },
  { day: 'qui', skin: 62, body: 80, mind: 65, diet: 60, spirit: 78 },
  { day: 'sex', skin: 70, body: 72, mind: 75, diet: 65, spirit: 85 },
  { day: 'sáb', skin: 75, body: 65, mind: 80, diet: 70, spirit: 88 },
  { day: 'dom', skin: 62, body: 75, mind: 48, diet: 55, spirit: 80 },
];

export function Insight() {
  const goTo = useApp((s) => s.goTo);

  return (
    <div className="screen stack-md">
      <header className="stack">
        <span className="eyebrow">insight · semana 14</span>
        <h1 className="t-display-lg">
          O sono virou o <em className="t-display-italic">eixo.</em>
        </h1>
        <p className="t-body muted">
          Nas semanas em que você dorme menos de seis horas em média, sua pele
          aparece reativa em mais de 70% dos check-ins.
        </p>
      </header>

      {/* GRÁFICO DE EVOLUÇÃO · 7 dias */}
      <section className="card stack">
        <div className="row-between">
          <span className="eyebrow">evolução · 7 dias</span>
          <button className="chip" onClick={() => goTo('evolution')}>30 dias →</button>
        </div>
        <div style={{ width: '100%', height: 180, marginTop: 8 }}>
          <ResponsiveContainer>
            <LineChart data={WEEK_DATA} margin={{ top: 8, right: 8, left: -32, bottom: 0 }}>
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'rgba(74,44,34,0.5)', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--chocolate)',
                  border: 'none',
                  borderRadius: 12,
                  color: 'var(--ivory)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: 11,
                }}
                cursor={{ stroke: 'rgba(74,44,34,0.18)' }}
              />
              {(['skin', 'body', 'mind', 'diet', 'spirit'] as DimensionKey[]).map((k) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={DIMENSIONS[k].color}
                  strokeWidth={1.6}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {(['skin', 'body', 'mind', 'diet', 'spirit'] as DimensionKey[]).map((k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: DIMENSIONS[k].color,
                }}
              />
              <span className="t-body-sm muted">{DIMENSIONS[k].label.toLowerCase()}</span>
            </div>
          ))}
        </div>
      </section>

      {/* SONO */}
      <section className="card stack">
        <span className="eyebrow">sono · semana</span>
        <div className="row" style={{ gap: 18 }}>
          <Ring size={86} stroke={9} value={0.62} color="var(--mind)">
            <div style={{ textAlign: 'center' }}>
              <div className="t-mono-num" style={{ fontSize: 18 }}>6h12</div>
            </div>
          </Ring>
          <div style={{ flex: 1 }}>
            <div className="t-display-md">Abaixo do seu ritmo.</div>
            <p className="t-body-sm muted" style={{ marginTop: 6 }}>
              média ideal: 7h20 · variação de horário: alta
            </p>
          </div>
        </div>
        <button className="btn btn--secondary btn--full" onClick={() => goTo('sleep')}>
          ver detalhe do sono
        </button>
      </section>

      {/* CALENDÁRIO-CICLO · 35 dias */}
      <section className="card stack">
        <span className="eyebrow">calendário · 5 semanas</span>
        <h3 className="t-display-md">A constância vista de fora.</h3>
        <CycleCalendar />
      </section>

      {/* CTA · CHAT IA */}
      <button className="card card--ai" style={{ width: '100%', textAlign: 'left' }}>
        <span className="eyebrow">conversar · ✦</span>
        <p className="t-display-md" style={{ color: 'var(--ivory)', marginTop: 8 }}>
          O que sua semana ainda quer te dizer?
        </p>
        <div style={{ marginTop: 14 }}>
          <span className="btn btn--sm" style={{ background: 'var(--ivory)', color: 'var(--chocolate)' }}>
            abrir conversa
          </span>
        </div>
      </button>

      <div style={{ height: 40 }} />
    </div>
  );
}

function CycleCalendar() {
  // 35 dias: 5 semanas × 7 dias
  // Mock: cada dia tem um score por dimensão entre 0..1
  const days = Array.from({ length: 35 }, (_, i) => ({
    idx: i,
    scores: {
      skin:   Math.random() * 0.7 + 0.2,
      body:   Math.random() * 0.7 + 0.2,
      mind:   Math.random() * 0.7 + 0.2,
      diet:   Math.random() * 0.7 + 0.2,
      spirit: Math.random() * 0.7 + 0.2,
    },
    today: i === 14,
  }));

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 8,
      }}
    >
      {days.map((d) => (
        <div
          key={d.idx}
          style={{
            aspectRatio: '1',
            position: 'relative',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <svg
            viewBox="0 0 40 40"
            style={{
              width: '100%',
              height: '100%',
              transform: 'rotate(-90deg)',
              filter: d.today ? `drop-shadow(0 0 0 2px var(--chocolate))` : undefined,
            }}
          >
            {(['skin', 'body', 'mind', 'diet', 'spirit'] as DimensionKey[]).map((k, i) => {
              const r = 18 - i * 3;
              const c = 2 * Math.PI * r;
              return (
                <circle
                  key={k}
                  cx="20"
                  cy="20"
                  r={r}
                  fill="none"
                  stroke={DIMENSIONS[k].color}
                  strokeWidth="2"
                  strokeDasharray={`${c * d.scores[k]} ${c}`}
                  strokeLinecap="round"
                  opacity={0.85}
                />
              );
            })}
          </svg>
        </div>
      ))}
    </div>
  );
}
