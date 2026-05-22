import { type CSSProperties, useEffect, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { Icon3DLarge } from '../components/Icon3D';
import { isoToday } from '../lib/dates';
import { hasSupabase, supabase } from '../lib/supabase';
import { useApp } from '../store/useStore';

type Category = 'suplemento' | 'medicamento' | 'vitamina' | 'fitoterápico';
type Frequency = 'diaria' | 'alternada' | 'semanal';

interface Supplement {
  id: string;
  user_id: string;
  name: string;
  category: Category;
  dose: string | null;
  times: string[];
  frequency: Frequency;
  with_food: boolean;
  notes: string | null;
  active: boolean;
  created_at: string;
}

interface SupplementLog {
  id: string;
  supplement_id: string;
  date: string;
  taken: boolean;
  taken_at: string | null;
}

const CATEGORIES: { value: Category; label: string; color: string }[] = [
  { value: 'suplemento',    label: 'suplemento',    color: 'var(--body)' },
  { value: 'vitamina',      label: 'vitamina',      color: 'var(--diet)' },
  { value: 'medicamento',   label: 'medicamento',   color: 'var(--mind)' },
  { value: 'fitoterápico',  label: 'fitoterápico',  color: 'var(--spirit)' },
];

const TIMES = ['manhã', 'almoço', 'tarde', 'noite', 'dormir'];
const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'diaria',    label: 'diária' },
  { value: 'alternada', label: 'dias alternados' },
  { value: 'semanal',   label: 'semanal' },
];

const catColor = (cat: Category) => CATEGORIES.find((c) => c.value === cat)?.color ?? 'var(--mind)';

