import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import CircleButton from '../components/CircleButton';
import { CyclePhaseBanner } from '../components/CyclePhaseBanner';
import { relativeDateLabel } from '../lib/dates';
import { uploadImageOrPreview } from '../lib/uploads';
import { hasSupabase, supabase } from '../lib/supabase';
import { scopedStorageKey, readJson, writeJson } from '../lib/storage';
import {
  loadDietProfile, saveDietProfile, loadActiveDietDocument,
  saveDietDocument, archiveDietDocument, getSignedDietUrl,
  loadDietMeals, saveDietMeal, deleteDietMeal, updateMealTotals,
  loadDietFoods, saveDietFood, deleteDietFood,
  loadWaterDaily, saveWaterDaily,
  loadLatestNutritionAiLog,
  type DietProfileRow, type DietDocumentRow, type DietMealRow, type DietFoodRow,
} from '../lib/dietService';
import {
  calcMealTotals, calcDayTotals, calcDayStatus,
  waterProgressPct, addWaterMl, estimateNutritionTargets,
  type DayStatus,
  type NutritionTargets,
} from '../lib/dietCalculations';
import { useApp } from '../store/useStore';
import type { MealType } from '../types';

// ── Tipos locais ─────────────────────────────────────────────────────────────

type DietPath = 'ia_nutri' | 'dietbox' | 'manual';

interface NutriFormState extends DietProfileRow {
  _dirty?: boolean;
}

interface FoodDraft {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  notes: string;
}

interface SearchProduct {
  id: string;
  title: string;
  brand: string;
  serving_g: number;
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
}

const emptyFoodDraft = (): FoodDraft => ({
  name: '', quantity: 100, unit: 'g',
  calories: 0, protein: 0, carbs: 0, fat: 0, notes: '',
});

const emptyProfile = (): DietProfileRow => ({
  goal: '', objective_details: '', activity_level: '', work_routine: '',
  desired_meals_count: undefined, hunger_level: '',
  training_routine: '', training_frequency: '', training_schedule: '',
  training_duration_min: undefined, training_intensity: '',
  fasted_training: false, sports_goal: '',
  liked_foods: '', avoided_foods: '', current_water_ml: undefined, supplements: '',
  dietary_restrictions: '', intolerances: '', allergies: '',
  digestive_symptoms: '', injuries: '', medications: '', relevant_exams: '',
  pregnancy_context: '', professional_calories: undefined,
  professional_protein_g: undefined, professional_carbs_g: undefined,
  professional_fat_g: undefined, professional_notes: '',
  diet_history: '', appetite_and_energy: '', budget: '', cooking_skill: '',
  available_meal_times: '',
});

const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  sem_dados: 'sem registros',
  planejado: 'planejado',
  em_andamento: 'em andamento',
  concluido: 'concluído',
  parcial: 'parcial',
  abaixo_da_meta: 'abaixo da meta',
  acima_da_meta: 'acima da meta',
};

const TRAINING_FREQUENCY_OPTIONS = [
  { value: 'nao_treino', label: 'não treino hoje' },
  { value: '1_2_semana', label: '1-2x/semana' },
  { value: '3_4_semana', label: '3-4x/semana' },
  { value: '5_6_semana', label: '5-6x/semana' },
  { value: 'alto_volume', label: 'alto volume' },
];

const TRAINING_SCHEDULE_OPTIONS = [
  { value: 'manha', label: 'manhã' },
  { value: 'tarde', label: 'tarde' },
  { value: 'noite', label: 'noite' },
  { value: 'variavel', label: 'varia' },
];

const TRAINING_DURATION_OPTIONS = [
  { value: 30, label: 'até 30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
  { value: 90, label: '90+ min' },
];

const TRAINING_INTENSITY_OPTIONS: { value: NonNullable<DietProfileRow['training_intensity']>; label: string }[] = [
  { value: 'leve', label: 'leve' },
  { value: 'moderada', label: 'moderada' },
  { value: 'intensa', label: 'intensa' },
  { value: 'variavel', label: 'varia' },
];

// ── USDA food search ──────────────────────────────────────────────────────────

async function searchFoods(query: string): Promise<SearchProduct[]> {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=8&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS)&api_key=DEMO_KEY`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('usda fail');
    const data = await res.json() as { foods?: unknown[] };
    const results = (data.foods ?? []).map((f: unknown) => {
      const food = f as Record<string, unknown>;
      const nutrients = (food.foodNutrients ?? []) as { nutrientId: number; value: number }[];
      const get = (id: number) => nutrients.find((n) => n.nutrientId === id)?.value ?? 0;
      const kcal = get(1008);
      if (!kcal) return null;
      return {
        id: String(food.fdcId ?? ''),
        title: String(food.description ?? ''),
        brand: String(food.brandOwner ?? food.brandName ?? ''),
        serving_g: Number(food.servingSize ?? 100),
        kcal_per_100g: kcal, protein_per_100g: get(1003),
        carbs_per_100g: get(1005), fat_per_100g: get(1004),
      } satisfies SearchProduct;
    }).filter((p): p is SearchProduct => p !== null);
    if (results.length > 0) return results;
  } catch { /* fallback */ }

  try {
    const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=6&fields=id,product_name,brands,nutriments,serving_quantity`;
    const res = await fetch(offUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json() as { products?: unknown[] };
    return (data.products ?? []).map((p: unknown) => {
      const product = p as Record<string, unknown>;
      const n = (product.nutriments ?? {}) as Record<string, unknown>;
      const kcal = Number(n['energy-kcal_100g'] ?? 0);
      if (!product.product_name || !kcal) return null;
      return {
        id: String(product.id ?? product.code ?? ''),
        title: String(product.product_name ?? ''),
        brand: String(product.brands ?? ''),
        serving_g: Number(product.serving_quantity ?? 100),
        kcal_per_100g: kcal, protein_per_100g: Number(n['proteins_100g'] ?? 0),
        carbs_per_100g: Number(n['carbohydrates_100g'] ?? 0), fat_per_100g: Number(n['fat_100g'] ?? 0),
      } satisfies SearchProduct;
    }).filter((p): p is SearchProduct => p !== null);
  } catch { return []; }
}

