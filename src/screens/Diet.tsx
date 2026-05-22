import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import CircleButton from '../components/CircleButton';
import { CyclePhaseBanner } from '../components/CyclePhaseBanner';
import { getDefaultMealVariant, MEALS } from '../data/ritualContent';
import { relativeDateLabel } from '../lib/dates';
import { uploadImageOrPreview } from '../lib/uploads';
import { useAutoSave } from '../lib/useAutoSave';
import { useLocalState } from '../lib/useLocalState';
import { hasSupabase, supabase } from '../lib/supabase';
import { scopedStorageKey } from '../lib/storage';
import { useApp } from '../store/useStore';
import type { MealType, WorkoutMealPeriod } from '../types';

// ─── tipos ───────────────────────────────────────────────────────────────────

interface Macros {
  kcal: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
}

interface ManualFood {
  id: string;
  meal_type: MealType | null;
  workout_period: WorkoutMealPeriod | null;
  title: string;
  brand: string;
  quantity_g: number;
  serving_g: number;
  macros_per_100g: Macros;
}

interface DietPlan {
  manualFoods: ManualFood[];
  pdfUrl: string | null;
  pdfName: string | null;
  notes: string;
  setupMode: 'existing_plan' | 'needs_ai_nutri' | null;
  nutriProfile: NutriProfile;
  nutriConfigured: boolean;
}

interface DietAiAddition {
  id: string;
  meal_type: MealType | null;
  title: string;
  note?: string | null;
  rationale?: string | null;
}

interface NutriProfile {
  objective: string;
  objectiveDetails: string;
  activityLevel: string;
  trainingRoutine: string;
  healthContext: string;
  medications: string;
  exams: string;
  pregnancyContext: string;
  mealRoutine: string;
  budget: string;
  cookingSkill: string;
  restrictions: string;
  preferences: string;
  dietHistory: string;
  appetiteAndEnergy: string;
}

interface MealState {
  variant: string;
  checks: Record<number, boolean>;
  photoUrl?: string;
}

interface DietState {
  water: number;
  meals: Record<string, MealState>;
}

// ─── constantes ──────────────────────────────────────────────────────────────

const WORKOUT_MEAL_TYPES: MealType[] = ['pre_treino', 'pos_treino', 'intra_treino'];

const MEAL_LABELS: Record<MealType, string> = {
  manha: 'Café da Manhã',
  almoco: 'Almoço',
  lanche: 'Lanche',
  jantar: 'Jantar',
  ceia: 'Ceia',
  pre_treino: 'Pré-treino',
  pos_treino: 'Pós-treino',
  intra_treino: 'Intra-treino',
};

const WORKOUT_PERIOD_LABELS: Record<WorkoutMealPeriod, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
};

const MEAL_ORDER: MealType[] = ['manha', 'almoco', 'lanche', 'jantar', 'ceia', 'pre_treino', 'pos_treino', 'intra_treino'];

const initialNutriProfile: NutriProfile = {
  objective: '', objectiveDetails: '', activityLevel: '', trainingRoutine: '',
  healthContext: '', medications: '', exams: '', pregnancyContext: '',
  mealRoutine: '', budget: '', cookingSkill: '', restrictions: '',
  preferences: '', dietHistory: '', appetiteAndEnergy: '',
};

const initialPlan: DietPlan = {
  manualFoods: [], pdfUrl: null, pdfName: null, notes: '',
  setupMode: null, nutriProfile: initialNutriProfile, nutriConfigured: false,
};

const initialDiet: DietState = { water: 0, meals: {} };

const emptyMacros: Macros = { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 };

