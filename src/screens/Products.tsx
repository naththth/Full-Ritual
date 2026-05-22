import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { BackButton } from '../components/BackButton';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_FREQUENCIES,
  PRODUCT_STEPS,
  ROUTINES,
  getRoutineTasks,
  type RoutineArea,
  type RoutinePeriod,
  type RoutineTask,
} from '../data/ritualContent';
import { regenerateSkincareRoutine } from '../lib/gemini';
import { uploadImageOrPreview } from '../lib/uploads';
import { useLocalState } from '../lib/useLocalState';
import { hasSupabase, supabase } from '../lib/supabase';
import { useApp } from '../store/useStore';
import type { Product, ProductCategory, ProductFrequency, ProductStep } from '../types';

type ProductDraft = Pick<Product, 'name' | 'brand' | 'category' | 'step' | 'frequency' | 'notes' | 'photo_url'>;
type SavedProductListItem = Product & { source: 'saved' };
type RoutineProductListItem = Pick<Product, 'id' | 'name' | 'brand' | 'category' | 'step' | 'frequency' | 'notes' | 'photo_url'> & { source: 'routine' };
type ProductRoutineArea = RoutineArea;
type ProductListItem = (SavedProductListItem | RoutineProductListItem) & { routineArea: ProductRoutineArea };
type ProductMeta = { routineArea: ProductRoutineArea };

const emptyDraft: ProductDraft = {
  name: '',
  brand: '',
  category: 'limpeza',
  step: 'ambos',
  frequency: 'diaria',
  notes: '',
  photo_url: null,
};