// ── Componente principal ──────────────────────────────────────────────────────

export function Diet() {
  const userId = useApp((s) => s.userId);
  const profile = useApp((s) => s.profile);
  const showToast = useApp((s) => s.showToast);
  const selectedDate = useApp((s) => s.selectedDate);
  const goTo = useApp((s) => s.goTo);

  // ── Estado da dimensão ────────────────────────────────────────────────────

  const [activePath, setActivePath] = useState<DietPath | null>(null);
  const [loading, setLoading] = useState(true);

  // Perfil nutricional (IA NUTRI)
  const [nutriProfile, setNutriProfile] = useState<NutriFormState>(emptyProfile());
  const [nutriSaved, setNutriSaved] = useState(false);
  const [nutriStep, setNutriStep] = useState<'form' | 'confirm' | 'result'>('form');
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // DietBox PDF
  const [pdfDoc, setPdfDoc] = useState<DietDocumentRow | null>(null);
  const [pdfSignedUrl, setPdfSignedUrl] = useState<string | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);

  // Dieta manual
  const [meals, setMeals] = useState<DietMealRow[]>([]);
  const [foodsByMeal, setFoodsByMeal] = useState<Record<string, DietFoodRow[]>>({});
  const [addingMealName, setAddingMealName] = useState('');
  const [editingFoodMealId, setEditingFoodMealId] = useState<string | null>(null);
  const [foodDraft, setFoodDraft] = useState<FoodDraft>(emptyFoodDraft());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Água
  const nutriStorageKey = scopedStorageKey('diet-nutri-profile', userId ?? '');
  const waterStorageKey = scopedStorageKey(`diet-water-${selectedDate}`, userId ?? '');
  const [consumedMl, setConsumedMl] = useState(0);
  const [targetMl, setTargetMl] = useState(() => Math.round((profile?.goal_water_l ?? 2.5) * 1000));

  // ── Carregamento inicial ──────────────────────────────────────────────────

  useEffect(() => {
    if (!hasSupabase || !userId) {
      const cachedProfile = readJson<DietProfileRow | null>(nutriStorageKey, null);
      if (cachedProfile) {
        setNutriProfile({ ...emptyProfile(), ...cachedProfile });
        setNutriSaved(true);
        setActivePath('ia_nutri');
        setNutriStep('confirm');
      }
      const cached = readJson(waterStorageKey, 0) as number;
      setConsumedMl(cached);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);

    void (async () => {
      try {
        const [dietProfileData, docData, mealsData, waterData, latestLog] = await Promise.all([
          loadDietProfile(userId),
          loadActiveDietDocument(userId),
          loadDietMeals(userId),
          loadWaterDaily(userId, selectedDate),
          loadLatestNutritionAiLog(userId),
        ]);

        if (!alive) return;

        if (dietProfileData) {
          setNutriProfile({ ...emptyProfile(), ...dietProfileData });
          setNutriSaved(true);
        }
        if (docData) {
          setPdfDoc(docData);
          const signed = await getSignedDietUrl(docData.file_path);
          if (alive) setPdfSignedUrl(signed);
        }
        if (mealsData.length > 0) {
          setMeals(mealsData);
          const foodsMap: Record<string, DietFoodRow[]> = {};
          await Promise.all(mealsData.map(async (m) => {
            const foods = await loadDietFoods(userId, m.id);
            foodsMap[m.id] = foods;
          }));
          if (alive) setFoodsByMeal(foodsMap);
        }
        if (waterData) {
          setConsumedMl(waterData.consumed_ml);
          setTargetMl(waterData.target_ml);
        } else {
          const cached = readJson(waterStorageKey, 0) as number;
          if (alive) setConsumedMl(cached);
        }
        if (latestLog) {
          setAiResult(latestLog.response);
          setNutriStep('result');
        }

        // Determina caminho ativo
        if (alive) {
          if (docData) setActivePath('dietbox');
          else if (mealsData.length > 0) setActivePath('manual');
          else if (dietProfileData && latestLog) setActivePath('ia_nutri');
          else if (dietProfileData) { setActivePath('ia_nutri'); setNutriStep('confirm'); }
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedDate]);

  const dateLabel = relativeDateLabel(selectedDate);
  const hasMeals = meals.length > 0;
  const hasFoods = Object.values(foodsByMeal).some((f) => f.length > 0);
  const dayTotals = calcDayTotals(meals);
  const nutritionTargets = estimateNutritionTargets({
    weightKg: nutriProfile.weight_kg,
    goal: nutriProfile.goal,
    objectiveDetails: nutriProfile.objective_details,
  });
  const targetCalories = nutritionTargets?.calories;
  const dayStatus = calcDayStatus({
    hasMeals, hasFoods,
    consumedCalories: dayTotals.calories,
    targetCalories,
    consumedWaterMl: consumedMl,
    targetWaterMl: targetMl,
  });

  // ── Água ─────────────────────────────────────────────────────────────────

  const handleAddWater = useCallback(async (ml: number) => {
    const next = addWaterMl(consumedMl, ml);
    setConsumedMl(next);
    writeJson(waterStorageKey, next);
    if (hasSupabase && userId) {
      try { await saveWaterDaily(userId, selectedDate, next, targetMl); }
      catch { showToast('não foi possível salvar a água.'); }
    }
  }, [consumedMl, targetMl, selectedDate, userId, waterStorageKey, showToast]);

  const handleSetTarget = useCallback(async (ml: number) => {
    setTargetMl(ml);
    if (hasSupabase && userId) {
      try { await saveWaterDaily(userId, selectedDate, consumedMl, ml); }
      catch { showToast('não foi possível salvar a meta de água.'); }
    }
  }, [consumedMl, selectedDate, userId, showToast]);

  // ── IA NUTRI ──────────────────────────────────────────────────────────────

  const setNutriField = <K extends keyof DietProfileRow>(key: K, value: DietProfileRow[K]) => {
    setNutriProfile((p) => ({ ...p, [key]: value, _dirty: true }));
  };

  const handleSaveNutriProfile = async () => {
    if (!nutriProfile.goal || !nutriProfile.activity_level) {
      showToast('informe objetivo e nível de atividade.'); return;
    }
    if (!hasSupabase || !userId) {
      writeJson(nutriStorageKey, nutriProfile);
      setNutriSaved(true); setNutriStep('confirm'); return;
    }
    try {
      await saveDietProfile(userId, nutriProfile);
      setNutriSaved(true);
      setNutriStep('confirm');
      showToast('perfil nutricional salvo.');
    } catch (err) {
      console.error('save diet profile', err);
      showToast('não foi possível salvar o perfil.');
    }
  };

  const handleGenerateNutri = async () => {
    if (!userId) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ response?: string; error?: string }>('ia-nutri', {
        body: { date: selectedDate },
      });
      if (error) throw error;
      if (data?.error) { showToast(data.error); return; }
      setAiResult(data?.response ?? null);
      setNutriStep('result');
    } catch (err) {
      console.error('generate ia-nutri', err);
      showToast('não foi possível gerar orientação. Verifique se a função ia-nutri está publicada.');
    }
    finally { setAiLoading(false); }
  };

  // ── DietBox PDF ───────────────────────────────────────────────────────────

  const handlePdfUpload = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('envie um arquivo PDF.'); return;
    }
    if (!userId) return;
    setPdfUploading(true);
    try {
      const filePath = await uploadImageOrPreview({ bucket: 'diet', userId, file, prefix: 'dietbox' });
      const doc = await saveDietDocument(userId, {
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: 'application/pdf',
        source: 'dietbox_pdf',
        status: 'active',
      });
      setPdfDoc(doc);
      const signed = await getSignedDietUrl(filePath);
      setPdfSignedUrl(signed);
      showToast('PDF da dieta salvo.');
    } catch { showToast('não foi possível enviar o PDF.'); }
    finally { setPdfUploading(false); }
  };

  const handleRemovePdf = async () => {
    if (!pdfDoc || !userId) return;
    try {
      await archiveDietDocument(userId, pdfDoc.id);
      setPdfDoc(null); setPdfSignedUrl(null);
      showToast('PDF removido.');
    } catch { showToast('não foi possível remover o PDF.'); }
  };

  // ── Dieta manual ──────────────────────────────────────────────────────────

  const handleAddMeal = async () => {
    if (!addingMealName.trim()) { showToast('informe o nome da refeição.'); return; }
    if (!userId) return;
    try {
      const newMeal = await saveDietMeal(userId, {
        name: addingMealName.trim(), position: meals.length,
        total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0,
      });
      setMeals((prev) => [...prev, newMeal]);
      setFoodsByMeal((prev) => ({ ...prev, [newMeal.id]: [] }));
      setAddingMealName('');
      showToast('refeição adicionada.');
    } catch { showToast('não foi possível adicionar refeição.'); }
  };

  const handleRemoveMeal = async (mealId: string) => {
    if (!userId) return;
    try {
      await deleteDietMeal(userId, mealId);
      setMeals((prev) => prev.filter((m) => m.id !== mealId));
      setFoodsByMeal((prev) => { const n = { ...prev }; delete n[mealId]; return n; });
    } catch { showToast('não foi possível remover refeição.'); }
  };

  const triggerSearch = useCallback((q: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchFoods(q);
      setSearchResults(results);
      setSearching(false);
    }, 280);
  }, []);

  const handleFoodSearchChange = (q: string) => {
    setSearchQuery(q);
    setFoodDraft((d) => ({ ...d, name: q }));
    triggerSearch(q);
  };

  const selectSearchProduct = (p: SearchProduct) => {
    const ratio = foodDraft.quantity / 100;
    setFoodDraft((d) => ({
      ...d, name: p.title,
      calories: Math.round(p.kcal_per_100g * ratio),
      protein: Math.round(p.protein_per_100g * ratio * 10) / 10,
      carbs: Math.round(p.carbs_per_100g * ratio * 10) / 10,
      fat: Math.round(p.fat_per_100g * ratio * 10) / 10,
    }));
    setSearchQuery(p.title);
    setSearchResults([]);
  };

  const handleAddFood = async (mealId: string) => {
    if (!foodDraft.name.trim()) { showToast('informe o alimento.'); return; }
    if (!userId) return;
    try {
      const newFood = await saveDietFood(userId, {
        diet_meal_id: mealId,
        name: foodDraft.name,
        quantity: foodDraft.quantity,
        unit: foodDraft.unit,
        calories: foodDraft.calories,
        protein: foodDraft.protein,
        carbs: foodDraft.carbs,
        fat: foodDraft.fat,
        notes: foodDraft.notes || null,
        position: (foodsByMeal[mealId] ?? []).length,
      } as Parameters<typeof saveDietFood>[1]);

      const updatedFoods = [...(foodsByMeal[mealId] ?? []), newFood];
      const totals = calcMealTotals(updatedFoods);
      setFoodsByMeal((prev) => ({ ...prev, [mealId]: updatedFoods }));
      setMeals((prev) => prev.map((m) =>
        m.id === mealId
          ? { ...m, total_calories: totals.calories, total_protein: totals.protein, total_carbs: totals.carbs, total_fat: totals.fat }
          : m
      ));

      await updateMealTotals(userId, mealId, totals);

      setFoodDraft(emptyFoodDraft());
      setSearchQuery('');
      setSearchResults([]);
      setEditingFoodMealId(null);
      showToast('alimento adicionado.');
    } catch { showToast('não foi possível adicionar alimento.'); }
  };

  const handleRemoveFood = async (mealId: string, foodId: string) => {
    if (!userId) return;
    try {
      await deleteDietFood(userId, foodId);
      const updatedFoods = (foodsByMeal[mealId] ?? []).filter((f) => f.id !== foodId);
      const totals = calcMealTotals(updatedFoods);
      setFoodsByMeal((prev) => ({ ...prev, [mealId]: updatedFoods }));
      setMeals((prev) => prev.map((m) =>
        m.id === mealId
          ? { ...m, total_calories: totals.calories, total_protein: totals.protein, total_carbs: totals.carbs, total_fat: totals.fat }
          : m
      ));
      await updateMealTotals(userId, mealId, totals);
    } catch { showToast('não foi possível remover alimento.'); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="screen stack-md">
        <header className="stack">
          <span className="eyebrow">dieta · {dateLabel}</span>
          <h1 className="t-display-lg">Comer com <em className="t-display-italic">presença.</em></h1>
        </header>
        <p className="t-body muted">carregando...</p>
      </div>
    );
  }

  return (
    <div className="screen stack-md">
      <header className="stack">
        <span className="eyebrow">dieta · {dateLabel}</span>
        <h1 className="t-display-lg">Comer com <em className="t-display-italic">presença.</em></h1>
        <p className="t-body muted">Organize sua alimentação com ciência e presença.</p>
      </header>

      <CyclePhaseBanner context="diet" date={selectedDate} />

      {/* ── Estado inicial: três caminhos ─────────────────────────────────── */}
      {!activePath && (
        <section className="card stack" data-testid="diet-path-selection">
          <span className="eyebrow">como quer começar?</span>
          <h2 className="t-title">Organize sua dieta</h2>
          <p className="t-body-sm muted">Escolha uma das três formas de acompanhar sua alimentação.</p>
          <div className="diet-path-grid">
            <button
              className="diet-path-card"
              onClick={() => setActivePath('ia_nutri')}
              data-testid="path-ia-nutri"
            >
              <span className="diet-path-card__icon">IA</span>
              <strong>Apoio da IA NUTRI</strong>
              <small>Preencha seu perfil e receba orientações personalizadas baseadas em evidência.</small>
            </button>
            <button
              className="diet-path-card"
              onClick={() => setActivePath('dietbox')}
              data-testid="path-dietbox"
            >
              <span className="diet-path-card__icon">PDF</span>
              <strong>Enviar dieta DietBox</strong>
              <small>Faça upload do PDF da sua dieta e acompanhe aqui.</small>
            </button>
            <button
              className="diet-path-card"
              onClick={() => setActivePath('manual')}
              data-testid="path-manual"
            >
              <span className="diet-path-card__icon">+</span>
              <strong>Criar dieta manual</strong>
              <small>Cadastre refeições e alimentos com calorias e macros.</small>
            </button>
          </div>
        </section>
      )}

      {activePath && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn--secondary btn--sm" onClick={() => setActivePath(null)}>
            trocar caminho
          </button>
        </div>
      )}

      {/* ── Painel diário (quando há dados) ─────────────────────────────────── */}
      {activePath && (hasMeals || consumedMl > 0) && (
        <DailyPanel
          dayTotals={dayTotals}
          consumedMl={consumedMl}
          targetMl={targetMl}
          dayStatus={dayStatus}
          targetCalories={targetCalories}
        />
      )}

      {/* ── IA NUTRI ─────────────────────────────────────────────────────── */}
      {activePath === 'ia_nutri' && (
        <WaterSection
          consumedMl={consumedMl}
          targetMl={targetMl}
          onAdd={handleAddWater}
          onTargetChange={handleSetTarget}
        />
      )}

      {activePath === 'ia_nutri' && (
        <NutriSection
          profile={nutriProfile}
          saved={nutriSaved}
          step={nutriStep}
          aiResult={aiResult}
          aiLoading={aiLoading}
          nutritionTargets={nutritionTargets}
          setField={setNutriField}
          onSave={handleSaveNutriProfile}
          onEdit={() => setNutriStep('form')}
          onGenerate={() => void handleGenerateNutri()}
          onOpenLabs={() => goTo('labs')}
        />
      )}

      {/* ── DietBox PDF ──────────────────────────────────────────────────── */}
      {activePath === 'dietbox' && (
        <DietboxSection
          pdfDoc={pdfDoc}
          pdfSignedUrl={pdfSignedUrl}
          uploading={pdfUploading}
          onUpload={handlePdfUpload}
          onRemove={() => void handleRemovePdf()}
        />
      )}

      {/* ── Dieta manual ─────────────────────────────────────────────────── */}
      {activePath === 'manual' && (
        <ManualDietSection
          meals={meals}
          foodsByMeal={foodsByMeal}
          addingMealName={addingMealName}
          editingFoodMealId={editingFoodMealId}
          foodDraft={foodDraft}
          searchQuery={searchQuery}
          searchResults={searchResults}
          searching={searching}
          onAddingMealNameChange={setAddingMealName}
          onAddMeal={() => void handleAddMeal()}
          onRemoveMeal={(id) => void handleRemoveMeal(id)}
          onAddFoodToggle={(id) => {
            setEditingFoodMealId((prev) => (prev === id ? null : id));
            setFoodDraft(emptyFoodDraft());
            setSearchQuery('');
            setSearchResults([]);
          }}
          onFoodSearchChange={handleFoodSearchChange}
          onSelectProduct={selectSearchProduct}
          onFoodDraftChange={(patch) => setFoodDraft((d) => ({ ...d, ...patch }))}
          onAddFood={(mealId) => void handleAddFood(mealId)}
          onRemoveFood={(mealId, foodId) => void handleRemoveFood(mealId, foodId)}
        />
      )}

      {/* ── Água (sempre visível quando há caminho ativo) ────────────────── */}
      {activePath && activePath !== 'ia_nutri' && (
        <WaterSection
          consumedMl={consumedMl}
          targetMl={targetMl}
          onAdd={handleAddWater}
          onTargetChange={handleSetTarget}
        />
      )}
    </div>
  );
}