const emptyDraft = (): Omit<ManualFood, 'id'> => ({
  meal_type: null,
  workout_period: null,
  title: '',
  brand: '',
  quantity_g: 100,
  serving_g: 100,
  macros_per_100g: { ...emptyMacros },
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function foodMacros(food: ManualFood): Macros {
  const ratio = food.quantity_g / 100;
  return {
    kcal: Math.round(food.macros_per_100g.kcal * ratio),
    protein_g: Math.round(food.macros_per_100g.protein_g * ratio * 10) / 10,
    carb_g: Math.round(food.macros_per_100g.carb_g * ratio * 10) / 10,
    fat_g: Math.round(food.macros_per_100g.fat_g * ratio * 10) / 10,
  };
}

function totalMacros(foods: ManualFood[]): Macros {
  return foods.reduce(
    (acc, food) => {
      const m = foodMacros(food);
      return {
        kcal: acc.kcal + m.kcal,
        protein_g: Math.round((acc.protein_g + m.protein_g) * 10) / 10,
        carb_g: Math.round((acc.carb_g + m.carb_g) * 10) / 10,
        fat_g: Math.round((acc.fat_g + m.fat_g) * 10) / 10,
      };
    },
    { ...emptyMacros },
  );
}

function normalizeNutriProfile(value: unknown): NutriProfile {
  if (!value || typeof value !== 'object') return initialNutriProfile;
  return { ...initialNutriProfile, ...(value as Partial<NutriProfile>) };
}

function normalizeFoods(raw: unknown): ManualFood[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: unknown) => {
    const f = item as Record<string, unknown>;
    return {
      id: String(f.id ?? crypto.randomUUID()),
      meal_type: (f.meal_type as MealType | null) ?? null,
      workout_period: (f.workout_period as WorkoutMealPeriod | null) ?? null,
      title: String(f.title ?? ''),
      brand: String(f.brand ?? ''),
      quantity_g: Number(f.quantity_g ?? 100),
      serving_g: Number(f.serving_g ?? 100),
      macros_per_100g: {
        kcal: Number((f.macros_per_100g as Record<string, unknown>)?.kcal ?? 0),
        protein_g: Number((f.macros_per_100g as Record<string, unknown>)?.protein_g ?? 0),
        carb_g: Number((f.macros_per_100g as Record<string, unknown>)?.carb_g ?? 0),
        fat_g: Number((f.macros_per_100g as Record<string, unknown>)?.fat_g ?? 0),
      },
    };
  });
}

// ─── Open Food Facts API ──────────────────────────────────────────────────────

interface FoodProduct {
  id: string;
  title: string;
  brand: string;
  serving_g: number;
  macros_per_100g: Macros;
}

// USDA FoodData Central — rápido, gratuito, excelente base de dados
async function searchFoods(query: string): Promise<FoodProduct[]> {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=8&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS)&api_key=DEMO_KEY`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('usda fail');
    const data = await res.json() as { foods?: unknown[] };
    const results = (data.foods ?? [])
      .map((f: unknown) => {
        const food = f as Record<string, unknown>;
        const nutrients = (food.foodNutrients ?? []) as { nutrientId: number; value: number }[];
        const get = (id: number) => nutrients.find((n) => n.nutrientId === id)?.value ?? 0;
        const kcal = get(1008);
        const protein = get(1003);
        const carb = get(1005);
        const fat = get(1004);
        if (!kcal) return null;
        return {
          id: String(food.fdcId ?? ''),
          title: String(food.description ?? ''),
          brand: String(food.brandOwner ?? food.brandName ?? ''),
          serving_g: Number(food.servingSize ?? 100),
          macros_per_100g: { kcal, protein_g: protein, carb_g: carb, fat_g: fat },
        } satisfies FoodProduct;
      })
      .filter((p): p is FoodProduct => p !== null);
    if (results.length > 0) return results;
  } catch { /* fallback para OFF */ }

  // fallback: Open Food Facts
  try {
    const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=6&fields=id,product_name,brands,nutriments,serving_quantity`;
    const res = await fetch(offUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json() as { products?: unknown[] };
    return (data.products ?? [])
      .map((p: unknown) => {
        const product = p as Record<string, unknown>;
        const n = (product.nutriments ?? {}) as Record<string, unknown>;
        const kcal = Number(n['energy-kcal_100g'] ?? 0);
        if (!product.product_name || !kcal) return null;
        return {
          id: String(product.id ?? product.code ?? ''),
          title: String(product.product_name ?? ''),
          brand: String(product.brands ?? ''),
          serving_g: Number(product.serving_quantity ?? 100),
          macros_per_100g: {
            kcal, protein_g: Number(n['proteins_100g'] ?? 0),
            carb_g: Number(n['carbohydrates_100g'] ?? 0),
            fat_g: Number(n['fat_100g'] ?? 0),
          },
        } satisfies FoodProduct;
      })
      .filter((p): p is FoodProduct => p !== null);
  } catch { return []; }
}

// ─── componente principal ────────────────────────────────────────────────────

const orderedMealVariants = (variants: Record<string, unknown>) => [
  'principal',
  ...Object.keys(variants).filter((v) => v !== 'principal'),
];

