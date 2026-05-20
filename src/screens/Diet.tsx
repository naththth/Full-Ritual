import { useState } from 'react';
import { getDefaultMealVariant, MEALS, TRAINING_OPTIONS } from '../data/ritualContent';
import { relativeDateLabel } from '../lib/dates';
import { uploadImageOrPreview } from '../lib/uploads';
import { useLocalState } from '../lib/useLocalState';
import { hasSupabase, supabase } from '../lib/supabase';
import { useApp } from '../store/useStore';

interface MealState {
  variant: string;
  checks: Record<number, boolean>;
  photoUrl?: string;
}

interface DietState {
  water: number;
  training: string;
  trainingDuration: string;
  trainingIntensity: 'leve' | 'moderado' | 'forte';
  trainingNotes: string;
  meals: Record<string, MealState>;
}

const initialDiet: DietState = {
  water: 0,
  training: 'none',
  trainingDuration: '',
  trainingIntensity: 'moderado',
  trainingNotes: '',
  meals: {},
};

export function Diet() {
  const userId = useApp((s) => s.userId);
  const showToast = useApp((s) => s.showToast);
  const selectedDate = useApp((s) => s.selectedDate);
  const [diet, setDiet] = useLocalState<DietState>(`full-ritual-diet-${selectedDate}`, initialDiet);
  const [saving, setSaving] = useState(false);
  const dateLabel = relativeDateLabel(selectedDate);

  const target = diet.training === 'pedal' || diet.training === 'corrida'
    ? 3.2
    : diet.training === 'lpo' || diet.training === 'musculacao'
      ? 3
      : 2.5;

  const updateMeal = (mealId: string, patch: Partial<MealState>) => {
    setDiet((current) => {
      const meal = current.meals[mealId] ?? {
        variant: getDefaultMealVariant(mealId, selectedDate),
        checks: {},
      };
      return {
        ...current,
        meals: {
          ...current.meals,
          [mealId]: { ...meal, ...patch },
        },
      };
    });
  };

  const toggleItem = (mealId: string, index: number) => {
    const current = diet.meals[mealId] ?? {
      variant: getDefaultMealVariant(mealId, selectedDate),
      checks: {},
    };
    updateMeal(mealId, { checks: { ...current.checks, [index]: !current.checks[index] } });
  };

  const markMeal = (mealId: string, total: number) => {
    updateMeal(mealId, {
      checks: Object.fromEntries(Array.from({ length: total }, (_, index) => [index, true])),
    });
  };

  const handleMealPhoto = async (mealId: string, file: File) => {
    try {
      const photoUrl = await uploadImageOrPreview({
        bucket: 'meals',
        userId,
        file,
        prefix: `meal-${selectedDate}-${mealId}`,
      });
      updateMeal(mealId, { photoUrl });
    } catch (error) {
      console.error(error);
      showToast('não foi possível enviar a foto.');
    }
  };

  const saveMeals = async () => {
    setSaving(true);
    try {
      if (hasSupabase && userId) {
        if (diet.training !== 'none' && Number(diet.trainingDuration) > 0) {
          const { error: workoutError } = await supabase.from('workout_logs').insert({
            user_id: userId,
            date: selectedDate,
            modality: trainingToModality(diet.training),
            duration_min: Number(diet.trainingDuration),
            intensity: intensityToNumber(diet.trainingIntensity),
            type: diet.training,
            notes: diet.trainingNotes || null,
          });
          if (workoutError) throw workoutError;
        }

        for (const meal of MEALS) {
          const state = diet.meals[meal.id];
          if (!state) continue;
          const items = meal.variants[state.variant] ?? meal.variants.principal;
          const checked = items.filter((_, index) => state.checks[index]).map((item) => item.title);
          if (!checked.length && !state.photoUrl) continue;

          const { error } = await supabase.from('meal_logs').insert({
            user_id: userId,
            date: selectedDate,
            meal_type: meal.mealType,
            ingredients: checked,
            photo_url: state.photoUrl ?? null,
            notes: `${meal.title} · ${state.variant}`,
          });
          if (error) throw error;
        }
      }
      showToast('dieta guardada.');
    } catch (error) {
      console.error(error);
      showToast('não foi possível salvar a dieta.');
    } finally {
      setSaving(false);
    }
  };

  const activeTraining = TRAINING_OPTIONS.find((option) => option.id === diet.training) ?? TRAINING_OPTIONS[0];

  return (
    <div className="screen stack-md">
      <header className="stack">
        <span className="eyebrow">dieta · {dateLabel}</span>
        <h1 className="t-display-lg">
          Comer com <em className="t-display-italic">presença.</em>
        </h1>
        <p className="t-body muted">
          Plano do dia com substituições, água, treino e foto da refeição.
        </p>
      </header>

      <section className="card stack">
        <span className="eyebrow">treino do dia</span>
        <div className="segmented">
          {TRAINING_OPTIONS.map((option) => (
            <button
              key={option.id}
              className={diet.training === option.id ? 'segmented--active' : ''}
              onClick={() => setDiet((current) => ({ ...current, training: option.id }))}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="training-detail-grid">
          <label className="compact-field">
            <span>duração</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="min"
              value={diet.trainingDuration}
              onChange={(event) => setDiet((current) => ({ ...current, trainingDuration: event.target.value }))}
            />
          </label>
          <label className="compact-field">
            <span>intensidade</span>
            <select
              value={diet.trainingIntensity}
              onChange={(event) => setDiet((current) => ({
                ...current,
                trainingIntensity: event.target.value as DietState['trainingIntensity'],
              }))}
            >
              <option value="leve">leve</option>
              <option value="moderado">moderado</option>
              <option value="forte">forte</option>
            </select>
          </label>
        </div>
        <textarea
          className="field training-notes"
          rows={3}
          placeholder="observação do treino: suor, energia, dor, recuperação..."
          value={diet.trainingNotes}
          onChange={(event) => setDiet((current) => ({ ...current, trainingNotes: event.target.value }))}
        />
        <p className="t-body-sm muted">{activeTraining.advice}</p>
      </section>

      <section className="card card--dim stack" style={{ '--dim': 'var(--diet)' } as React.CSSProperties}>
        <span className="eyebrow">água e recuperação</span>
        <div className="t-display-md" style={{ color: 'var(--ivory)' }}>
          {(diet.water * 0.5).toFixed(1).replace('.', ',')}L de {String(target).replace('.', ',')}L
        </div>
        <div className="water-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <button
              key={index}
              className={`btn btn--sm ${diet.water > index ? 'btn--light' : 'btn--outline-light'}`}
              onClick={() => setDiet((current) => ({ ...current, water: index + 1 }))}
            >
              {((index + 1) * 0.5).toFixed(1).replace('.', ',')}L
            </button>
          ))}
        </div>
      </section>

      {MEALS.map((meal) => {
        const recommendedVariant = getDefaultMealVariant(meal.id, selectedDate);
        const state = diet.meals[meal.id] ?? { variant: recommendedVariant, checks: {} };
        const items = meal.variants[state.variant] ?? meal.variants.principal;
        const done = items.filter((_, index) => state.checks[index]).length;

        return (
          <section key={meal.id} className="meal-card">
            <div className="row-between" style={{ alignItems: 'flex-start' }}>
              <div>
                <h2 className="meal-title">{meal.title}</h2>
                <div className="t-body-sm muted">{meal.time}</div>
              </div>
              <span className="meal-pill">{Math.round((done / items.length) * 100) || 0}%</span>
            </div>

            <div className="chip-row">
              {Object.keys(meal.variants).map((variant) => (
                <button
                  key={variant}
                  className={`chip ${state.variant === variant ? 'chip--active' : ''}`}
                  onClick={() => updateMeal(meal.id, { variant, checks: {} })}
                >
                  {variant === recommendedVariant ? 'sugestão' : variant === 'principal' ? 'principal' : variant.replace('sub', 'sub ')}
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

            <div className="inline-actions">
              <label className="file-button">
                foto da refeição
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleMealPhoto(meal.id, file);
                  }}
                />
              </label>
              <button className="btn btn--secondary btn--sm" onClick={() => markMeal(meal.id, items.length)}>
                marcar tudo
              </button>
            </div>

            {state.photoUrl && (
              <img className="photo-preview" src={state.photoUrl} alt={`Foto de ${meal.title}`} />
            )}
          </section>
        );
      })}

      <button className="btn btn--primary btn--full" onClick={saveMeals} disabled={saving}>
        {saving ? 'salvando…' : `salvar dieta de ${dateLabel}`}
      </button>
    </div>
  );
}

function trainingToModality(training: string) {
  if (training === 'pedal') return 'ciclismo';
  if (training === 'corrida') return 'corrida';
  if (training === 'yoga') return 'yoga';
  if (training === 'musculacao' || training === 'lpo') return 'forca';
  return 'caminhada';
}

function intensityToNumber(intensity: DietState['trainingIntensity']) {
  const map = { leve: 3, moderado: 6, forte: 9 };
  return map[intensity];
}
