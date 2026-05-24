import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_FREQUENCIES,
  PRODUCT_STEPS,
  type RoutineArea,
} from '../data/ritualContent';
import { regenerateSkincareRoutine } from '../lib/gemini';
import { readJson, writeJson, scopedStorageKey } from '../lib/storage';
import { uploadImageOrPreview } from '../lib/uploads';
import { loadProducts, saveProduct as persistProduct, updateProduct } from '../lib/productsService';
import { hasSupabase } from '../lib/supabase';
import { useApp } from '../store/useStore';
import type { Product, ProductCategory, ProductFrequency, ProductStep } from '../types';

type ProductDraft = Pick<Product, 'name' | 'brand' | 'category' | 'step' | 'frequency' | 'notes' | 'photo_url'>;
type ProductRoutineArea = RoutineArea;
type ProductListItem = Product & { routineArea: ProductRoutineArea };
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
  const productsKey = scopedStorageKey('full-ritual-products', userId ?? '');
  const [products, setProducts] = useState<Product[]>(() => readJson(productsKey, []));
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [draftMeta, setDraftMeta] = useState<ProductMeta>({ routineArea: 'face' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<ProductListItem | null>(null);
  const [routineNotes, setRoutineNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const source = products;
  const ordered = useMemo(
    () => [...source].filter((product) => product.active).sort((a, b) => a.order_in_routine - b.order_in_routine),
    [source]
  );
  const routineHintDate = selectedDate;
  const activeProducts = useMemo(() => {
    return ordered.map((product) => ({
      ...product,
      routineArea: inferRoutineArea(product),
    }));
  }, [ordered]);

  useEffect(() => {
    if (!hasSupabase || !userId) return;
    loadProducts(userId)
      .then((data) => {
        setProducts(data);
        writeJson(productsKey, data);
      })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const payload = {
        name: draft.name.trim(),
        brand: draft.brand?.trim() || null,
        category: draft.category,
        step: draft.step,
        frequency: draft.frequency,
        notes: serializeProductNotes(draft.notes, draftMeta),
        photo_url: draft.photo_url,
        active: true,
      };

      if (hasSupabase && userId) {
        const saved = editingId
          ? await updateProduct(userId, editingId, payload)
          : await persistProduct(userId, { ...payload, order_in_routine: source.length + 1 });
        setProducts((current) => {
          const next = [...current.filter((p) => p.id !== saved.id), saved];
          writeJson(productsKey, next);
          return next;
        });
      } else {
        const product: Product = {
          id: editingId ?? crypto.randomUUID(),
          user_id: userId ?? 'local',
          ...payload,
          order_in_routine: editingId
            ? currentProduct?.order_in_routine ?? source.length + 1
            : source.length + 1,
          photo_url: draft.photo_url ?? currentProduct?.photo_url ?? null,
          created_at: currentProduct?.created_at ?? new Date().toISOString(),
        };
        setProducts((current) => {
          const next = [...current.filter((p) => p.id !== product.id), product];
          writeJson(productsKey, next);
          return next;
        });
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
    setEditingSource({ ...product, routineArea });
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
    editProduct(product);
  };

  const removeProduct = async (product: Product) => {
    try {
      if (hasSupabase && userId) {
        await updateProduct(userId, product.id, { active: false });
      }
      setProducts((current) => {
        const next = current.map((item) => item.id === product.id ? { ...item, active: false } : item);
        writeJson(productsKey, next);
        return next;
      });
    } catch {
      showToast('não foi possível remover.');
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
          limpeza: 1, tonico: 2, esfoliante: 3, serum: 4, tratamento: 5,
          olhos: 6, hidratante: 7, mascara: 8, protetor_solar: 9, corpo: 10,
        };
        setProducts((current) => {
          const next = current
            .map((product) => ({ ...product, order_in_routine: order[product.category] ?? 99 }))
            .sort((a, b) => a.order_in_routine - b.order_in_routine);
          writeJson(productsKey, next);
          return next;
        });
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
        <header className="stack">
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
      <header className="stack">
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
            {routineNotes.map((note) => <p key={`${routineHintDate}-${note}`} className="t-body-sm muted">{note}</p>)}
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
              <button className="chip" onClick={() => void removeProduct(product)}>remover</button>
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