// ── Sub-seção: Painel diário ──────────────────────────────────────────────────

function DailyPanel({ dayTotals, consumedMl, targetMl, dayStatus, targetCalories }: {
  dayTotals: ReturnType<typeof calcDayTotals>;
  consumedMl: number;
  targetMl: number;
  dayStatus: DayStatus;
  targetCalories?: number;
}) {
  const waterPct = waterProgressPct(consumedMl, targetMl);
  return (
    <section className="card diet-daily-panel" data-testid="daily-panel">
      <div className="row-between">
        <span className="eyebrow">painel do dia</span>
        <span className={`diet-status-pill diet-status-pill--${dayStatus}`}>
          {DAY_STATUS_LABELS[dayStatus]}
        </span>
      </div>
      <div className="diet-totals-grid">
        <MacroChip label="kcal" value={String(dayTotals.calories)} highlight sub={targetCalories ? `meta: ${targetCalories}` : undefined} />
        <MacroChip label="prot" value={`${dayTotals.protein}g`} />
        <MacroChip label="carbo" value={`${dayTotals.carbs}g`} />
        <MacroChip label="gord" value={`${dayTotals.fat}g`} />
      </div>
      <div className="diet-water-mini">
        <span className="t-body-sm muted">água: {(consumedMl / 1000).toFixed(1).replace('.', ',')}L de {(targetMl / 1000).toFixed(1).replace('.', ',')}L</span>
        <div className="diet-water-bar">
          <div className="diet-water-bar__fill" style={{ width: `${waterPct}%` }} />
        </div>
      </div>
    </section>
  );
}

