import { type CSSProperties, useEffect, useState } from 'react';
import { Icon3D, type Icon3DKind } from '../components/Icon3D';
import { formatDateShort, isoToday } from '../lib/dates';
import { hasSupabase, supabase } from '../lib/supabase';
import { useApp } from '../store/useStore';

interface HealthSummary {
  labs: {
    lastDate: string | null;
    abnormalCount: number;
    totalMarkers: number;
  };
  supplements: {
    total: number;
    takenToday: number;
  };
  pain: {
    activeCount: number;
    lastRegion: string | null;
  };
}

const HEALTH_SECTIONS = [
  {
    key: 'labs' as const,
    title: 'Exames laboratoriais',
    subtitle: 'foto do laudo → IA extrai marcadores',
    icon: 'labs' as Icon3DKind,
    color: 'var(--mind)',
    screen: 'labs' as const,
  },
  {
    key: 'supplements' as const,
    title: 'Suplementos e medicamentos',
    subtitle: 'aderência diária e doses',
    icon: 'supplements' as Icon3DKind,
    color: 'var(--diet)',
    screen: 'supplements' as const,
  },
  {
    key: 'pain' as const,
    title: 'Dor e lesões',
    subtitle: 'registrar, rastrear e resolver',
    icon: 'pain' as Icon3DKind,
    color: 'var(--spirit)',
    screen: 'pain' as const,
  },
];

export function Health() {
  const userId = useApp((s) => s.userId);
  const goTo = useApp((s) => s.goTo);
  const [summary, setSummary] = useState<HealthSummary | null>(null);

  useEffect(() => {
    if (!hasSupabase || !userId) return;
    const today = isoToday();

    void Promise.all([
      supabase.from('lab_results').select('date, markers').eq('user_id', userId).order('date', { ascending: false }).limit(1),
      supabase.from('supplements').select('id').eq('user_id', userId).eq('active', true),
      supabase.from('supplement_logs').select('supplement_id, taken').eq('user_id', userId).eq('date', today),
      supabase.from('pain_logs').select('region').eq('user_id', userId).eq('resolved', false),
    ]).then(([labRes, suppRes, logRes, painRes]) => {
      const lastLab = labRes.data?.[0];
      const markers = lastLab?.markers as Record<string, { status: string }> | undefined;
      const abnormal = markers ? Object.values(markers).filter((m) => m.status !== 'normal').length : 0;

      const suppIds = new Set((suppRes.data ?? []).map((s: { id: string }) => s.id));
      const taken = (logRes.data ?? []).filter((l: { taken: boolean }) => l.taken).length;

      const lastPain = painRes.data?.[0];

      setSummary({
        labs: {
          lastDate: lastLab?.date ?? null,
          abnormalCount: abnormal,
          totalMarkers: markers ? Object.keys(markers).length : 0,
        },
        supplements: {
          total: suppIds.size,
          takenToday: taken,
        },
        pain: {
          activeCount: (painRes.data ?? []).length,
          lastRegion: lastPain?.region ?? null,
        },
      });
    });
  }, [userId]);

  return (
    <div className="screen stack-md">
      <header className="stack">
        <span className="eyebrow">saúde · visão geral</span>
        <h1 className="t-display-lg">
          Tudo que o corpo <em className="t-display-italic">registra.</em>
        </h1>
        <p className="t-body muted">
          Exames, suplementos e dores em um único lugar.
        </p>
      </header>

      {/* Status cards row */}
      {summary && (
        <section className="health-status-grid">
          <StatusCard
            label="exames"
            value={summary.labs.lastDate ? formatDateShort(summary.labs.lastDate) : '—'}
            sub={summary.labs.abnormalCount > 0 ? `${summary.labs.abnormalCount} fora` : summary.labs.totalMarkers > 0 ? 'tudo ok' : 'sem dados'}
            color="var(--mind)"
            alert={summary.labs.abnormalCount > 0}
            onClick={() => goTo('labs')}
          />
          <StatusCard
            label="suplementos"
            value={summary.supplements.total > 0 ? `${summary.supplements.takenToday}/${summary.supplements.total}` : '—'}
            sub={summary.supplements.total > 0 ? 'tomados hoje' : 'sem cadastro'}
            color="var(--diet)"
            alert={summary.supplements.total > 0 && summary.supplements.takenToday < summary.supplements.total}
            onClick={() => goTo('supplements')}
          />
          <StatusCard
            label="dores ativas"
            value={summary.pain.activeCount > 0 ? String(summary.pain.activeCount) : '—'}
            sub={summary.pain.lastRegion ?? 'nenhuma'}
            color="var(--spirit)"
            alert={summary.pain.activeCount > 0}
            onClick={() => goTo('pain')}
          />
        </section>
      )}

      {/* Navigation cards */}
      <div className="health-nav-grid">
        {HEALTH_SECTIONS.map((section) => (
          <button
            key={section.key}
            className="health-nav-card"
            style={{ '--section-color': section.color } as CSSProperties}
            onClick={() => goTo(section.screen)}
          >
            <Icon3D kind={section.icon} size={46} />
            <strong className="health-nav-title">{section.title}</strong>
            <span className="health-nav-sub">{section.subtitle}</span>
          </button>
        ))}
      </div>

      {/* Tips */}
      <section className="card stack health-tips-card">
        <span className="eyebrow">quando registrar</span>
        <ul className="health-tips-list">
          <li><strong>Exames</strong> — após consulta ou resultado do lab. A IA extrai tudo da foto.</li>
          <li><strong>Suplementos</strong> — cadastre uma vez, marque diariamente. Aderência conta.</li>
          <li><strong>Dor</strong> — registre quando aparecer. Rastrear intensidade ao longo do tempo ajuda no diagnóstico.</li>
        </ul>
      </section>
    </div>
  );
}

function StatusCard({
  label, value, sub, color, alert = false, onClick,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  alert?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`health-status-card ${alert ? 'health-status-card--alert' : ''}`}
      style={{ '--status-color': color } as CSSProperties}
      onClick={onClick}
    >
      {alert && <span className="health-status-dot" aria-label="atenção" />}
      <strong className="health-status-value">{value}</strong>
      <span className="health-status-label">{label}</span>
      <span className="health-status-sub">{sub}</span>
    </button>
  );
}