export function Diet() {
  const userId = useApp((s) => s.userId);
  const profile = useApp((s) => s.profile);
  const sexo = useApp((s) => s.sexo);
  const showToast = useApp((s) => s.showToast);
  const selectedDate = useApp((s) => s.selectedDate);

  const [diet, setDiet] = useLocalState<DietState>(
    scopedStorageKey(`full-ritual-diet-${selectedDate}`, userId),
    initialDiet,
  );
  const [storedDietPlan, setDietPlan] = useLocalState<DietPlan>(
    scopedStorageKey('full-ritual-diet-plan', userId),
    initialPlan,
  );
  const dietPlan: DietPlan = {
    ...initialPlan,
    ...storedDietPlan,
    manualFoods: normalizeFoods(storedDietPlan.manualFoods),
    nutriProfile: normalizeNutriProfile(storedDietPlan.nutriProfile),
    nutriConfigured: Boolean(storedDietPlan.nutriConfigured),
  };

  const [aiAdditions, setAiAdditions] = useState<DietAiAddition[]>([]);
  const [showFoodForm, setShowFoodForm] = useState(false);
  const [draft, setDraft] = useState<Omit<ManualFood, 'id'>>(emptyDraft());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dateLabel = relativeDateLabel(selectedDate);
  const target = profile?.goal_water_l ?? 2.5;
  const totals = totalMacros(dietPlan.manualFoods);

  // carregar diet_plans do Supabase
  useEffect(() => {
    if (!hasSupabase || !userId) return;
    let alive = true;
    void supabase
      .from('diet_plans')
      .select('manual_foods, pdf_url, pdf_name, notes, setup_mode, nutri_profile, nutri_configured')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive || error || !data) return;
        setDietPlan({
          manualFoods: normalizeFoods(data.manual_foods),
          pdfUrl: data.pdf_url ?? null,
          pdfName: data.pdf_name ?? null,
          notes: data.notes ?? '',
          setupMode: data.setup_mode ?? null,
          nutriProfile: normalizeNutriProfile(data.nutri_profile),
          nutriConfigured: Boolean(data.nutri_configured),
        });
      });
    return () => { alive = false; };
  }, [setDietPlan, userId]);

  // carregar ai_additions
  useEffect(() => {
    if (!hasSupabase || !userId) { setAiAdditions([]); return; }
    let alive = true;
    void supabase
      .from('diet_ai_additions')
      .select('id, meal_type, title, note, rationale')
      .eq('user_id', userId).eq('date', selectedDate).eq('dismissed', false)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return;
        setAiAdditions(error ? [] : (data ?? []) as DietAiAddition[]);
      });
    return () => { alive = false; };
  }, [selectedDate, userId]);

  // busca Open Food Facts com debounce
  const triggerSearch = useCallback((q: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => { // 280ms = rápido mas sem spam
      setSearching(true);
      const results = await searchFoods(q);
      setSearchResults(results);
      setSearching(false);
    }, 280);
  }, []);

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setDraft((d) => ({ ...d, title: q }));
    triggerSearch(q);
  };

  const selectProduct = (product: FoodProduct) => {
    setDraft((d) => ({
      ...d,
      title: product.title,
      brand: product.brand,
      serving_g: product.serving_g,
      quantity_g: product.serving_g,
      macros_per_100g: product.macros_per_100g,
    }));
    setSearchQuery(product.title);
    setSearchResults([]);
  };

  const setDraftField = <K extends keyof Omit<ManualFood, 'id'>>(
    key: K,
    value: Omit<ManualFood, 'id'>[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const setMacroField = (key: keyof Macros, value: string) => {
    setDraft((d) => ({
      ...d,
      macros_per_100g: { ...d.macros_per_100g, [key]: Number(value) || 0 },
    }));
  };

  const addFood = () => {
    if (!draft.title.trim()) { showToast('informe o alimento.'); return; }
    if (!draft.meal_type) { showToast('escolha a refeição.'); return; }
    setDietPlan((current) => ({
      ...current,
      manualFoods: [
        { id: crypto.randomUUID(), ...draft },
        ...current.manualFoods,
      ],
    }));
    setDraft(emptyDraft());
    setSearchQuery('');
    setSearchResults([]);
    setShowFoodForm(false);
    showToast('alimento adicionado.');
  };

  const removeFood = (id: string) => {
    setDietPlan((current) => ({
      ...current,
      manualFoods: current.manualFoods.filter((f) => f.id !== id),
    }));
  };

  const resetDietPlan = async () => {
    setDietPlan(initialPlan);
    if (!hasSupabase || !userId) return;
    const { error } = await supabase.from('diet_plans').delete().eq('user_id', userId);
    if (error) console.error(error);
    showToast('plano de dieta resetado.');
  };

  const setNutriField = <K extends keyof NutriProfile>(key: K, value: NutriProfile[K]) => {
    setDietPlan((current) => ({ ...current, nutriProfile: { ...current.nutriProfile, [key]: value } }));
  };

  const saveNutriProfile = () => {
    const p = dietPlan.nutriProfile;
    if (!p.objective || !p.activityLevel || !p.mealRoutine || !p.restrictions) {
      showToast('preencha objetivo, atividade, rotina alimentar e restrições.');
      return;
    }
    setDietPlan((current) => ({ ...current, setupMode: 'needs_ai_nutri', nutriConfigured: true }));
    showToast('IA Nutri configurado.');
  };

  const dismissAiAddition = async (id: string) => {
    setAiAdditions((current) => current.filter((a) => a.id !== id));
    if (!hasSupabase || !userId) return;
    const { error } = await supabase.from('diet_ai_additions').update({ dismissed: true }).eq('id', id).eq('user_id', userId);
    if (error) showToast('não consegui dispensar a sugestão.');
  };

  const updateMeal = (mealId: string, patch: Partial<MealState>) => {
    setDiet((current) => {
      const meal = current.meals[mealId] ?? { variant: getDefaultMealVariant(mealId, selectedDate), checks: {} };
      return { ...current, meals: { ...current.meals, [mealId]: { ...meal, ...patch } } };
    });
  };

  const toggleItem = (mealId: string, index: number) => {
    const current = diet.meals[mealId] ?? { variant: getDefaultMealVariant(mealId, selectedDate), checks: {} };
    updateMeal(mealId, { checks: { ...current.checks, [index]: !current.checks[index] } });
  };

  const markMeal = (mealId: string, total: number) => {
    updateMeal(mealId, { checks: Object.fromEntries(Array.from({ length: total }, (_, i) => [i, true])) });
  };

  const handleMealPhoto = async (mealId: string, file: File) => {
    try {
      const photoUrl = await uploadImageOrPreview({ bucket: 'meals', userId, file, prefix: `meal-${selectedDate}-${mealId}` });
      updateMeal(mealId, { photoUrl });
    } catch { showToast('não foi possível enviar a foto.'); }
  };

  const handleDietPdf = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('envie um PDF da dieta.'); return;
    }
    try {
      const pdfUrl = await uploadImageOrPreview({ bucket: 'diet', userId, file, prefix: 'diet-plan' });
      setDietPlan((current) => ({ ...current, pdfUrl, pdfName: file.name }));
      showToast('PDF da dieta salvo.');
    } catch { showToast('não foi possível enviar o PDF.'); }
  };

  useAutoSave(diet, async () => {
    if (!hasSupabase || !userId) return;
    try {
      for (const meal of MEALS) {
        const state = diet.meals[meal.id];
        if (!state) continue;
        const items = meal.variants[state.variant] ?? meal.variants.principal;
        const checked = items.filter((_, i) => state.checks[i]).map((item) => item.title);
        if (!checked.length && !state.photoUrl) continue;
        const { error } = await supabase.from('meal_logs').upsert({
          user_id: userId, date: selectedDate, meal_type: meal.mealType,
          ingredients: checked, photo_url: state.photoUrl ?? null,
          notes: `${meal.title} · ${state.variant}`,
        }, { onConflict: 'user_id,date,meal_type' });
        if (error) throw error;
      }
    } catch { showToast('não foi possível salvar a dieta.'); }
  });

  useAutoSave(dietPlan, async () => {
    if (!hasSupabase || !userId) return;
    try {
      const { error } = await supabase.from('diet_plans').upsert({
        user_id: userId, manual_foods: dietPlan.manualFoods,
        pdf_url: dietPlan.pdfUrl, pdf_name: dietPlan.pdfName,
        notes: dietPlan.notes || null, setup_mode: dietPlan.setupMode,
        nutri_profile: dietPlan.nutriProfile, nutri_configured: dietPlan.nutriConfigured,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
    } catch { showToast('não foi possível salvar o plano de dieta.'); }
  });

  const generalAiAdditions = aiAdditions.filter((a) => !a.meal_type);

  // agrupar foods por refeição
  const foodsByMeal = MEAL_ORDER.reduce<Record<string, ManualFood[]>>((acc, mt) => {
    acc[mt] = dietPlan.manualFoods.filter((f) => f.meal_type === mt);
    return acc;
  }, {});

  return (
    <div className="screen stack-md">
      <header className="stack">
        <span className="eyebrow">dieta · {dateLabel}</span>
        <h1 className="t-display-lg">Comer com <em className="t-display-italic">presença.</em></h1>
        <p className="t-body muted">Plano do dia com substituições, água e foto da refeição.</p>
      </header>

      <CyclePhaseBanner context="diet" date={selectedDate} />

      {/* ── configuração inicial ── */}
      {!dietPlan.setupMode && (
        <section className="card diet-plan-card stack">
          <span className="eyebrow">configuração inicial</span>
          <h2 className="t-title">Você já possui uma dieta?</h2>
          <div className="inline-actions">
            <button className="btn btn--primary" onClick={() => setDietPlan((c) => ({ ...c, setupMode: 'existing_plan' }))}>
              já possuo
            </button>
            <button className="btn btn--secondary" onClick={() => setDietPlan((c) => ({ ...c, setupMode: 'needs_ai_nutri' }))}>
              configurar IA Nutri
            </button>
          </div>
        </section>
      )}

      {dietPlan.setupMode && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn--secondary btn--sm" onClick={() => void resetDietPlan()}>
            resetar plano de dieta
          </button>
        </div>
      )}

      {/* ── formulário IA Nutri ── */}
      {dietPlan.setupMode === 'needs_ai_nutri' && !dietPlan.nutriConfigured && (
        <section className="card diet-plan-card stack">
          <div className="row-between">
            <span className="eyebrow">IA Nutri</span>
            <span className="t-body-sm muted">perfil nutricional</span>
          </div>
          <p className="t-body-sm muted">Preencha o essencial para a IA montar uma estratégia alimentar coerente com saúde, treino, rotina e restrições.</p>
          <div className="diet-nutri-grid">
            <select className="field" value={dietPlan.nutriProfile.objective} onChange={(e) => setNutriField('objective', e.target.value)}>
              <option value="">objetivo principal</option>
              <option value="saude_geral">saúde geral</option>
              <option value="energia">mais energia no dia a dia</option>
              <option value="performance">performance esportiva</option>
              <option value="composicao">composição corporal sustentável</option>
              <option value="longevidade">longevidade</option>
              <option value="condicao_especifica">condição específica</option>
            </select>
            <select className="field" value={dietPlan.nutriProfile.activityLevel} onChange={(e) => setNutriField('activityLevel', e.target.value)}>
              <option value="">nível de atividade</option>
              <option value="sedentario">sedentário</option>
              <option value="recreativo">ativo recreativo</option>
              <option value="treina_regular">treina regularmente</option>
              <option value="atleta">atleta / alto volume</option>
            </select>
            <select className="field" value={dietPlan.nutriProfile.budget} onChange={(e) => setNutriField('budget', e.target.value)}>
              <option value="">orçamento</option>
              <option value="baixo">baixo</option>
              <option value="medio">médio</option>
              <option value="alto">alto</option>
              <option value="flexivel">flexível</option>
            </select>
            <select className="field" value={dietPlan.nutriProfile.cookingSkill} onChange={(e) => setNutriField('cookingSkill', e.target.value)}>
              <option value="">cozinha</option>
              <option value="nao_cozinha">não cozinha</option>
              <option value="basico">básico</option>
              <option value="intermediario">intermediário</option>
              <option value="avancado">avançado</option>
            </select>
          </div>
          <NutriTextarea label="Detalhe o objetivo" value={dietPlan.nutriProfile.objectiveDetails} onChange={(v) => setNutriField('objectiveDetails', v)} placeholder="ex: melhorar energia à tarde, ganhar massa sem piorar digestão..." />
          <NutriTextarea label="Treino e volume semanal" value={dietPlan.nutriProfile.trainingRoutine} onChange={(v) => setNutriField('trainingRoutine', v)} placeholder="modalidade, dias, duração, intensidade..." />
          <NutriTextarea label="Contexto de saúde" value={dietPlan.nutriProfile.healthContext} onChange={(v) => setNutriField('healthContext', v)} placeholder="condições, sintomas, histórico clínico relevante..." />
          <div className="diet-nutri-grid">
            <NutriTextarea label="Medicamentos" value={dietPlan.nutriProfile.medications} onChange={(v) => setNutriField('medications', v)} placeholder="medicações ou suplementos atuais..." />
            <NutriTextarea label="Exames recentes" value={dietPlan.nutriProfile.exams} onChange={(v) => setNutriField('exams', v)} placeholder="ferritina, vitamina D, B12, glicemia..." />
          </div>
          {(sexo === 'feminino' || sexo === 'outro' || profile?.cycle_tracking) && (
            <NutriTextarea label="Ciclo, gestação ou amamentação" value={dietPlan.nutriProfile.pregnancyContext} onChange={(v) => setNutriField('pregnancyContext', v)} placeholder="fase do ciclo, irregularidades, gestação..." />
          )}
          <NutriTextarea label="Rotina alimentar praticável" value={dietPlan.nutriProfile.mealRoutine} onChange={(v) => setNutriField('mealRoutine', v)} placeholder="horários, número de refeições, refeições fora..." />
          <NutriTextarea label="Restrições e intolerâncias" value={dietPlan.nutriProfile.restrictions} onChange={(v) => setNutriField('restrictions', v)} placeholder="alergias, intolerâncias, vegetarianismo..." />
          <NutriTextarea label="Preferências e aversões" value={dietPlan.nutriProfile.preferences} onChange={(v) => setNutriField('preferences', v)} placeholder="alimentos que gosta, não gosta, praticidade..." />
          <div className="diet-nutri-grid">
            <NutriTextarea label="Histórico de dietas" value={dietPlan.nutriProfile.dietHistory} onChange={(v) => setNutriField('dietHistory', v)} placeholder="o que já tentou, o que funcionou..." />
            <NutriTextarea label="Fome, saciedade e energia" value={dietPlan.nutriProfile.appetiteAndEnergy} onChange={(v) => setNutriField('appetiteAndEnergy', v)} placeholder="fome à noite, compulsão, energia baixa..." />
          </div>
          <button className="btn btn--primary" onClick={saveNutriProfile}>salvar perfil do IA Nutri</button>
        </section>
      )}

      {dietPlan.setupMode === 'needs_ai_nutri' && dietPlan.nutriConfigured && (
        <section className="diet-ai-card stack">
          <div className="row-between">
            <span className="eyebrow">IA Nutri configurado</span>
            <button className="btn btn--secondary btn--sm" onClick={() => setDietPlan((c) => ({ ...c, nutriConfigured: false }))}>
              editar formulário
            </button>
          </div>
          <p className="t-body-sm muted">O chat na dimensão Dieta usa seu perfil nutricional para orientar estratégia alimentar com racional técnico.</p>
        </section>
      )}

      {/* ── painel de totais ── */}
      {dietPlan.setupMode && dietPlan.manualFoods.length > 0 && (
        <section className="diet-totals-card">
          <span className="eyebrow">totais do plano</span>
          <div className="diet-totals-grid">
            <MacroChip label="kcal" value={String(totals.kcal)} highlight />
            <MacroChip label="prot" value={`${totals.protein_g}g`} />
            <MacroChip label="carbo" value={`${totals.carb_g}g`} />
            <MacroChip label="gord" value={`${totals.fat_g}g`} />
          </div>
        </section>
      )}

      {/* ── plano alimentar manual ── */}
      {(dietPlan.setupMode !== 'needs_ai_nutri' || dietPlan.nutriConfigured) && (
        <section className="card diet-plan-card stack">
          <div className="row-between">
            <span className="eyebrow">{dietPlan.setupMode === 'existing_plan' ? 'sua dieta atual' : 'plano alimentar'}</span>
            <button className="btn btn--primary btn--sm" onClick={() => setShowFoodForm((v) => !v)}>
              {showFoodForm ? 'cancelar' : '+ alimento'}
            </button>
          </div>

          <textarea
            className="field"
            rows={2}
            placeholder="observações gerais, horários, orientação do nutri..."
            value={dietPlan.notes}
            onChange={(e) => setDietPlan((c) => ({ ...c, notes: e.target.value }))}
          />

          {/* ── formulário de alimento ── */}
          {showFoodForm && (
            <div className="diet-food-form stack">
              <span className="eyebrow" style={{ color: 'var(--diet)' }}>novo alimento</span>

              {/* busca */}
              <div className="diet-search-wrap">
                <input
                  className="field"
                  placeholder="buscar alimento (ex: banana, peito de frango...)"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  autoComplete="off"
                />
                {searching && <span className="diet-search-loading">buscando...</span>}
                {searchResults.length > 0 && (
                  <ul className="diet-search-results">
                    {searchResults.map((p) => (
                      <li key={p.id}>
                        <button className="diet-search-item" onClick={() => selectProduct(p)}>
                          <span className="diet-search-item__name">{p.title}</span>
                          {p.brand && <span className="diet-search-item__brand">{p.brand}</span>}
                          <span className="diet-search-item__kcal">{Math.round(p.macros_per_100g.kcal * p.serving_g / 100)} kcal / {p.serving_g}g</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* refeição */}
              <div className="diet-food-row">
                <select
                  className="field"
                  value={draft.meal_type ?? ''}
                  onChange={(e) => setDraftField('meal_type', e.target.value ? e.target.value as MealType : null)}
                >
                  <option value="">refeição</option>
                  {MEAL_ORDER.map((mt) => (
                    <option key={mt} value={mt}>{MEAL_LABELS[mt]}</option>
                  ))}
                </select>

                {draft.meal_type && WORKOUT_MEAL_TYPES.includes(draft.meal_type) && (
                  <select
                    className="field"
                    value={draft.workout_period ?? ''}
                    onChange={(e) => setDraftField('workout_period', e.target.value ? e.target.value as WorkoutMealPeriod : null)}
                  >
                    <option value="">período</option>
                    {(Object.keys(WORKOUT_PERIOD_LABELS) as WorkoutMealPeriod[]).map((p) => (
                      <option key={p} value={p}>{WORKOUT_PERIOD_LABELS[p]}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* quantidade e porção */}
              <div className="diet-food-row">
                <label className="diet-field-label">
                  <span>quantidade (g ou ml)</span>
                  <input
                    className="field"
                    type="number"
                    min={1}
                    value={draft.quantity_g}
                    onChange={(e) => setDraftField('quantity_g', Number(e.target.value) || 0)}
                  />
                </label>
                <label className="diet-field-label">
                  <span>porção de referência (g)</span>
                  <input
                    className="field"
                    type="number"
                    min={1}
                    value={draft.serving_g}
                    onChange={(e) => setDraftField('serving_g', Number(e.target.value) || 0)}
                  />
                </label>
              </div>

              {/* macros por 100g */}
              <span className="t-body-sm muted">macros por 100g (preenchidos automaticamente pela busca)</span>
              <div className="diet-macros-row">
                <label className="diet-field-label">
                  <span>kcal</span>
                  <input className="field" type="number" min={0} value={draft.macros_per_100g.kcal} onChange={(e) => setMacroField('kcal', e.target.value)} />
                </label>
                <label className="diet-field-label">
                  <span>prot (g)</span>
                  <input className="field" type="number" min={0} step={0.1} value={draft.macros_per_100g.protein_g} onChange={(e) => setMacroField('protein_g', e.target.value)} />
                </label>
                <label className="diet-field-label">
                  <span>carbo (g)</span>
                  <input className="field" type="number" min={0} step={0.1} value={draft.macros_per_100g.carb_g} onChange={(e) => setMacroField('carb_g', e.target.value)} />
                </label>
                <label className="diet-field-label">
                  <span>gord (g)</span>
                  <input className="field" type="number" min={0} step={0.1} value={draft.macros_per_100g.fat_g} onChange={(e) => setMacroField('fat_g', e.target.value)} />
                </label>
              </div>

              {/* preview dos macros calculados — sempre visível */}
              {(() => {
                const m = foodMacros({ ...draft, id: '' });
                return (
                  <div className="diet-macro-preview">
                    <span><strong>{m.kcal}</strong> kcal</span>
                    <span><strong>{m.protein_g}g</strong> prot</span>
                    <span><strong>{m.carb_g}g</strong> carbo</span>
                    <span><strong>{m.fat_g}g</strong> gord</span>
                    <span className="diet-macro-preview__qty">em {draft.quantity_g}g</span>
                  </div>
                );
              })()}

              <div className="inline-actions">
                <button className="btn btn--primary" onClick={addFood}>adicionar ao plano</button>
                <label className="file-button file-button--quiet">
                  enviar PDF
                  <input type="file" accept="application/pdf,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleDietPdf(f); }} />
                </label>
              </div>
            </div>
          )}

          {dietPlan.pdfUrl && (
            <a className="diet-pdf-link" href={dietPlan.pdfUrl} target="_blank" rel="noreferrer">
              {dietPlan.pdfName ?? 'PDF da dieta'}
            </a>
          )}

          {/* ── lista de alimentos agrupada por refeição ── */}
          {MEAL_ORDER.map((mt) => {
            const foods = foodsByMeal[mt] ?? [];
            if (!foods.length) return null;
            const mealTotal = totalMacros(foods);
            return (
              <div key={mt} className="diet-meal-group">
                <div className="diet-meal-group__header">
                  <span className="eyebrow">{MEAL_LABELS[mt]}</span>
                  <span className="diet-meal-group__total">{mealTotal.kcal} kcal</span>
                </div>
                {foods.map((food) => {
                  const m = foodMacros(food);
                  return (
                    <article key={food.id} className="diet-food-item">
                      <div className="diet-food-item__info">
                        <strong>{food.title}</strong>
                        {food.brand && <small>{food.brand}</small>}
                        <span className="diet-food-item__qty">{food.quantity_g}g</span>
                      </div>
                      <div className="diet-food-item__macros">
                        <span className="diet-food-item__kcal">{m.kcal} kcal</span>
                        <span>{m.protein_g}g P</span>
                        <span>{m.carb_g}g C</span>
                        <span>{m.fat_g}g G</span>
                      </div>
                      <CircleButton variant="close" ariaLabel="Remover alimento" onClick={() => removeFood(food.id)} />
                    </article>
                  );
                })}
              </div>
            );
          })}
        </section>
      )}

      {generalAiAdditions.length > 0 && (
        <section className="diet-ai-card stack">
          <span className="eyebrow">sugestões da IA coach</span>
          {generalAiAdditions.map((a) => (
            <AiAdditionRow key={a.id} addition={a} onDismiss={dismissAiAddition} />
          ))}
        </section>
      )}

      {/* ── água ── */}
      <section className="card diet-water-card stack" style={{ '--dim': 'var(--diet)' } as CSSProperties}>
        <span className="eyebrow">água e recuperação</span>
        <div className="t-display-md">
          {(diet.water * 0.5).toFixed(1).replace('.', ',')}L de {String(target).replace('.', ',')}L
        </div>
        <div className="water-grid">
          {Array.from({ length: Math.round(target / 0.5) }, (_, i) => (
            <button
              key={i}
              className={`btn btn--sm ${diet.water > i ? 'btn--light' : 'btn--outline-light'}`}
              onClick={() => setDiet((c) => ({ ...c, water: i + 1 }))}
            >
              {((i + 1) * 0.5).toFixed(1).replace('.', ',')}L
            </button>
          ))}
        </div>
      </section>

      {/* ── panels de refeições do ritual ── */}
      {dietPlan.setupMode && MEALS.map((meal) => {
        const recommendedVariant = getDefaultMealVariant(meal.id, selectedDate);
        const state = diet.meals[meal.id] ?? { variant: recommendedVariant, checks: {} };
        const items = meal.variants[state.variant] ?? meal.variants.principal;
        const done = items.filter((_, i) => state.checks[i]).length;
        const mealAiAdditions = aiAdditions.filter((a) => a.meal_type === meal.mealType);

        return (
          <details
            key={meal.id}
            className="dimension-panel dimension-panel--diet card stack meal-panel"
            style={{ '--panel-dim': 'var(--diet)' } as CSSProperties}
          >
            <summary>
              <span>
                <span className="eyebrow">{meal.title}</span>
                <strong>{done ? `${done} escolhidos` : meal.time}</strong>
              </span>
              <button
                className="panel-toggle"
                onClick={(e) => {
                  e.preventDefault();
                  const details = (e.currentTarget as HTMLElement).closest('details') as HTMLDetailsElement | null;
                  if (details) details.open = !details.open;
                }}
                aria-label={'Abrir/fechar ' + meal.title}
              >
                <CircleButton ariaLabel={'Alternar ' + meal.title} color="var(--diet)" />
              </button>
            </summary>
            <div className="dimension-panel-body">
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h2 className="meal-title">{meal.title}</h2>
                  <div className="t-body-sm muted">{meal.time}</div>
                </div>
                <span className="meal-pill">{Math.round((done / items.length) * 100) || 0}%</span>
              </div>
              <div className="chip-row">
                {orderedMealVariants(meal.variants).map((variant) => (
                  <button
                    key={variant}
                    className={`chip ${state.variant === variant ? 'chip--active' : ''}`}
                    onClick={() => updateMeal(meal.id, { variant, checks: {} })}
                  >
                    {variant === 'principal' ? 'principal' : variant === recommendedVariant ? 'sugestão' : variant.replace('sub', 'sub ')}
                  </button>
                ))}
              </div>
              <div className="task-list">
                {items.map((item, index) => (
                  <button
                    key={`${item.title}-${index}`}
                    className={`task-row ${state.checks[index] ? 'task-row--done' : ''}`}
                    onClick={() => toggleItem(meal.id, index)}
                  >
                    <span className="task-check">{state.checks[index] ? '✓' : ''}</span>
                    <span>
                      <strong>{item.title}</strong>
                      {item.note && <small>{item.note}</small>}
                    </span>
                  </button>
                ))}
              </div>
              {mealAiAdditions.length > 0 && (
                <div className="meal-ai-additions">
                  {mealAiAdditions.map((a) => (
                    <AiAdditionRow key={a.id} addition={a} onDismiss={dismissAiAddition} />
                  ))}
                </div>
              )}
              <div className="inline-actions">
                <label className="file-button">
                  foto da refeição
                  <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleMealPhoto(meal.id, f); }} />
                </label>
                <button className="btn btn--secondary btn--sm" onClick={() => markMeal(meal.id, items.length)}>marcar tudo</button>
              </div>
              {state.photoUrl && <img className="photo-preview" src={state.photoUrl} alt={`Foto de ${meal.title}`} />}
            </div>
          </details>
        );
      })}
    </div>
  );
}

// ─── subcomponentes ───────────────────────────────────────────────────────────

function MacroChip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`diet-macro-chip${highlight ? ' diet-macro-chip--highlight' : ''}`}>
      <span className="diet-macro-chip__value">{value}</span>
      <span className="diet-macro-chip__label">{label}</span>
    </div>
  );
}

function NutriTextarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="diet-nutri-field">
      <span>{label}</span>
      <textarea className="field" rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function AiAdditionRow({ addition, onDismiss }: { addition: DietAiAddition; onDismiss: (id: string) => void }) {
  return (
    <article className="diet-ai-item">
      <span className="diet-ai-item__mark">IA</span>
      <span>
        <strong>{addition.title}</strong>
        {(addition.note || addition.rationale) && <small>{addition.note || addition.rationale}</small>}
      </span>
      <div>
        <CircleButton variant="close" ariaLabel="Dispensar sugestão" onClick={() => void onDismiss(addition.id)} />
      </div>
    </article>
  );
}