// ── Sub-seção: IA NUTRI ───────────────────────────────────────────────────────

function NutriSection({ profile, saved, step, aiResult, aiLoading, nutritionTargets, setField, onSave, onEdit, onGenerate, onOpenLabs }: {
  profile: DietProfileRow;
  saved: boolean;
  step: 'form' | 'confirm' | 'result';
  aiResult: string | null;
  aiLoading: boolean;
  nutritionTargets: NutritionTargets | null;
  setField: <K extends keyof DietProfileRow>(key: K, value: DietProfileRow[K]) => void;
  onSave: () => void;
  onEdit: () => void;
  onGenerate: () => void;
  onOpenLabs: () => void;
}) {
  if (step === 'result' && aiResult) {
    return (
      <section className="card stack" data-testid="nutri-result">
        <div className="row-between">
          <span className="eyebrow">IA NUTRI · orientação</span>
          <button className="btn btn--secondary btn--sm" onClick={onEdit}>editar perfil</button>
        </div>
        <div className="diet-ai-response">
          {aiResult.split('\n').map((line, i) => (
            line.trim() ? <p key={i} className="t-body-sm">{line}</p> : <br key={i} />
          ))}
        </div>
        <button className="btn btn--secondary btn--sm" onClick={onGenerate} disabled={aiLoading}>
          {aiLoading ? 'gerando...' : 'gerar nova orientação'}
        </button>
      </section>
    );
  }

  if (step === 'confirm') {
    return (
      <section className="card stack" data-testid="nutri-confirm">
        <span className="eyebrow">IA NUTRI · pronto para gerar</span>
        <p className="t-body-sm muted">Seu perfil nutricional está salvo. Revise os dados antes de gerar a orientação.</p>
        <div className="diet-nutri-summary">
          {profile.goal && <span><strong>Objetivo:</strong> {profile.goal}</span>}
          {profile.weight_kg && <span><strong>Peso informado:</strong> {profile.weight_kg}kg</span>}
          {profile.activity_level && <span><strong>Atividade:</strong> {profile.activity_level}</span>}
          {profile.dietary_restrictions && <span><strong>Restrições:</strong> {profile.dietary_restrictions}</span>}
        </div>
        {nutritionTargets && (
          <NutritionTargetPreview targets={nutritionTargets} />
        )}
        <div className="inline-actions">
          <button className="btn btn--primary" onClick={onGenerate} disabled={aiLoading} data-testid="btn-generate-nutri">
            {aiLoading ? 'gerando orientação...' : 'gerar orientação da IA NUTRI'}
          </button>
          <button className="btn btn--secondary btn--sm" onClick={onEdit}>editar perfil</button>
        </div>
        {aiLoading && <p className="t-body-sm muted">analisando seu perfil com base em evidências nutricionais...</p>}
      </section>
    );
  }

  return (
    <section className="card stack" data-testid="nutri-form">
      <div className="row-between">
        <span className="eyebrow">IA NUTRI · perfil nutricional</span>
        {saved && <button className="btn btn--secondary btn--sm" onClick={onEdit}>cancelar</button>}
      </div>
      <p className="t-body-sm muted">Preencha para receber orientações personalizadas. A IA NUTRI usa ciência da nutrição, não modismos.</p>

      <div className="diet-nutri-grid">
        <div>
          <label className="diet-field-label"><span>objetivo principal</span>
            <select className="field" value={profile.goal ?? ''} onChange={(e) => setField('goal', e.target.value)}>
              <option value="">selecione</option>
              <option value="saude_geral">saúde geral</option>
              <option value="energia">mais energia</option>
              <option value="performance">performance esportiva</option>
              <option value="composicao">composição corporal</option>
              <option value="longevidade">longevidade</option>
              <option value="condicao_especifica">condição específica</option>
            </select>
          </label>
        </div>
      </div>
      <NutriTextarea label="Complemento do objetivo" value={profile.objective_details ?? ''}
        onChange={(v) => setField('objective_details', v)} placeholder="ex: perder gordura preservando massa, ganhar massa, melhorar energia no treino..." />
      <div className="diet-nutri-grid">
        <div>
          <label className="diet-field-label"><span>nível de atividade</span>
            <select className="field" value={profile.activity_level ?? ''} onChange={(e) => setField('activity_level', e.target.value)}>
              <option value="">selecione</option>
              <option value="sedentario">sedentário</option>
              <option value="recreativo">ativo recreativo</option>
              <option value="treina_regular">treina regularmente</option>
              <option value="atleta">atleta / alto volume</option>
            </select>
          </label>
        </div>
        <div>
          <label className="diet-field-label"><span>peso (kg)</span>
            <input className="field" type="number" min={30} max={300} step={0.1}
              value={profile.weight_kg ?? ''} onChange={(e) => setField('weight_kg', e.target.value ? Number(e.target.value) : undefined)} />
          </label>
        </div>
        <div>
          <label className="diet-field-label"><span>altura (cm)</span>
            <input className="field" type="number" min={100} max={250}
              value={profile.height_cm ?? ''} onChange={(e) => setField('height_cm', e.target.value ? Number(e.target.value) : undefined)} />
          </label>
        </div>
        <div>
          <label className="diet-field-label"><span>idade</span>
            <input className="field" type="number" min={10} max={110}
              value={profile.age ?? ''} onChange={(e) => setField('age', e.target.value ? Number(e.target.value) : undefined)} />
          </label>
        </div>
        <div>
          <label className="diet-field-label"><span>orçamento</span>
            <select className="field" value={profile.budget ?? ''} onChange={(e) => setField('budget', e.target.value)}>
              <option value="">selecione</option>
              <option value="baixo">baixo</option>
              <option value="medio">médio</option>
              <option value="alto">alto</option>
              <option value="flexivel">flexível</option>
            </select>
          </label>
        </div>
      </div>
      {nutritionTargets && (
        <NutritionTargetPreview targets={nutritionTargets} />
      )}

      <TrainingOptions profile={profile} setField={setField} />
      <NutriTextarea label="Rotina alimentar praticável" value={profile.available_meal_times ?? ''}
        onChange={(v) => setField('available_meal_times', v)} placeholder="horários, número de refeições, come fora..." />
      <NutriTextarea label="Alimentos que gosta / evita" value={profile.liked_foods ?? ''}
        onChange={(v) => setField('liked_foods', v)} placeholder="preferências e aversões alimentares..." />
      <NutriTextarea label="Restrições, intolerâncias e alergias" value={profile.dietary_restrictions ?? ''}
        onChange={(v) => setField('dietary_restrictions', v)} placeholder="lactose, glúten, vegetarianismo, alergias..." />
      <NutriTextarea label="Sintomas digestivos" value={profile.digestive_symptoms ?? ''}
        onChange={(v) => setField('digestive_symptoms', v)} placeholder="refluxo, gases, constipação, distensão..." />
      <div className="diet-nutri-grid">
        <NutriTextarea label="Medicamentos" value={profile.medications ?? ''}
          onChange={(v) => setField('medications', v)} placeholder="medicações e suplementos atuais..." />
        <ExamUploadShortcut onOpenLabs={onOpenLabs} />
      </div>
      <NutriTextarea label="Histórico de dietas" value={profile.diet_history ?? ''}
        onChange={(v) => setField('diet_history', v)} placeholder="o que já tentou, o que funcionou..." />
      <NutriTextarea label="Fome, saciedade e energia ao longo do dia" value={profile.appetite_and_energy ?? ''}
        onChange={(v) => setField('appetite_and_energy', v)} placeholder="fome à noite, compulsão, energia baixa..." />

      <button className="btn btn--primary" onClick={onSave} data-testid="btn-save-nutri">
        salvar perfil
      </button>
    </section>
  );
}

