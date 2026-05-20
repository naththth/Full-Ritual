import { useEffect, useMemo, useState } from 'react';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_FREQUENCIES,
  PRODUCT_STEPS,
} from '../data/ritualContent';
import { regenerateSkincareRoutine } from '../lib/gemini';
import { useLocalState } from '../lib/useLocalState';
import { hasSupabase, supabase } from '../lib/supabase';
import { useApp } from '../store/useStore';
import type { Product, ProductCategory, ProductFrequency, ProductStep } from '../types';

type ProductDraft = Pick<Product, 'name' | 'brand' | 'category' | 'step' | 'frequency' | 'notes'>;

const emptyDraft: ProductDraft = {
  name: '',
  brand: '',
  category: 'limpeza',
  step: 'ambos',
  frequency: 'diaria',
  notes: '',
};

export function Products() {
  const userId = useApp((s) => s.userId);
  const showToast = useApp((s) => s.showToast);
  const [localProducts, setLocalProducts] = useLocalState<Product[]>('full-ritual-products', []);
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [routineNotes, setRoutineNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const source = hasSupabase ? products : localProducts;
  const ordered = useMemo(
    () => [...source].filter((product) => product.active).sort((a, b) => a.order_in_routine - b.order_in_routine),
    [source]
  );

  useEffect(() => {
    if (!hasSupabase || !userId) {
      setProducts([]);
      return;
    }

    supabase
      .from('products')
      .select('*')
      .eq('user_id', userId)
      .order('order_in_routine', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error);
        setProducts((data ?? []) as Product[]);
      });
  }, [userId]);

  const resetDraft = () => {
    setDraft(emptyDraft);
    setEditingId(null);
  };

  const saveProduct = async () => {
    if (!draft.name.trim()) return;
    setLoading(true);
    try {
      if (hasSupabase && userId) {
        const payload = {
          user_id: userId,
          name: draft.name.trim(),
          brand: draft.brand?.trim() || null,
          category: draft.category,
          step: draft.step,
          frequency: draft.frequency,
          notes: draft.notes?.trim() || null,
          active: true,
        };

        const query = editingId
          ? supabase.from('products').update(payload).eq('id', editingId).select('*').single()
          : supabase.from('products').insert(payload).select('*').single();
        const { data, error } = await query;
        if (error) throw error;
        setProducts((current) => {
          const next = current.filter((product) => product.id !== data.id);
          return [...next, data as Product];
        });
      } else {
        const product: Product = {
          id: editingId ?? crypto.randomUUID(),
          user_id: userId ?? 'local',
          name: draft.name.trim(),
          brand: draft.brand?.trim() || null,
          category: draft.category,
          step: draft.step,
          frequency: draft.frequency,
          order_in_routine: editingId
            ? localProducts.find((item) => item.id === editingId)?.order_in_routine ?? localProducts.length + 1
            : localProducts.length + 1,
          notes: draft.notes?.trim() || null,
          photo_url: null,
          active: true,
          created_at: new Date().toISOString(),
        };
        setLocalProducts((current) => [...current.filter((item) => item.id !== product.id), product]);
      }
      resetDraft();
      showToast('produto salvo.');
    } catch (error) {
      console.error(error);
      showToast('não foi possível salvar o produto.');
    } finally {
      setLoading(false);
    }
  };

  const editProduct = (product: Product) => {
    setEditingId(product.id);
    setDraft({
      name: product.name,
      brand: product.brand ?? '',
      category: product.category,
      step: product.step,
      frequency: product.frequency,
      notes: product.notes ?? '',
    });
  };

  const removeProduct = async (product: Product) => {
    if (hasSupabase) {
      const { error } = await supabase.from('products').update({ active: false }).eq('id', product.id);
      if (error) {
        showToast('não foi possível remover.');
        return;
      }
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, active: false } : item));
    } else {
      setLocalProducts((current) => current.map((item) => item.id === product.id ? { ...item, active: false } : item));
    }
  };

  const regenerate = async (timeOfDay: 'manha' | 'noite') => {
    setLoading(true);
    try {
      if (hasSupabase) {
        const data = await regenerateSkincareRoutine(timeOfDay);
        setRoutineNotes(data.ordered_products.map((item) => `${item.order}. ${item.name}: ${item.reason}`));
        showToast('rotina regenerada.');
      } else {
        const order: Record<ProductCategory, number> = {
          limpeza: 1,
          tonico: 2,
          esfoliante: 3,
          serum: 4,
          tratamento: 5,
          olhos: 6,
          hidratante: 7,
          mascara: 8,
          protetor_solar: 9,
          corpo: 10,
        };
        setLocalProducts((current) =>
          current
            .map((product) => ({ ...product, order_in_routine: order[product.category] ?? 99 }))
            .sort((a, b) => a.order_in_routine - b.order_in_routine)
        );
        setRoutineNotes(['Rotina local ordenada por categoria clínica.']);
      }
    } catch (error) {
      console.error(error);
      showToast('não foi possível regenerar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen stack-md">
      <header className="stack">
        <span className="eyebrow">produtos · skincare</span>
        <h1 className="t-display-lg">
          Prateleira que <em className="t-display-italic">vira rotina.</em>
        </h1>
        <p className="t-body muted">
          Cadastre produtos, ajuste frequência e regenere a ordem da manhã ou da noite.
        </p>
      </header>

      <section className="card stack">
        <span className="eyebrow">{editingId ? 'editar produto' : 'novo produto'}</span>
        <input className="field" placeholder="nome" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <input className="field" placeholder="marca" value={draft.brand ?? ''} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} />
        <div className="form-grid">
          <select className="field" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as ProductCategory })}>
            {PRODUCT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select className="field" value={draft.step} onChange={(event) => setDraft({ ...draft, step: event.target.value as ProductStep })}>
            {PRODUCT_STEPS.map((step) => <option key={step} value={step}>{step}</option>)}
          </select>
          <select className="field" value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value as ProductFrequency })}>
            {PRODUCT_FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}
          </select>
        </div>
        <textarea className="field" placeholder="observações" value={draft.notes ?? ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        <div className="inline-actions">
          <button className="btn btn--primary" onClick={saveProduct} disabled={loading || !draft.name.trim()}>
            {editingId ? 'atualizar' : 'adicionar'}
          </button>
          {editingId && <button className="btn btn--secondary" onClick={resetDraft}>cancelar</button>}
        </div>
      </section>

      <section className="card stack">
        <span className="eyebrow">regenerar rotina</span>
        <div className="inline-actions">
          <button className="btn btn--secondary" onClick={() => void regenerate('manha')} disabled={loading}>manhã</button>
          <button className="btn btn--secondary" onClick={() => void regenerate('noite')} disabled={loading}>noite</button>
        </div>
        {routineNotes.length > 0 && (
          <div className="stack">
            {routineNotes.map((note) => <p key={note} className="t-body-sm muted">{note}</p>)}
          </div>
        )}
      </section>

      <section className="stack">
        <span className="eyebrow">produtos ativos</span>
        {ordered.length === 0 && <p className="t-body muted">Cadastre o primeiro produto para montar a rotina.</p>}
        {ordered.map((product) => (
          <article key={product.id} className="card product-row">
            <div>
              <strong>{product.name}</strong>
              <small>{product.brand || 'sem marca'} · {product.category} · {product.step} · {product.frequency}</small>
              {product.notes && <p className="t-body-sm muted">{product.notes}</p>}
            </div>
            <div className="row">
              <button className="chip" onClick={() => editProduct(product)}>editar</button>
              <button className="chip" onClick={() => void removeProduct(product)}>remover</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