export function Supplements() {
  const userId = useApp((s) => s.userId);
  const showToast = useApp((s) => s.showToast);
  const today = isoToday();

  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [logs, setLogs] = useState<SupplementLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState<{
    name: string;
    category: Category;
    dose: string;
    times: string[];
    frequency: Frequency;
    with_food: boolean;
    notes: string;
  }>({
    name: '',
    category: 'suplemento',
    dose: '',
    times: ['manhã'],
    frequency: 'diaria',
    with_food: true,
    notes: '',
  });

  useEffect(() => {
    if (!hasSupabase || !userId) { setLoading(false); return; }
    Promise.all([
      supabase.from('supplements').select('*').eq('user_id', userId).eq('active', true).order('created_at'),
      supabase.from('supplement_logs').select('*').eq('user_id', userId).eq('date', today),
    ]).then(([suppRes, logRes]) => {
      if (suppRes.error) console.error(suppRes.error);
      if (logRes.error) console.error(logRes.error);
      setSupplements((suppRes.data ?? []) as Supplement[]);
      setLogs((logRes.data ?? []) as SupplementLog[]);
      setLoading(false);
    });
  }, [userId, today]);

  const toggleTaken = async (supp: Supplement) => {
    if (!userId) return;
    const existing = logs.find((l) => l.supplement_id === supp.id);
    const newTaken = !(existing?.taken ?? false);

    setLogs((prev) => {
      const without = prev.filter((l) => l.supplement_id !== supp.id);
      return [...without, {
        id: existing?.id ?? crypto.randomUUID(),
        supplement_id: supp.id,
        date: today,
        taken: newTaken,
        taken_at: newTaken ? new Date().toISOString() : null,
      }];
    });

    if (!hasSupabase) return;
    await supabase.from('supplement_logs').upsert({
      user_id: userId,
      supplement_id: supp.id,
      date: today,
      taken: newTaken,
      taken_at: newTaken ? new Date().toISOString() : null,
    }, { onConflict: 'user_id,supplement_id,date' });
  };

  const toggleFormTime = (time: string) => {
    setForm((f) => ({
      ...f,
      times: f.times.includes(time) ? f.times.filter((t) => t !== time) : [...f.times, time],
    }));
  };

  const saveSupplement = async () => {
    if (!form.name.trim() || !userId) return;
    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        name: form.name.trim(),
        category: form.category,
        dose: form.dose.trim() || null,
        times: form.times,
        frequency: form.frequency,
        with_food: form.with_food,
        notes: form.notes.trim() || null,
        active: true,
      };

      if (hasSupabase) {
        const { data, error } = await supabase.from('supplements').insert(payload).select('*').single();
        if (error) throw error;
        setSupplements((prev) => [...prev, data as Supplement]);
      } else {
        setSupplements((prev) => [...prev, { ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() } as Supplement]);
      }
      setForm({ name: '', category: 'suplemento', dose: '', times: ['manhã'], frequency: 'diaria', with_food: true, notes: '' });
      setAdding(false);
      showToast('adicionado com sucesso.');
    } catch (err) {
      console.error(err);
      showToast('não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (id: string) => {
    setSupplements((prev) => prev.filter((s) => s.id !== id));
    if (!hasSupabase) return;
    await supabase.from('supplements').update({ active: false }).eq('id', id);
  };

  const takenToday = logs.filter((l) => l.taken).length;
  const byCategory = CATEGORIES.map((cat) => ({
    ...cat,
    items: supplements.filter((s) => s.category === cat.value),
  })).filter((cat) => cat.items.length > 0);

  return (
    <div className="screen stack-md">
      <header className="screen-header stack">
        <BackButton />
        <span className="eyebrow">saúde · suplementos e medicamentos</span>
        <h1 className="t-display-lg">
          O que entra <em className="t-display-italic">todo dia.</em>
        </h1>
        <p className="t-body muted">
          Aderência diária, doses e contexto em um lugar só.
        </p>
      </header>

      {/* Daily adherence summary */}
      {supplements.length > 0 && (
        <section className="card suppl-summary-card">
          <div className="suppl-summary-ring" style={{ '--pct': `${takenToday / supplements.length}` } as CSSProperties}>
            <span className="suppl-summary-number">{takenToday}/{supplements.length}</span>
            <span className="suppl-summary-label">tomados hoje</span>
          </div>
          <div className="suppl-summary-list">
            {supplements.filter((s) => !logs.find((l) => l.supplement_id === s.id && l.taken)).slice(0, 3).map((s) => (
              <span key={s.id} className="suppl-pending-chip" style={{ '--cat-color': catColor(s.category) } as CSSProperties}>
                {s.name}
              </span>
            ))}
            {supplements.filter((s) => !logs.find((l) => l.supplement_id === s.id && l.taken)).length > 3 && (
              <span className="suppl-pending-chip" style={{ '--cat-color': 'var(--camel)' } as CSSProperties}>
                +{supplements.filter((s) => !logs.find((l) => l.supplement_id === s.id && l.taken)).length - 3} restantes
              </span>
            )}
          </div>
        </section>
      )}

      {/* By category */}
      {!loading && byCategory.map((cat) => (
        <section key={cat.value} className="stack">
          <span className="eyebrow" style={{ color: cat.color }}>{cat.label}</span>
          {cat.items.map((supp) => {
            const log = logs.find((l) => l.supplement_id === supp.id);
            const taken = log?.taken ?? false;
            return (
              <article
                key={supp.id}
                className={`card suppl-item ${taken ? 'suppl-item--taken' : ''}`}
                style={{ '--cat-color': catColor(supp.category) } as CSSProperties}
              >
                <button
                  className="suppl-check"
                  onClick={() => void toggleTaken(supp)}
                  aria-pressed={taken}
                  aria-label={taken ? `Desmarcar ${supp.name}` : `Marcar ${supp.name} como tomado`}
                >
                  {taken ? '✓' : ''}
                </button>
                <div className="suppl-info">
                  <strong>{supp.name}</strong>
                  <span className="t-body-sm muted">
                    {[supp.dose, supp.times.join(' · '), supp.with_food ? 'com alimento' : ''].filter(Boolean).join(' · ')}
                  </span>
                  {supp.notes && <span className="t-body-sm muted">{supp.notes}</span>}
                </div>
                <button
                  className="suppl-archive"
                  onClick={() => void archive(supp.id)}
                  aria-label="Arquivar"
                  title="Arquivar"
                >
                  ×
                </button>
              </article>
            );
          })}
        </section>
      ))}

      {/* Add form */}
      {adding ? (
        <section className="card stack">
          <span className="eyebrow">adicionar</span>
          <input
            className="field"
            placeholder="nome (ex: Vitamina D3, Ômega-3, Levotiroxina)"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            autoFocus
          />
          <div className="chip-row">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                className={`chip ${form.category === cat.value ? 'chip--active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, category: cat.value }))}
                style={form.category === cat.value ? { '--chip-active-bg': cat.color } as CSSProperties : undefined}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="suppl-form-row">
            <label className="compact-field" style={{ flex: 1 }}>
              <span>dose</span>
              <input
                type="text"
                placeholder="ex: 500mg, 1 cp"
                value={form.dose}
                onChange={(e) => setForm((f) => ({ ...f, dose: e.target.value }))}
              />
            </label>
            <label className="compact-field" style={{ flex: 1 }}>
              <span>frequência</span>
              <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as Frequency }))}>
                {FREQUENCIES.map((freq) => <option key={freq.value} value={freq.value}>{freq.label}</option>)}
              </select>
            </label>
          </div>
          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>horário</span>
            <div className="chip-row">
              {TIMES.map((t) => (
                <button
                  key={t}
                  className={`chip ${form.times.includes(t) ? 'chip--active' : ''}`}
                  onClick={() => toggleFormTime(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <label className="suppl-food-toggle">
            <input
              type="checkbox"
              checked={form.with_food}
              onChange={(e) => setForm((f) => ({ ...f, with_food: e.target.checked }))}
            />
            tomar com alimento
          </label>
          <textarea
            className="field"
            rows={2}
            placeholder="observações (ex: prescrição Dr. Silva, motivo...)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => void saveSupplement()} disabled={saving || !form.name.trim()}>
              {saving ? 'salvando...' : 'salvar'}
            </button>
            <button className="btn btn--secondary" onClick={() => setAdding(false)}>cancelar</button>
          </div>
        </section>
      ) : (
        <button className="btn btn--secondary btn--full" onClick={() => setAdding(true)}>
          + adicionar suplemento ou medicamento
        </button>
      )}

      {!loading && supplements.length === 0 && !adding && (
        <div className="labs-empty">
          <Icon3DLarge kind="supplements" size={64} className="labs-empty-glyph" />
          <p>Nenhum suplemento cadastrado ainda. Adicione vitaminas, suplementos e medicamentos de uso contínuo.</p>
        </div>
      )}
    </div>
  );
}