function TrainingOptions({ profile, setField }: {
  profile: DietProfileRow;
  setField: <K extends keyof DietProfileRow>(key: K, value: DietProfileRow[K]) => void;
}) {
  return (
    <div className="diet-option-panel">
      <span className="eyebrow">treino e refeições</span>
      <div className="diet-option-block">
        <span className="diet-field-label-text">frequência</span>
        <div className="choice-row">
          {TRAINING_FREQUENCY_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`chip${profile.training_frequency === option.value ? ' chip--active' : ''}`}
              onClick={() => setField('training_frequency', option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="diet-option-block">
        <span className="diet-field-label-text">horário usual</span>
        <div className="choice-row">
          {TRAINING_SCHEDULE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`chip${profile.training_schedule === option.value ? ' chip--active' : ''}`}
              onClick={() => setField('training_schedule', option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="diet-option-block">
        <span className="diet-field-label-text">duração média</span>
        <div className="choice-row">
          {TRAINING_DURATION_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`chip${profile.training_duration_min === option.value ? ' chip--active' : ''}`}
              onClick={() => setField('training_duration_min', option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="diet-option-block">
        <span className="diet-field-label-text">intensidade</span>
        <div className="choice-row">
          {TRAINING_INTENSITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`chip${profile.training_intensity === option.value ? ' chip--active' : ''}`}
              onClick={() => setField('training_intensity', option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className={`diet-toggle-row${profile.fasted_training ? ' diet-toggle-row--active' : ''}`}
        onClick={() => setField('fasted_training', !profile.fasted_training)}
      >
        <span>costuma treinar em jejum</span>
        <strong>{profile.fasted_training ? 'sim' : 'não'}</strong>
      </button>
    </div>
  );
}

function ExamUploadShortcut({ onOpenLabs }: { onOpenLabs: () => void }) {
  return (
    <div className="diet-exam-shortcut">
      <span className="diet-field-label-text">exames recentes</span>
      <p className="t-body-sm muted">Envie PDF ou foto no hub de saúde. A IA NUTRI usa o que estiver salvo lá, sem digitação manual.</p>
      <button type="button" className="btn btn--secondary btn--sm" onClick={onOpenLabs}>
        abrir exames
      </button>
    </div>
  );
}

function NutritionTargetPreview({ targets }: { targets: NutritionTargets }) {
  return (
    <div className="diet-target-preview" data-testid="nutrition-target-preview">
      <span className="eyebrow">estimativa inicial</span>
      <div>
        <strong>{targets.calories} kcal</strong>
        <small>{targets.protein}g proteína · {targets.proteinPerKg}g/kg · {targets.label}</small>
      </div>
    </div>
  );
}

// ── Sub-seção: DietBox ────────────────────────────────────────────────────────

function DietboxSection({ pdfDoc, pdfSignedUrl, uploading, onUpload, onRemove }: {
  pdfDoc: DietDocumentRow | null;
  pdfSignedUrl: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <section className="card stack" data-testid="dietbox-section">
      <span className="eyebrow">dieta DietBox</span>

      {!pdfDoc && (
        <div className="diet-upload-area">
          <p className="t-body-sm muted">Envie o PDF da sua dieta DietBox. Ele ficará visível aqui para consulta.</p>
          <label className={`file-button${uploading ? ' file-button--loading' : ''}`}>
            {uploading ? 'enviando...' : 'selecionar PDF'}
            <input
              type="file" accept="application/pdf,.pdf" disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
              data-testid="pdf-file-input"
            />
          </label>
        </div>
      )}

      {pdfDoc && (
        <div className="diet-pdf-card" data-testid="pdf-card">
          <div className="diet-pdf-card__header">
            <div>
              <strong>{pdfDoc.file_name}</strong>
              <small>enviado em {new Date(pdfDoc.uploaded_at).toLocaleDateString('pt-BR')}</small>
            </div>
            <div className="inline-actions">
              <label className="file-button file-button--quiet">
                substituir PDF
                <input type="file" accept="application/pdf,.pdf"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { onRemove(); onUpload(f); } }} />
              </label>
              <button className="btn btn--secondary btn--sm" onClick={onRemove}>remover</button>
            </div>
          </div>

          {pdfSignedUrl && (
            <div className="diet-pdf-viewer" data-testid="pdf-viewer">
              <iframe
                src={pdfSignedUrl}
                title={pdfDoc.file_name}
                className="diet-pdf-frame"
              />
            </div>
          )}
          {!pdfSignedUrl && (
            <a className="diet-pdf-link" href="#" target="_blank" rel="noreferrer">
              {pdfDoc.file_name}
            </a>
          )}
        </div>
      )}
    </section>
  );
}

// ── Sub-seção: Dieta manual ───────────────────────────────────────────────────

function ManualDietSection({
  meals, foodsByMeal, addingMealName, editingFoodMealId,
  foodDraft, searchQuery, searchResults, searching,
  onAddingMealNameChange, onAddMeal, onRemoveMeal, onAddFoodToggle,
  onFoodSearchChange, onSelectProduct, onFoodDraftChange, onAddFood, onRemoveFood,
}: {
  meals: DietMealRow[];
  foodsByMeal: Record<string, DietFoodRow[]>;
  addingMealName: string;
  editingFoodMealId: string | null;
  foodDraft: FoodDraft;
  searchQuery: string;
  searchResults: SearchProduct[];
  searching: boolean;
  onAddingMealNameChange: (v: string) => void;
  onAddMeal: () => void;
  onRemoveMeal: (id: string) => void;
  onAddFoodToggle: (id: string) => void;
  onFoodSearchChange: (q: string) => void;
  onSelectProduct: (p: SearchProduct) => void;
  onFoodDraftChange: (patch: Partial<FoodDraft>) => void;
  onAddFood: (mealId: string) => void;
  onRemoveFood: (mealId: string, foodId: string) => void;
}) {
  return (
    <section className="stack" data-testid="manual-diet-section">
      <div className="card stack">
        <span className="eyebrow">refeições</span>
        <div className="diet-meal-add-row">
          <input
            className="field"
            placeholder="nome da refeição (ex: Café da manhã)"
            value={addingMealName}
            onChange={(e) => onAddingMealNameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onAddMeal(); }}
            data-testid="meal-name-input"
          />
          <button className="btn btn--primary btn--sm" onClick={onAddMeal}>+ refeição</button>
        </div>

        {meals.length === 0 && (
          <p className="t-body-sm muted">Adicione refeições para montar sua dieta manual.</p>
        )}

        {meals.map((meal) => {
          const mealFoods = foodsByMeal[meal.id] ?? [];
          return (
            <article key={meal.id} className="diet-meal-item" data-testid={`meal-${meal.id}`}>
              <div className="diet-meal-item__header">
                <div>
                  <strong>{meal.name}</strong>
                  {meal.meal_time && <small>{meal.meal_time}</small>}
                </div>
                <div className="diet-meal-item__totals" data-testid={`meal-totals-${meal.id}`}>
                  <span>{meal.total_calories} kcal</span>
                  <span>{meal.total_protein}g P</span>
                  <span>{meal.total_carbs}g C</span>
                  <span>{meal.total_fat}g G</span>
                </div>
                <div className="inline-actions">
                  <button className="btn btn--secondary btn--sm" onClick={() => onAddFoodToggle(meal.id)}>
                    {editingFoodMealId === meal.id ? 'cancelar' : '+ alimento'}
                  </button>
                  <CircleButton variant="close" ariaLabel="Remover refeição" onClick={() => onRemoveMeal(meal.id)} />
                </div>
              </div>

              {editingFoodMealId === meal.id && (
                <FoodForm
                  mealId={meal.id}
                  foodDraft={foodDraft}
                  searchQuery={searchQuery}
                  searchResults={searchResults}
                  searching={searching}
                  onSearchChange={onFoodSearchChange}
                  onSelectProduct={onSelectProduct}
                  onDraftChange={onFoodDraftChange}
                  onAdd={() => onAddFood(meal.id)}
                />
              )}

              {mealFoods.length > 0 && (
                <div className="diet-food-list">
                  {mealFoods.map((food) => (
                    <div key={food.id} className="diet-food-row-item" data-testid={`food-${food.id}`}>
                      <div className="diet-food-row-item__info">
                        <span>{food.name}</span>
                        <small>{food.quantity}{food.unit}</small>
                      </div>
                      <div className="diet-food-row-item__macros">
                        <span>{food.calories} kcal</span>
                        <span>{food.protein}g P</span>
                        <span>{food.carbs}g C</span>
                        <span>{food.fat}g G</span>
                      </div>
                      <CircleButton variant="close" ariaLabel="Remover alimento" onClick={() => onRemoveFood(meal.id, food.id)} />
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ── Sub-formulário de alimento ────────────────────────────────────────────────

function FoodForm({ mealId, foodDraft, searchQuery, searchResults, searching, onSearchChange, onSelectProduct, onDraftChange, onAdd }: {
  mealId: string;
  foodDraft: FoodDraft;
  searchQuery: string;
  searchResults: SearchProduct[];
  searching: boolean;
  onSearchChange: (q: string) => void;
  onSelectProduct: (p: SearchProduct) => void;
  onDraftChange: (patch: Partial<FoodDraft>) => void;
  onAdd: () => void;
}) {
  return (
    <div className="diet-food-form stack" data-testid={`food-form-${mealId}`}>
      <div className="diet-search-wrap">
        <input
          className="field"
          placeholder="buscar alimento (ex: ovo, frango, banana...)"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          autoComplete="off"
        />
        {searching && <span className="diet-search-loading">buscando...</span>}
        {searchResults.length > 0 && (
          <ul className="diet-search-results">
            {searchResults.map((p) => (
              <li key={p.id}>
                <button className="diet-search-item" onClick={() => onSelectProduct(p)}>
                  <span className="diet-search-item__name">{p.title}</span>
                  {p.brand && <span className="diet-search-item__brand">{p.brand}</span>}
                  <span className="diet-search-item__kcal">{Math.round(p.kcal_per_100g * p.serving_g / 100)} kcal / {p.serving_g}g</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="diet-food-row">
        <label className="diet-field-label">
          <span>quantidade</span>
          <input className="field" type="number" min={1}
            value={foodDraft.quantity} onChange={(e) => onDraftChange({ quantity: Number(e.target.value) || 0 })} />
        </label>
        <label className="diet-field-label">
          <span>unidade</span>
          <select className="field" value={foodDraft.unit} onChange={(e) => onDraftChange({ unit: e.target.value })}>
            <option value="g">g</option>
            <option value="ml">ml</option>
            <option value="unidade">unidade</option>
            <option value="colher">colher</option>
            <option value="xícara">xícara</option>
          </select>
        </label>
      </div>

      <div className="diet-macros-row">
        <label className="diet-field-label">
          <span>kcal</span>
          <input className="field" type="number" min={0}
            value={foodDraft.calories} onChange={(e) => onDraftChange({ calories: Number(e.target.value) || 0 })} />
        </label>
        <label className="diet-field-label">
          <span>prot (g)</span>
          <input className="field" type="number" min={0} step={0.1}
            value={foodDraft.protein} onChange={(e) => onDraftChange({ protein: Number(e.target.value) || 0 })} />
        </label>
        <label className="diet-field-label">
          <span>carbo (g)</span>
          <input className="field" type="number" min={0} step={0.1}
            value={foodDraft.carbs} onChange={(e) => onDraftChange({ carbs: Number(e.target.value) || 0 })} />
        </label>
        <label className="diet-field-label">
          <span>gord (g)</span>
          <input className="field" type="number" min={0} step={0.1}
            value={foodDraft.fat} onChange={(e) => onDraftChange({ fat: Number(e.target.value) || 0 })} />
        </label>
      </div>

      <button className="btn btn--primary" onClick={onAdd}>adicionar ao plano</button>
    </div>
  );
}

// ── Sub-seção: Água ───────────────────────────────────────────────────────────

function WaterSection({ consumedMl, targetMl, onAdd, onTargetChange }: {
  consumedMl: number;
  targetMl: number;
  onAdd: (ml: number) => void;
  onTargetChange: (ml: number) => void;
}) {
  const pct = waterProgressPct(consumedMl, targetMl);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(String(Math.round(targetMl / 1000 * 10) / 10));

  return (
    <section className="card stack" style={{ '--dim': 'var(--diet)' } as CSSProperties} data-testid="water-section">
      <div className="row-between">
        <span className="eyebrow">água</span>
        <button className="btn btn--secondary btn--sm" onClick={() => setEditingTarget((v) => !v)}>
          {editingTarget ? 'fechar' : 'meta'}
        </button>
      </div>

      <div className="diet-water-display">
        <span className="t-display-md">{(consumedMl / 1000).toFixed(1).replace('.', ',')}L</span>
        <span className="t-body-sm muted">de {(targetMl / 1000).toFixed(1).replace('.', ',')}L · {pct}%</span>
      </div>

      <div className="diet-water-bar diet-water-bar--lg">
        <div className="diet-water-bar__fill" style={{ width: `${pct}%` }} />
      </div>

      {editingTarget && (
        <div className="diet-water-target-row">
          <label className="diet-field-label">
            <span>meta diária (L)</span>
            <input className="field" type="number" min={0.5} max={8} step={0.1}
              value={targetInput} onChange={(e) => setTargetInput(e.target.value)} />
          </label>
          <button className="btn btn--primary btn--sm" onClick={() => {
            const ml = Math.round(Number(targetInput) * 1000);
            if (ml >= 500 && ml <= 8000) { onTargetChange(ml); setEditingTarget(false); }
          }}>salvar meta</button>
        </div>
      )}

      <div className="water-grid">
        {[250, 300, 500].map((ml) => (
          <button key={ml} className="btn btn--sm btn--light" onClick={() => onAdd(ml)}>
            +{ml}ml
          </button>
        ))}
        <button className="btn btn--sm btn--outline-light" onClick={() => onAdd(-250)}>-250ml</button>
      </div>
    </section>
  );
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function MacroChip({ label, value, highlight, sub }: { label: string; value: string; highlight?: boolean; sub?: string }) {
  return (
    <div className={`diet-macro-chip${highlight ? ' diet-macro-chip--highlight' : ''}`}>
      <span className="diet-macro-chip__value">{value}</span>
      <span className="diet-macro-chip__label">{label}</span>
      {sub && <span className="diet-macro-chip__sub">{sub}</span>}
    </div>
  );
}

function NutriTextarea({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <label className="diet-nutri-field">
      <span>{label}</span>
      <textarea className="field" rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

// Compatibilidade: tipos usados em outros módulos
export type { MealType };
