import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import { useApp } from '../store/useStore';
import { hasSupabase, supabase } from '../lib/supabase';
import {
  loadSkinProfile,
  saveSkinProfile,
  loadSkinProducts,
  saveSkinProduct,
  deleteSkinProduct,
  type SkinProfilePayload,
} from '../lib/skinProfileService';
import {
  loadLatestSkinRoutine,
  toggleRoutineItemCheck,
  generateSkinRoutine,
} from '../lib/skinRoutineService';
import type { SkinProfile, SkinProduct, SkinRoutine, SkinRoutineItem, SkinArea } from '../types';

// ─── tipos ────────────────────────────────────────────────────────────────────

type SkinScreen =
  | 'loading'
  | 'questionnaire'
  | 'products'
  | 'generate'
  | 'routine'
  | 'error';

// ─── constantes ───────────────────────────────────────────────────────────────

const SKIN_TYPES = [
  { value: 'oleosa', label: 'Oleosa' },
  { value: 'seca', label: 'Seca' },
  { value: 'mista', label: 'Mista' },
  { value: 'sensivel', label: 'Sensível' },
  { value: 'acneica', label: 'Acneica' },
  { value: 'rosacea', label: 'Rosácea' },
  { value: 'manchas', label: 'Com manchas' },
  { value: 'madura', label: 'Madura' },
  { value: 'normal', label: 'Normal' },
];

const GOALS = [
  { value: 'controlar_oleosidade', label: 'Controlar oleosidade' },
  { value: 'reduzir_acne', label: 'Reduzir acne' },
  { value: 'reduzir_vermelhidao', label: 'Reduzir vermelhidão' },
  { value: 'cuidar_rosacea', label: 'Cuidar da rosácea' },
  { value: 'fortalecer_barreira', label: 'Fortalecer barreira cutânea' },
  { value: 'hidratar', label: 'Hidratar' },
  { value: 'reduzir_manchas', label: 'Reduzir manchas' },
  { value: 'melhorar_textura', label: 'Melhorar textura' },
  { value: 'prevenir_sinais', label: 'Prevenir sinais de idade' },
  { value: 'simplificar_rotina', label: 'Simplificar rotina' },
  { value: 'criar_ritual', label: 'Criar ritual de autocuidado' },
  { value: 'cuidado_corporal', label: 'Melhorar cuidado corporal' },
  { value: 'organizar_produtos', label: 'Organizar produtos que já tenho' },
];

const AREA_LABELS: Record<SkinArea, string> = {
  face: 'Rosto',
  body: 'Corpo',
  aromas: 'Aromas',
};

const AREA_ORDER: SkinArea[] = ['face', 'body', 'aromas'];

// ─── helpers ──────────────────────────────────────────────────────────────────

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

function groupItems(
  items: SkinRoutineItem[],
  period: 'day' | 'night',
): Record<SkinArea, SkinRoutineItem[]> {
  const result: Record<SkinArea, SkinRoutineItem[]> = { face: [], body: [], aromas: [] };
  items
    .filter((i) => i.period === period)
    .sort((a, b) => a.order_index - b.order_index)
    .forEach((i) => {
      if (i.area in result) result[i.area as SkinArea].push(i);
    });
  return result;
}

// ─── componentes internos ─────────────────────────────────────────────────────

function RoutineItemCard({
  item,
  onToggle,
}: {
  item: SkinRoutineItem;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <button
      className={`task-row ${item.is_checked ? 'task-row--done' : ''}`}
      onClick={() => onToggle(item.id, !item.is_checked)}
    >
      <span className="task-check">{item.is_checked ? '✓' : ''}</span>
      <span>
        <strong>{item.product_name}</strong>
        {item.brand && <small>{item.brand}</small>}
        {item.category && <em>{item.category}</em>}
        {item.instructions && <p className="t-body-sm muted" style={{ marginTop: 4 }}>{item.instructions}</p>}
        {item.frequency && <p className="t-body-sm" style={{ marginTop: 2, opacity: 0.7 }}>{item.frequency}</p>}
        {item.safety_note && (
          <p className="t-body-sm" style={{ marginTop: 4, color: 'var(--tomato, #c0392b)' }}>
            {item.safety_note}
          </p>
        )}
        {item.is_prescription && (
          <span className="chip chip--active" style={{ marginTop: 6, fontSize: 11 }}>
            prescrito
          </span>
        )}
      </span>
    </button>
  );
}

