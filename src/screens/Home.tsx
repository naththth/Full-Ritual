import { Ring, MultiRing } from '../components/Ring';
import { DIMENSIONS, type DimensionKey } from '../types';
import { useApp } from '../store/useStore';

// Dados mock — vão ser substituídos por queries reais ao Supabase quando
// useDailyScores() estiver pronto (fase 1 do roadmap).
const TODAY_SCORES: Record<DimensionKey, number> = {
  skin:   0.62,
  body:   0.75,
  mind:   0.48,
  diet:   0.55,
  spirit: 0.80,
};

export function Home() {
  const profile = useApp((s) => s.profile);
  const goTo = useApp((s) => s.goTo);

  const today = new Date();
  const dateLabel = today
    .toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    .toLowerCase();

  return (
    <div className="screen stack-md">
      {/* HERO */}
      <header className="stack" style={{ paddingTop: 8 }}>
        <div className="row-between">
          <span className="eyebrow">{dateLabel}</span>
          <button
            onClick={() => goTo('profile')}
            aria-label="Perfil"
            style={{
              width: 42, height: 42, borderRadius: '50%',
              background: profile?.photo_url ? `url(${profile.photo_url}) center/cover` : 'var(--camel)',
              display: 'grid', placeItems: 'center',
              fontFamily: 'var(--display)', fontSize: 22, color: 'var(--chocolate)',
            }}
          >
            {!profile?.photo_url && (profile?.name?.[0] ?? 'N')}
          </button>
        </div>

        <h1 className="t-display-lg" style={{ marginTop: 8 }}>
          Bom dia, <em className="t-display-italic">{(profile?.name ?? 'você').split(' ')[0]}.</em>
        </h1>
        <p className="t-body" style={{ color: 'var(--chocolate-soft)', maxWidth: 320, margin: '12px 0 0' }}>
          Hoje, comece pela pele. A noite pediu mais calma do que o corpo deu.
        </p>
      </header>

      {/* ANEL CENTRAL · 5 dimensões */}
      <section className="card" style={{ padding: 22, display: 'grid', placeItems: 'center' }}>
        <span className="eyebrow" style={{ alignSelf: 'flex-start' }}>presença · hoje</span>
        <div style={{ position: 'relative', margin: '12px 0' }}>
          <MultiRing
            size={210}
            stroke={10}
            gap={4}
            values={(['skin', 'body', 'mind', 'diet', 'spirit'] as DimensionKey[]).map((k) => ({
              value: TODAY_SCORES[k],
              color: DIMENSIONS[k].color,
            }))}
          />
          <div
            style={{
              position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div className="t-display-md">
                {Math.round(
                  (Object.values(TODAY_SCORES).reduce((a, b) => a + b, 0) / 5) * 100
                )}
              </div>
              <div className="eyebrow" style={{ marginTop: 4 }}>presença</div>
            </div>
          </div>
        </div>

        {/* Legenda · pontos coloridos */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 6,
            width: '100%',
            marginTop: 8,
          }}
        >
          {(Object.keys(DIMENSIONS) as DimensionKey[]).map((k) => (
            <button
              key={k}
              onClick={() => goTo('dimension', k)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: '8px 4px',
              }}
            >
              <span
                style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: DIMENSIONS[k].color,
                }}
                aria-hidden
              />
              <span
                className="eyebrow"
                style={{ fontSize: 9, letterSpacing: '0.14em' }}
              >
                {DIMENSIONS[k].label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* INSIGHT DA IA */}
      <section className="card card--ai stack">
        <span className="eyebrow">insight · ✦</span>
        <p className="t-display-md" style={{ color: 'var(--ivory)' }}>
          Quando você dorme menos de seis horas, sua pele aparece reativa em mais da metade dos dias seguintes.
        </p>
        <p className="t-body" style={{ color: 'rgba(245,238,223,0.78)' }}>
          Hoje vale priorizar a barreira: menos ácidos, mais reparação.
        </p>
        <button
          className="btn btn--full"
          style={{ background: 'var(--ivory)', color: 'var(--chocolate)' }}
          onClick={() => goTo('insight')}
        >
          ver no detalhe
        </button>
      </section>

      {/* MÉTRICAS RÁPIDAS */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <MiniMetric label="sono" value="6h12" />
        <MiniMetric label="água" value="1,8L" />
        <MiniMetric label="treino" value="42'" />
      </section>

      {/* ATALHOS POR DIMENSÃO */}
      <section className="stack">
        <span className="eyebrow">dimensões · entrar</span>
        {(Object.keys(DIMENSIONS) as DimensionKey[]).map((k) => (
          <button
            key={k}
            onClick={() => goTo('dimension', k)}
            className="card"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              width: '100%',
              textAlign: 'left',
            }}
          >
            <Ring
              size={48}
              stroke={5}
              value={TODAY_SCORES[k]}
              color={DIMENSIONS[k].color}
            >
              <span style={{ fontSize: 18 }}>{DIMENSIONS[k].glyph}</span>
            </Ring>
            <div style={{ flex: 1 }}>
              <div className="t-body" style={{ fontWeight: 500 }}>{DIMENSIONS[k].label}</div>
              <div className="t-body-sm muted">
                {Math.round(TODAY_SCORES[k] * 100)}% · toque para abrir
              </div>
            </div>
            <span style={{ fontSize: 20, color: 'var(--chocolate-soft)' }}>→</span>
          </button>
        ))}
      </section>

      <div style={{ height: 40 }} />
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="t-mono-num" style={{ fontSize: 24 }}>{value}</div>
      <div className="eyebrow" style={{ marginTop: 4 }}>{label}</div>
    </div>
  );
}
