import { type CSSProperties, useEffect, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { isoToday } from '../lib/dates';
import { hasSupabase, supabase } from '../lib/supabase';
import { useApp } from '../store/useStore';

type PainType = 'aguda' | 'crônica' | 'pós-treino' | 'inflamação' | 'tensão';

interface PainLog {
  id: string;
  user_id: string;
  date: string;
  region: string;
  intensity: number;
  pain_type: PainType | null;
  context: string | null;
  notes: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

const BODY_REGIONS = [
  'cabeça', 'pescoço', 'ombro direito', 'ombro esquerdo',
  'coluna cervical', 'coluna torácica', 'lombar',
  'abdômen', 'quadril', 'glúteo',
  'joelho direito', 'joelho esquerdo',
  'tornozelo direito', 'tornozelo esquerdo',
  'pé direito', 'pé esquerdo',
  'cotovelo', 'punho', 'mão', 'panturrilha', 'coxa',
];

const PAIN_TYPES: { value: PainType; label: string; color: string }[] = [
  { value: 'aguda',       label: 'aguda',       color: 'var(--body)' },
  { value: 'crônica',     label: 'crônica',     color: 'var(--spirit)' },
  { value: 'pós-treino',  label: 'pós-treino',  color: 'var(--skin)' },
  { value: 'inflamação',  label: 'inflamação',  color: '#e67e22' },
  { value: 'tensão',      label: 'tensão',      color: 'var(--mind)' },
];

function intensityColor(n: number) {
  if (n <= 3) return 'var(--diet)';
  if (n <= 6) return 'var(--skin)';
  if (n <= 8) return 'var(--body)';
  return '#c0392b';
}

export function Pain() {
  const userId = useApp((s) => s.userId);
  const showToast = useApp((s) => s.showToast);

  const [logs, setLogs] = useState<PainLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<{
    date: string;
    region: string;
    customRegion: string;
    intensity: number;
    pain_type: PainType | null;
    context: string;
    notes: string;
  }>({
    date: isoToday(),
    region: '',
    customRegion: '',
    intensity: 5,
    pain_type: null,
    context: '',
    notes: '',
  });

  useEffect(() => {
    if (!hasSupabase || !userId) { setLoading(false); return; }
    supabase
      .from('pain_logs')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) console.error(error);
        setLogs((data ?? []) as PainLog[]);
        setLoading(false);
      });
  }, [userId]);

  const save = async () => {
    if (!form.region && !form.customRegion) { showToast('selecione ou descreva a região.'); return; }
    if (!userId) return;
    setSaving(true);

    const region = form.customRegion.trim() || form.region;
    const payload = {
      user_id: userId,
      date: form.date,
      region,
      intensity: form.intensity,
      pain_type: form.pain_type,
      context: form.context.trim() || null,
      notes: form.notes.trim() || null,
      resolved: false,
      resolved_at: null,
    };

    try {
      if (hasSupabase) {
        const { data, error } = await supabase.from('pain_logs').insert(payload).select('*').single();
        if (error) throw error;
        setLogs((prev) => [data as PainLog, ...prev]);
      } else {
        setLogs((prev) => [{ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() } as PainLog, ...prev]);
      }
      setForm({ date: isoToday(), region: '', customRegion: '', intensity: 5, pain_type: null, context: '', notes: '' });
      setAdding(false);
    } catch (err) {
      console.error(err);
      showToast('não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const resolve = async (id: string) => {
    setLogs((prev) => prev.map((l) => l.id === id ? { ...l, resolved: true, resolved_at: isoToday() } : l));
    if (!hasSupabase) return;
    await supabase.from('pain_logs').update({ resolved: true, resolved_at: isoToday() }).eq('id', id);
  };

  const active = logs.filter((l) => !l.resolved);
  const resolved = logs.filter((l) => l.resolved);

  return (
    <div className="screen stack-md">
      <header className="screen-header stack">
        <BackButton />
        <span className="eyebrow">saúde · dor e lesões</span>
        <h1 className="t-display-lg">
          O que o corpo <em className="t-display-italic">avisa.</em>
        </h1>
        <p className="t-body muted">
          Registre dores, lesões e desconfortos. Histórico ajuda a identificar padrões e comunicar com profissionais de saúde.
        </p>
      </header>

      {/* Add form */}
      {adding ? (
        <section className="card stack">
          <span className="eyebrow">novo registro</span>
          <label className="compact-field">
            <span>data</span>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </label>

          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>região</span>
            <div className="pain-regions">
              {BODY_REGIONS.map((r) => (
                <button
                  key={r}
                  className={`chip ${form.region === r ? 'chip--active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, region: r, customRegion: '' }))}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              className="field"
              style={{ marginTop: 8 }}
              placeholder="ou descreva outra região..."
              value={form.customRegion}
              onChange={(e) => setForm((f) => ({ ...f, customRegion: e.target.value, region: '' }))}
            />
          </div>

          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
              intensidade · <strong style={{ color: intensityColor(form.intensity) }}>{form.intensity}/10</strong>
            </span>
            <input
              type="range"
              min={0}
              max={10}
              value={form.intensity}
              onChange={(e) => setForm((f) => ({ ...f, intensity: Number(e.target.value) }))}
              style={{ '--range-fill': intensityColor(form.intensity) } as CSSProperties}
            />
            <div className="pain-scale-labels">
              <span>nenhuma</span>
              <span>moderada</span>
              <span>intensa</span>
            </div>
          </div>

          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>tipo</span>
            <div className="chip-row">
              {PAIN_TYPES.map((t) => (
                <button
                  key={t.value}
                  className={`chip ${form.pain_type === t.value ? 'chip--active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, pain_type: t.value }))}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <input
            className="field"
            placeholder="contexto (ex: após treino de corrida, ao acordar...)"
            value={form.context}
            onChange={(e) => setForm((f) => ({ ...f, context: e.target.value }))}
          />
          <textarea
            className="field"
            rows={2}
            placeholder="observações, evolução, tratamento..."
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />

          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => void save()} disabled={saving}>
              {saving ? 'salvando...' : 'registrar'}
            </button>
            <button className="btn btn--secondary" onClick={() => setAdding(false)}>cancelar</button>
          </div>
        </section>
      ) : (
        <button className="btn btn--secondary btn--full" onClick={() => setAdding(true)}>
          + registrar dor ou lesão
        </button>
      )}

      {/* Active */}
      {!loading && active.length > 0 && (
        <section className="stack">
          <span className="eyebrow">ativas · {active.length}</span>
          {active.map((log) => (
            <PainCard key={log.id} log={log} onResolve={resolve} />
          ))}
        </section>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <details className="stack">
          <summary className="eyebrow" style={{ cursor: 'pointer', padding: '4px 0' }}>
            resolvidas · {resolved.length}
          </summary>
          <div className="stack" style={{ marginTop: 8 }}>
            {resolved.slice(0, 10).map((log) => (
              <PainCard key={log.id} log={log} resolved />
            ))}
          </div>
        </details>
      )}

      {!loading && logs.length === 0 && !adding && (
        <div className="labs-empty">
          <span className="labs-empty-glyph">○</span>
          <p>Nenhuma dor registrada. Bom sinal! Registre quando precisar para rastrear padrões.</p>
        </div>
      )}
    </div>
  );
}

function PainCard({
  log,
  onResolve,
  resolved = false,
}: {
  log: PainLog;
  onResolve?: (id: string) => void;
  resolved?: boolean;
}) {
  const typeInfo = PAIN_TYPES.find((t) => t.value === log.pain_type);
  const color = intensityColor(log.intensity);

  return (
    <article className="card pain-card" style={{ '--intensity-color': color } as CSSProperties}>
      <div className="pain-card-header">
        <div className="pain-intensity-badge" style={{ color }}>
          {log.intensity}<span>/10</span>
        </div>
        <div className="pain-card-info">
          <strong>{log.region}</strong>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="t-body-sm muted">{formatDate(log.date)}</span>
            {typeInfo && (
              <span className="chip" style={{ fontSize: 10, padding: '2px 8px', color: typeInfo.color }}>
                {typeInfo.label}
              </span>
            )}
          </div>
        </div>
        {!resolved && onResolve && (
          <button
            className="pain-resolve-btn"
            onClick={() => onResolve(log.id)}
            title="Marcar como resolvida"
          >
            ✓
          </button>
        )}
        {resolved && <span className="pain-resolved-mark">✓</span>}
      </div>
      {(log.context || log.notes) && (
        <p className="t-body-sm muted">{log.context ?? log.notes}</p>
      )}
    </article>
  );
}

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