export function Products() {
  const userId = useApp((s) => s.userId);
  const selectedDate = useApp((s) => s.selectedDate);
  const showToast = useApp((s) => s.showToast);
  const [localProducts, setLocalProducts] = useLocalState<Product[]>('full-ritual-products', []);
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [draftMeta, setDraftMeta] = useState<ProductMeta>({ routineArea: 'face' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<ProductListItem | null>(null);
  const [routineNotes, setRoutineNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const source = hasSupabase ? products : localProducts;
  const ordered = useMemo(
    () => [...source].filter((product) => product.active).sort((a, b) => a.order_in_routine - b.order_in_routine),
    [source]
  );
  const routineProducts = useMemo(() => buildRoutineProducts(selectedDate), [selectedDate]);
  const activeProducts = useMemo(() => {
    const savedItems: ProductListItem[] = ordered.map((product) => ({
      ...product,
      source: 'saved',
      routineArea: inferRoutineArea(product),
    }));
    const savedKeys = new Set(savedItems.map((product) => normalizeProductKey(product.name)));
    return [
      ...savedItems,
      ...routineProducts.filter((product) => !savedKeys.has(normalizeProductKey(product.name))),
    ];
  }, [ordered, routineProducts]);

  useEffect(() => {
    if (!hasSupabase || !userId) {
      setProducts([]);
      return;
    }

    void supabase
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
    setDraftMeta({ routineArea: 'face' });
    setEditingId(null);
    setEditingSource(null);
  };

  const handleProductPhoto = async (file: File) => {
    try {
      const photoUrl = await uploadImageOrPreview({
        bucket: 'products',
        userId,
        file,
        prefix: editingId ? `product-${editingId}` : 'product-draft',
      });
      setDraft((current) => ({ ...current, photo_url: photoUrl }));
      showToast('foto do produto guardada.');
    } catch (error) {
      console.error(error);
      showToast('não foi possível enviar a foto.');
    }
  };

  const saveProduct = async () => {
    if (!draft.name.trim()) return;
    setLoading(true);
    try {
      const currentProduct = source.find((item) => item.id === editingId);
      if (hasSupabase && userId) {
        const payload = {
          user_id: userId,
          name: draft.name.trim(),
          brand: draft.brand?.trim() || null,
          category: draft.category,
          step: draft.step,
          frequency: draft.frequency,
          notes: serializeProductNotes(draft.notes, draftMeta),
          photo_url: draft.photo_url,
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
            ? currentProduct?.order_in_routine ?? localProducts.length + 1
            : localProducts.length + 1,
          notes: serializeProductNotes(draft.notes, draftMeta),
          photo_url: draft.photo_url ?? currentProduct?.photo_url ?? null,
          active: true,
          created_at: currentProduct?.created_at ?? new Date().toISOString(),
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
    const routineArea = inferRoutineArea(product);
    setEditingId(product.id);
    setEditingSource({ ...product, source: 'saved', routineArea });
    setDraft({
      name: product.name,
      brand: product.brand ?? '',
      category: product.category,
      step: product.step,
      frequency: product.frequency,
      notes: stripProductMeta(product.notes),
      photo_url: product.photo_url ?? getDefaultProductPhotoUrl(product.name),
    });
    setDraftMeta({ routineArea });
  };

  const editListItem = (product: ProductListItem) => {
    if (product.source === 'saved') {
      editProduct(product);
      return;
    }

    setEditingId(null);
    setEditingSource(product);
    setDraft({
      name: product.name,
      brand: product.brand ?? '',
      category: product.category,
      step: product.step,
      frequency: product.frequency,
      notes: stripProductMeta(product.notes),
      photo_url: product.photo_url ?? getDefaultProductPhotoUrl(product.name),
    });
    setDraftMeta({ routineArea: product.routineArea });
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

  if (editingSource) {
    return (
      <div className="screen stack-md">
        <header className="screen-header stack">
          <BackButton onClick={resetDraft} />
          <span className="eyebrow">produto · editar</span>
          <h1 className="t-display-lg">
            Ajustar <em className="t-display-italic">produto.</em>
          </h1>
          <p className="t-body muted">
            Edite nome, marca, descrição e imagem. Ao salvar, ele volta para a prateleira.
          </p>
        </header>

        {renderProductForm({
          draft,
          draftMeta,
          loading,
          setDraft,
          setDraftMeta,
          handleProductPhoto,
          saveProduct,
          resetDraft,
          isEditing: true,
        })}
      </div>
    );
  }

  return (
    <div className="screen stack-md">
      <header className="screen-header stack">
        <BackButton />
        <span className="eyebrow">produtos · skincare</span>
        <h1 className="t-display-lg">
          Prateleira que <em className="t-display-italic">vira rotina.</em>
        </h1>
        <p className="t-body muted">
          Cadastre produtos, ajuste frequência e regenere a ordem da manhã ou da noite.
        </p>
      </header>

      {renderProductForm({
        draft,
        draftMeta,
        loading,
        setDraft,
        setDraftMeta,
        handleProductPhoto,
        saveProduct,
        resetDraft,
        isEditing: false,
      })}

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
        {activeProducts.map((product) => (
          <article key={product.id} className="card product-row">
            <div className="product-row-main">
              <div className="product-thumb">
                {product.photo_url || getDefaultProductPhotoUrl(product.name) ? (
                  <img src={product.photo_url ?? getDefaultProductPhotoUrl(product.name) ?? ''} alt={`Foto de ${product.name}`} />
                ) : (
                  <span>{getProductInitials(product)}</span>
                )}
              </div>
              <div>
                <strong>{product.name}</strong>
                <small>{product.brand || 'sem marca'} · {product.category} · {product.step} · {product.frequency}</small>
                <span className={`product-area product-area--${product.routineArea}`}>{areaLabel(product.routineArea)}</span>
                {stripProductMeta(product.notes) && <p className="t-body-sm muted">{stripProductMeta(product.notes)}</p>}
              </div>
            </div>
            <div className="row">
              <button className="chip" onClick={() => editListItem(product)}>editar</button>
              {product.source === 'saved' && <button className="chip" onClick={() => void removeProduct(product)}>remover</button>}
              {product.source === 'routine' && <span className="product-source">na rotina de pele</span>}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function renderProductForm({
  draft,
  draftMeta,
  loading,
  setDraft,
  setDraftMeta,
  handleProductPhoto,
  saveProduct,
  resetDraft,
  isEditing,
}: {
  draft: ProductDraft;
  draftMeta: ProductMeta;
  loading: boolean;
  setDraft: Dispatch<SetStateAction<ProductDraft>>;
  setDraftMeta: Dispatch<SetStateAction<ProductMeta>>;
  handleProductPhoto: (file: File) => Promise<void>;
  saveProduct: () => Promise<void>;
  resetDraft: () => void;
  isEditing: boolean;
}) {
  return (
    <section className="card stack">
      <span className="eyebrow">{isEditing ? 'editar produto' : 'novo produto'}</span>
      <input className="field" placeholder="nome" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      <input className="field" placeholder="marca" value={draft.brand ?? ''} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} />
      <div className="product-photo-field">
        <div className="product-thumb product-thumb--draft">
          {draft.photo_url ? (
            <img src={draft.photo_url} alt={`Foto de ${draft.name || 'produto'}`} />
          ) : (
            <span>{getProductInitials(draft)}</span>
          )}
        </div>
        <label className="file-button file-button--quiet">
          trocar foto
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleProductPhoto(file);
            }}
          />
        </label>
      </div>
      <input
        className="field"
        placeholder="url da imagem"
        value={draft.photo_url ?? ''}
        onChange={(event) => setDraft({ ...draft, photo_url: event.target.value || null })}
      />
      <div className="form-grid">
        <select className="field" value={draftMeta.routineArea} onChange={(event) => setDraftMeta({ routineArea: event.target.value as ProductRoutineArea })}>
          {(['face', 'body', 'aromas'] as ProductRoutineArea[]).map((area) => <option key={area} value={area}>{areaLabel(area)}</option>)}
        </select>
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
      <textarea className="field" placeholder="descrição / observações" value={draft.notes ?? ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
      <div className="inline-actions">
        <button className="btn btn--primary" onClick={saveProduct} disabled={loading || !draft.name.trim()}>
          {isEditing ? 'salvar' : 'adicionar'}
        </button>
        {isEditing && <button className="btn btn--secondary" onClick={resetDraft}>cancelar</button>}
      </div>
    </section>
  );
}

function buildRoutineProducts(dateIso: string): ProductListItem[] {
  const entries: Array<{ period: RoutinePeriod; area: RoutineArea; task: RoutineTask; index: number }> = [];

  (['day', 'night'] as RoutinePeriod[]).forEach((period) => {
    (['face', 'body', 'aromas'] as RoutineArea[]).forEach((area) => {
      const tasks = area === 'face' ? getRoutineTasks(period, area, dateIso) : ROUTINES[period][area];
      tasks.forEach((task, index) => entries.push({ period, area, task, index }));
    });
  });

  const products = entries
    .map(({ period, area, task, index }) => routineTaskToProduct(task, area, period, index))
    .filter((product): product is ProductListItem => Boolean(product));
  const seen = new Set<string>();

  return products.filter((product) => {
    const key = normalizeProductKey(product.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function routineTaskToProduct(
  task: RoutineTask,
  area: RoutineArea,
  period: RoutinePeriod,
  index: number
): ProductListItem | null {
  const product = parseRoutineProduct(task.title);
  if (!product) return null;

  return {
    id: `routine-${period}-${area}-${index}-${normalizeProductKey(product.name)}`,
    name: product.name,
    brand: product.brand,
    category: routineAreaToCategory(area, task.tag),
    step: period === 'day' ? 'manha' : 'noite',
    frequency: task.description.toLowerCase().includes('duas a três') || task.description.toLowerCase().includes('segunda') ? 'semanal' : 'diaria',
    notes: task.tag,
    photo_url: getDefaultProductPhotoUrl(product.name),
    source: 'routine',
    routineArea: area,
  };
}

function parseRoutineProduct(title: string): Pick<ProductListItem, 'name' | 'brand'> | null {
  const clean = title.trim();
  const lower = clean.toLowerCase();

  if (lower.includes('playlist') || lower.includes('abrir janela') || lower.includes('frase de fechamento')) return null;

  if (
    lower.includes('manhã de barreira') ||
    lower.includes('noite de reparação') ||
    lower.includes('ativo da noite quando indicado') ||
    lower.includes('hidratação corporal de tratamento') ||
    lower.includes('frase de fechamento')
  ) return null;

  const known: Array<[string, string, string | null]> = [
    ['Bioderma Sensibio AR+ Cream', 'Sensibio AR+ Cream', 'Bioderma'],
    ['Bioderma Sensibio', 'Sensibio', 'Bioderma'],
    ['SkinCeuticals P-Tiox', 'P-Tiox', 'SkinCeuticals'],
    ['protetor solar Adcos', 'Protetor solar', 'Adcos'],
    ['sabonete líquido Verbena', 'Sabonete líquido Verbena', null],
    ['Ureadin', 'Ureadin', null],
    ['Pink Cheeks', 'Pink Cheeks', 'Pink Cheeks'],
    ['Água Refrescante Energia', 'Água Refrescante Energia', null],
    ['Difusor Alecrim & Capim Limão', 'Difusor Alecrim & Capim Limão', null],
    ['vela de Olíbano', 'Vela de Olíbano', null],
    ['Ylang Ylang ou Lavanda', 'Ylang Ylang ou Lavanda', null],
    ['Amande', 'Amande', null],
    ['Provence', 'Provence', null],
    ['Ácido salicílico', 'Ácido salicílico', null],
    ['Retrinal', 'Retrinal', null],
  ];

  const found = known.find(([needle]) => lower.includes(needle.toLowerCase()));
  if (found) return { name: found[1], brand: found[2] };

  return { name: clean.replace(/^(Lavar com|Aplicar|Finalizar com|Banho com|Acender|Vela de)\s+/i, ''), brand: null };
}

function routineAreaToCategory(area: RoutineArea, tag: string): ProductCategory {
  if (area === 'body' || area === 'aromas') return 'corpo';
  if (tag === 'limpeza') return 'limpeza';
  if (tag === 'ativo' || tag === 'renovação') return 'tratamento';
  if (tag === 'indispensável') return 'protetor_solar';
  return 'hidratante';
}

function areaLabel(area: RoutineArea) {
  const labels: Record<RoutineArea, string> = {
    face: 'rosto',
    body: 'corpo',
    aromas: 'aromas',
  };
  return labels[area];
}

function serializeProductNotes(notes: string | null | undefined, meta: ProductMeta) {
  const cleanNotes = stripProductMeta(notes);
  const prefix = `[rotina:${meta.routineArea}]`;
  return cleanNotes ? `${prefix} ${cleanNotes}` : prefix;
}

function stripProductMeta(notes: string | null | undefined) {
  return (notes ?? '').replace(/^\[rotina:(face|body|aromas)\]\s*/i, '');
}

function inferRoutineArea(product: Pick<Product, 'category' | 'notes'>): ProductRoutineArea {
  const match = product.notes?.match(/^\[rotina:(face|body|aromas)\]/i);
  if (match?.[1]) return match[1] as ProductRoutineArea;
  if (product.category === 'corpo') return 'body';
  return 'face';
}

function normalizeProductKey(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getDefaultProductPhotoUrl(name: string) {
  const key = normalizeProductKey(name);
  const images: Record<string, string> = {
    sensibio: 'https://back-ac-prod.bioderma.com/media/catalog/product/cache/b443460c314aa18d2c50e93a48ddeb50/e/0/e0959c7d2924fc45cc600c7debfb1f1b-_7b171692_7d__7bbio_sensibio_h2o_7d__7b28709a_7d_1.png',
    'sensibio-ar-cream': 'https://back-ac-prod.bioderma.com/media/catalog/product/cache/b443460c314aa18d2c50e93a48ddeb50/8/2/826469160d9282b26d2b28a0b81b06cd-_7b158731_7d__7bbio_sensibio_ar_plus_cream_7d__7b28688b_7d.png',
    'p-tiox': 'https://www.skinceuticals.com.br/dw/image/v2/AAFM_PRD/on/demandware.static/-/Sites-skinceuticals-master-catalog/default/dw5fa40f7e/Products/SKBR7908785408000/7908785408000_1.jpg?q=70&sfrm=jpg&sh=430&sm=cut&sw=430',
    ureadin: 'https://www.isdin.com/sites/default/files/productos/imagenes/ureadin_rx_20_cream_piel_muy_seca.jpg?v=1434439570',
  };

  return images[key] ?? null;
}

function getProductInitials(product: Pick<Product, 'name' | 'brand'>) {
  const source = product.brand || product.name;
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'PR';
}