function RoutineSection({
  area,
  items,
  onToggle,
}: {
  area: SkinArea;
  items: SkinRoutineItem[];
  period?: 'day' | 'night';
  onToggle: (id: string, checked: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const done = items.filter((i) => i.is_checked).length;

  if (items.length === 0) return null;

  return (
    <details
      className="dimension-panel dimension-panel--skin card stack routine-accordion"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      style={{ '--panel-dim': 'var(--skin)' } as CSSProperties}
    >
      <summary>
        <span>
          <span className="eyebrow">{AREA_LABELS[area]}</span>
          <strong>{done}/{items.length}</strong>
        </span>
      </summary>
      {open && (
        <div className="dimension-panel-body stack">
          <div className="task-list">
            {items.map((item) => (
              <RoutineItemCard key={item.id} item={item} onToggle={onToggle} />
            ))}
          </div>
        </div>
      )}
    </details>
  );
}

// ─── tela principal ───────────────────────────────────────────────────────────

export function Skin() {
  const userId = useApp((s) => s.userId);
  const showToast = useApp((s) => s.showToast);

  const [view, setView] = useState<SkinScreen>('loading');
  const [, setProfile] = useState<SkinProfile | null>(null);
  const [products, setProducts] = useState<SkinProduct[]>([]);
  const [routine, setRoutine] = useState<SkinRoutine | null>(null);
  const [period, setPeriod] = useState<'day' | 'night'>('day');
  const [generating, setGenerating] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  // questionnaire state
  const [skinTypes, setSkinTypes] = useState<string[]>([]);
  const [sensitivity, setSensitivity] = useState('');
  const [allergies, setAllergies] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [morningTime, setMorningTime] = useState('');
  const [nightTime, setNightTime] = useState('');
  const [routinePreference, setRoutinePreference] = useState('');
  const [budget, setBudget] = useState('');
  const [usesActives, setUsesActives] = useState(false);
  const [usesPrescription, setUsesPrescription] = useState(false);
  const [dermatologyFollowup, setDermatologyFollowup] = useState('');
  const [pregnancyStatus, setPregnancyStatus] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // product form state
  const [newProductName, setNewProductName] = useState('');
  const [newProductBrand, setNewProductBrand] = useState('');
  const [newProductArea, setNewProductArea] = useState<SkinArea | ''>('');
  const [newProductCategory, setNewProductCategory] = useState('');
  const [newProductPrescription, setNewProductPrescription] = useState(false);
  const [newProductIrritation, setNewProductIrritation] = useState(false);
  const [noProducts, setNoProducts] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !hasSupabase) {
      setView('questionnaire');
      return;
    }
    try {
      const [p, r] = await Promise.all([
        loadSkinProfile(userId),
        loadLatestSkinRoutine(userId),
      ]);
      setProfile(p);
      setRoutine(r);

      if (!p) {
        setView('questionnaire');
      } else if (r) {
        setView('routine');
      } else {
        const prods = await loadSkinProducts(userId);
        setProducts(prods);
        setView('generate');
      }
    } catch {
      setView('error');
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  // ─── salvar questionário ────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    if (!userId) return;
    setSavingProfile(true);
    try {
      const payload: SkinProfilePayload = {
        skin_types: skinTypes,
        sensitivity: sensitivity || null,
        allergies: allergies || null,
        goals,
        morning_time: morningTime || null,
        night_time: nightTime || null,
        routine_preference: routinePreference || null,
        budget: budget || null,
        uses_actives: usesActives,
        uses_prescription: usesPrescription,
        dermatology_followup: dermatologyFollowup || null,
        pregnancy_lactation_status: pregnancyStatus || null,
      };
      await saveSkinProfile(userId, payload);
      const p = await loadSkinProfile(userId);
      setProfile(p);
      const prods = await loadSkinProducts(userId);
      setProducts(prods);
      setView('generate');
    } catch {
      showToast('Não foi possível salvar o perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  // ─── adicionar produto ──────────────────────────────────────────────────────

  const handleAddProduct = async () => {
    if (!userId || !newProductName.trim()) return;
    setAddingProduct(true);
    try {
      await saveSkinProduct(userId, {
        name: newProductName.trim(),
        brand: newProductBrand.trim() || null,
        category: newProductCategory.trim() || null,
        area: newProductArea || null,
        is_prescription: newProductPrescription,
        causes_irritation: newProductIrritation,
      });
      const prods = await loadSkinProducts(userId);
      setProducts(prods);
      setNewProductName('');
      setNewProductBrand('');
      setNewProductArea('');
      setNewProductCategory('');
      setNewProductPrescription(false);
      setNewProductIrritation(false);
      setShowProductForm(false);
    } catch {
      showToast('Não foi possível adicionar o produto.');
    } finally {
      setAddingProduct(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!userId) return;
    try {
      await deleteSkinProduct(userId, id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      showToast('Não foi possível remover o produto.');
    }
  };

  // ─── gerar rotina ───────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!userId) return;
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('sem sessão');
      const result = await generateSkinRoutine(userId, session.access_token);
      setRoutine(result.routine);
      setWarnings(result.warnings ?? []);
      setView('routine');
    } catch (err) {
      showToast('Não consegui gerar sua rotina agora. Seus dados foram preservados. Tente novamente em instantes.');
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  // ─── toggle check ───────────────────────────────────────────────────────────

  const handleToggleCheck = async (itemId: string, checked: boolean) => {
    if (!userId) return;
    setRoutine((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        skin_routine_items: prev.skin_routine_items.map((i) =>
          i.id === itemId ? { ...i, is_checked: checked } : i,
        ),
      };
    });
    try {
      await toggleRoutineItemCheck(userId, itemId, checked);
    } catch {
      setRoutine((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          skin_routine_items: prev.skin_routine_items.map((i) =>
            i.id === itemId ? { ...i, is_checked: !checked } : i,
          ),
        };
      });
      showToast('Não foi possível salvar.');
    }
  };

  // ─── render: loading ────────────────────────────────────────────────────────

  if (view === 'loading') {
    return (
      <div className="screen stack-md">
        <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
          <p className="muted">Carregando sua rotina de pele…</p>
        </div>
      </div>
    );
  }

  // ─── render: error ──────────────────────────────────────────────────────────

  if (view === 'error') {
    return (
      <div className="screen stack-md">
        <div className="card stack" style={{ padding: 24 }}>
          <h2>Algo deu errado</h2>
          <p className="t-body-sm muted">Não conseguimos carregar seus dados. Tente novamente.</p>
          <button className="btn btn--primary btn--full" onClick={() => { setView('loading'); void load(); }}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // ─── render: questionário ────────────────────────────────────────────────────

  if (view === 'questionnaire') {
    return (
      <div className="screen stack-md">
        <header className="ritual-hero ritual-hero--day">
          <div className="row-between">
            <span className="eyebrow">pele · configuração inicial</span>
          </div>
          <h1 className="t-display-lg">Como é a sua pele?</h1>
          <p>Essas informações ajudam a montar uma rotina segura e personalizada.</p>
        </header>

        <section className="card stack" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16 }}>Tipo de pele</h2>
          <p className="t-body-sm muted">Pode selecionar mais de um.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SKIN_TYPES.map(({ value, label }) => (
              <button
                key={value}
                className={`chip ${skinTypes.includes(value) ? 'chip--active' : ''}`}
                onClick={() => setSkinTypes((prev) => toggle(prev, value))}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="card stack" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16 }}>Sensibilidade</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['baixa', 'moderada', 'alta', 'não sei'].map((v) => (
              <button
                key={v}
                className={`chip ${sensitivity === v ? 'chip--active' : ''}`}
                onClick={() => setSensitivity(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </section>

        <section className="card stack" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16 }}>Objetivos principais</h2>
          <p className="t-body-sm muted">Pode selecionar mais de um.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {GOALS.map(({ value, label }) => (
              <button
                key={value}
                className={`chip ${goals.includes(value) ? 'chip--active' : ''}`}
                onClick={() => setGoals((prev) => toggle(prev, value))}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="card stack" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16 }}>Alergias conhecidas</h2>
          <textarea
            className="field"
            rows={2}
            placeholder="ex: fragrância, lanolina, latex… ou deixe em branco se não tiver"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
          />
        </section>

        <section className="card stack" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16 }}>Tempo disponível para cuidados</h2>
          <div>
            <p className="t-body-sm" style={{ marginBottom: 8 }}>Manhã</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['3min', '5min', '10min', '+10min'].map((v) => (
                <button
                  key={v}
                  className={`chip ${morningTime === v ? 'chip--active' : ''}`}
                  onClick={() => setMorningTime(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="t-body-sm" style={{ marginBottom: 8 }}>Noite</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['3min', '5min', '10min', '+10min'].map((v) => (
                <button
                  key={v}
                  className={`chip ${nightTime === v ? 'chip--active' : ''}`}
                  onClick={() => setNightTime(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card stack" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16 }}>Preferência de rotina</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['minimalista', 'equilibrada', 'completa', 'deixa a IA decidir'].map((v) => (
              <button
                key={v}
                className={`chip ${routinePreference === v ? 'chip--active' : ''}`}
                onClick={() => setRoutinePreference(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </section>

        <section className="card stack" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16 }}>Faixa de preço</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['acessível', 'intermediária', 'premium', 'misto', 'sem preferência'].map((v) => (
              <button
                key={v}
                className={`chip ${budget === v ? 'chip--active' : ''}`}
                onClick={() => setBudget(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </section>

        <section className="card stack" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16 }}>Uso de ativos, retinoides ou prescrição</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['Usa ativos', usesActives, () => setUsesActives(!usesActives)], ['Usa prescrição', usesPrescription, () => setUsesPrescription(!usesPrescription)]].map(
              ([label, active, handler]) => (
                <button
                  key={label as string}
                  className={`chip ${active ? 'chip--active' : ''}`}
                  onClick={handler as () => void}
                >
                  {label as string}
                </button>
              ),
            )}
          </div>
        </section>

        <section className="card stack" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16 }}>Acompanhamento dermatológico</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['sim, atualmente', 'já fiz antes', 'nunca fiz', 'prefiro não informar'].map((v) => (
              <button
                key={v}
                className={`chip ${dermatologyFollowup === v ? 'chip--active' : ''}`}
                onClick={() => setDermatologyFollowup(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </section>

        <section className="card stack" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16 }}>Gestação, lactação ou tentativa de engravidar</h2>
          <p className="t-body-sm muted">
            Alguns ativos exigem cuidado extra. Você pode informar apenas se fizer sentido para você.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['não se aplica', 'gestante', 'lactante', 'tentando engravidar', 'prefiro não informar'].map((v) => (
              <button
                key={v}
                className={`chip ${pregnancyStatus === v ? 'chip--active' : ''}`}
                onClick={() => setPregnancyStatus(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </section>

        <div style={{ padding: '0 16px 32px' }}>
          <button
            className="btn btn--primary btn--full"
            onClick={handleSaveProfile}
            disabled={savingProfile || skinTypes.length === 0}
          >
            {savingProfile ? 'Salvando…' : 'Salvar perfil de pele'}
          </button>
        </div>
      </div>
    );
  }

  // ─── render: gerar rotina ───────────────────────────────────────────────────

  if (view === 'generate') {
    return (
      <div className="screen stack-md">
        <header className="ritual-hero ritual-hero--day">
          <div className="row-between">
            <span className="eyebrow">pele · rotina</span>
            <button
              className="chip chip--active"
              style={{ fontSize: 12 }}
              onClick={() => setView('questionnaire')}
            >
              editar perfil
            </button>
          </div>
          <h1 className="t-display-lg">Pronta para montar sua rotina.</h1>
          <p>A IA CARE vai organizar uma rotina segura baseada nos seus dados.</p>
        </header>

        {/* Produtos */}
        <section className="card stack" style={{ padding: 24 }}>
          <div className="row-between">
            <h2 style={{ fontSize: 16 }}>Meus produtos</h2>
            <button className="chip" onClick={() => setShowProductForm(!showProductForm)}>
              {showProductForm ? 'cancelar' : '+ produto'}
            </button>
          </div>

          {products.length === 0 && !noProducts && (
            <p className="t-body-sm muted">
              Nenhum produto cadastrado ainda.
            </p>
          )}

          {products.map((p) => (
            <div key={p.id} className="row-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <span>
                <strong style={{ fontSize: 14 }}>{p.name}</strong>
                {p.brand && <small style={{ display: 'block', color: 'var(--muted)' }}>{p.brand}</small>}
                {p.area && <em style={{ display: 'block', fontSize: 11 }}>{AREA_LABELS[p.area as SkinArea] ?? p.area}</em>}
                {p.causes_irritation && <span style={{ fontSize: 11, color: 'var(--tomato, #c0392b)' }}> · causa irritação</span>}
                {p.is_prescription && <span style={{ fontSize: 11, color: 'var(--body)' }}> · prescrito</span>}
              </span>
              <button
                className="chip"
                style={{ fontSize: 12 }}
                onClick={() => void handleDeleteProduct(p.id)}
              >
                remover
              </button>
            </div>
          ))}

          {showProductForm && (
            <div className="stack" style={{ marginTop: 16, padding: 16, background: 'var(--ivory-2)', borderRadius: 12 }}>
              <input
                className="field"
                placeholder="Nome do produto *"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
              />
              <input
                className="field"
                placeholder="Marca"
                value={newProductBrand}
                onChange={(e) => setNewProductBrand(e.target.value)}
              />
              <input
                className="field"
                placeholder="Categoria (ex: hidratante, sérum)"
                value={newProductCategory}
                onChange={(e) => setNewProductCategory(e.target.value)}
              />
              <div>
                <p className="t-body-sm" style={{ marginBottom: 6 }}>Área de uso</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['face', 'body', 'aromas'] as SkinArea[]).map((a) => (
                    <button
                      key={a}
                      className={`chip ${newProductArea === a ? 'chip--active' : ''}`}
                      onClick={() => setNewProductArea(a)}
                    >
                      {AREA_LABELS[a]}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className={`chip ${newProductPrescription ? 'chip--active' : ''}`}
                  onClick={() => setNewProductPrescription(!newProductPrescription)}
                >
                  prescrito
                </button>
                <button
                  className={`chip ${newProductIrritation ? 'chip--active' : ''}`}
                  onClick={() => setNewProductIrritation(!newProductIrritation)}
                >
                  causa irritação
                </button>
              </div>
              <button
                className="btn btn--primary btn--full"
                onClick={handleAddProduct}
                disabled={addingProduct || !newProductName.trim()}
              >
                {addingProduct ? 'Adicionando…' : 'Adicionar produto'}
              </button>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={noProducts}
              onChange={(e) => setNoProducts(e.target.checked)}
            />
            <span className="t-body-sm">Não tenho produtos, quero recomendações</span>
          </label>
        </section>

        <div style={{ padding: '0 16px 32px' }}>
          <button
            className="btn btn--primary btn--full"
            onClick={handleGenerate}
            disabled={generating}
            style={{ minHeight: 56, fontSize: 16 }}
          >
            {generating ? 'Gerando sua rotina…' : 'Gerar minha rotina com IA CARE'}
          </button>
          {generating && (
            <p className="t-body-sm muted" style={{ textAlign: 'center', marginTop: 12 }}>
              A IA CARE está analisando seu perfil de pele…
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── render: rotina ─────────────────────────────────────────────────────────

  if (view === 'routine' && routine) {
    const grouped = groupItems(routine.skin_routine_items, period);
    const totalItems = routine.skin_routine_items.filter((i) => i.period === period).length;
    const doneItems = routine.skin_routine_items.filter((i) => i.period === period && i.is_checked).length;

    return (
      <div className="screen stack-md ritual-screen">
        <header className={`ritual-hero ritual-hero--${period}`}>
          <div className="row-between">
            <span className="eyebrow">pele · aromas · IA CARE</span>
            <span className="ritual-score">{doneItems}/{totalItems}</span>
          </div>
          <h1 className="t-display-lg">
            {period === 'day' ? 'Rotina da manhã.' : 'Rotina da noite.'}
          </h1>
          <p>
            {period === 'day'
              ? 'Rosto, corpo e aromas para começar bem o dia.'
              : 'Cuidado externo para encerrar o dia com presença.'}
          </p>
          <div className="segmented segmented--light">
            <button
              className={period === 'day' ? 'segmented--active' : ''}
              onClick={() => setPeriod('day')}
            >
              dia
            </button>
            <button
              className={period === 'night' ? 'segmented--active' : ''}
              onClick={() => setPeriod('night')}
            >
              noite
            </button>
          </div>
        </header>

        {/* Avisos de segurança */}
        {warnings.length > 0 && (
          <div
            className="card"
            style={{
              padding: 16,
              background: 'var(--ivory-2)',
              borderLeft: '3px solid var(--skin)',
            }}
          >
            <p className="eyebrow" style={{ marginBottom: 6 }}>Avisos da IA CARE</p>
            {warnings.map((w, i) => (
              <p key={i} className="t-body-sm" style={{ marginBottom: 4 }}>{w}</p>
            ))}
          </div>
        )}

        {/* Seções: Rosto, Corpo, Aromas */}
        {AREA_ORDER.map((area) => (
          <RoutineSection
            key={`${period}-${area}`}
            area={area}
            items={grouped[area]}
            period={period}
            onToggle={handleToggleCheck}
          />
        ))}

        {totalItems === 0 && (
          <div className="card" style={{ padding: 24, textAlign: 'center' }}>
            <p className="muted">Nenhum item na rotina do {period === 'day' ? 'dia' : 'noite'}.</p>
          </div>
        )}

        {/* Ações */}
        <div style={{ padding: '8px 16px 32px', display: 'flex', gap: 10, flexDirection: 'column' }}>
          <button
            className="btn btn--secondary btn--full"
            onClick={() => {
              setRoutine(null);
              setView('generate');
            }}
          >
            Gerar nova rotina
          </button>
          <button
            className="btn btn--ghost btn--full"
            onClick={() => setView('questionnaire')}
            style={{ fontSize: 13 }}
          >
            Editar perfil de pele
          </button>
        </div>
      </div>
    );
  }

  // fallback
  return null;
}
