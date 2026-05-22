import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { Icon3D, type Icon3DKind } from '../components/Icon3D';
import { useLocalState } from '../lib/useLocalState';
import { scopedStorageKey } from '../lib/storage';
import { hasSupabase, supabase } from '../lib/supabase';
import { generateTrainingPlanWithAi, uploadFitAndEvaluate } from '../lib/trainingApi';
import { isoToday } from '../lib/dates';
import { useApp } from '../store/useStore';
import { CyclePhaseBanner } from '../components/CyclePhaseBanner';
import { exerciseKey, exerciseTakesLoad, fetchWorkoutLoad, upsertWorkoutLoad } from '../lib/strengthLoads';
import {
  INTENSITY_LABEL,
  MODALITY_LABEL,
  assignmentsFromPlan,
  dayLabel,
  dayShortLabel,
  generateTemplatePlan,
  isoMondayOf,
} from '../lib/trainingPlan';
import type {
  ConsistencyBand,
  DayOfWeek,
  LpoMovements,
  PedalType,
  PreferredTime,
  RecoveryStatus,
  RunLocation,
  StrengthLocation,
  StrengthSplit,
  TrainingDay,
  TrainingGoal,
  TrainingLevel,
  TrainingModality,
  TrainingPlan,
  TrainingProfile,
} from '../types';

type View = 'loading' | 'empty' | 'onboarding' | 'plan' | 'no-supabase';

type BodyDataCacheEntry = {
  profile: TrainingProfile | null;
  plan: TrainingPlan | null;
  view: Extract<View, 'empty' | 'plan'>;
};

const bodyDataCache = new Map<string, BodyDataCacheEntry>();

const DAY_ORDER: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const MODALITY_OPTIONS: { id: TrainingModality; label: string; icon: Icon3DKind; hint: string }[] = [
  { id: 'corrida', label: 'corrida', icon: 'running', hint: 'rua ou esteira' },
  { id: 'pedal', label: 'pedal', icon: 'cycling', hint: 'road, mtb, indoor' },
  { id: 'musculacao', label: 'musculação', icon: 'lifting', hint: 'força, hipertrofia ou suporte esportivo' },
  { id: 'lpo', label: 'LPO', icon: 'olympic', hint: 'levantamento olímpico' },
];

const PREFERRED_TIME_OPTIONS: { id: PreferredTime; label: string }[] = [
  { id: 'morning', label: 'manhã' },
  { id: 'afternoon', label: 'tarde' },
  { id: 'evening', label: 'noite' },
  { id: 'flexible', label: 'flexível' },
];

const GOAL_OPTIONS: { id: TrainingGoal; label: string; hint: string }[] = [
  { id: 'maintenance', label: 'saúde geral', hint: 'longevidade, consistência e condicionamento' },
  { id: 'fat_loss', label: 'recomposição corporal', hint: 'perder gordura preservando massa magra' },
  { id: 'muscle_gain', label: 'força / hipertrofia', hint: 'sobrecarga progressiva e recuperação' },
  { id: 'performance', label: 'performance endurance', hint: 'corrida, pedal ou multimodalidade' },
  { id: 'event', label: 'evento específico', hint: 'prova / desafio marcado' },
];

const LEVEL_OPTIONS: { id: TrainingLevel; label: string; hint: string }[] = [
  { id: 'beginner', label: 'iniciante', hint: 'aprendendo técnica e criando base' },
  { id: 'intermediate', label: 'intermediário', hint: 'treina consistente e tolera intensidade moderada' },
  { id: 'advanced', label: 'avançado', hint: 'tem métricas, autonomia técnica e histórico de carga' },
];

const CONSISTENCY_OPTIONS: { id: ConsistencyBand; label: string }[] = [
  { id: 'under_6m', label: 'menos de 6 meses' },
  { id: '6m_1y', label: '6m a 1 ano' },
  { id: '1y_3y', label: '1 a 3 anos' },
  { id: 'over_3y', label: 'mais de 3 anos' },
];

const RECOVERY_OPTIONS: { id: RecoveryStatus; label: string; hint: string }[] = [
  { id: 'good', label: 'boa', hint: 'sono e energia sustentam progressão' },
  { id: 'ok', label: 'oscilante', hint: 'alguns dias bons, alguns limitados' },
  { id: 'poor', label: 'baixa', hint: 'fadiga, sono ruim ou estresse alto' },
];

const RUN_LOCATION_OPTIONS: { id: RunLocation; label: string }[] = [
  { id: 'street', label: 'rua' },
  { id: 'treadmill', label: 'esteira' },
  { id: 'both', label: 'ambos' },
];

const PEDAL_TYPE_OPTIONS: { id: PedalType; label: string }[] = [
  { id: 'roadbike', label: 'road' },
  { id: 'mtb', label: 'MTB' },
  { id: 'indoor', label: 'indoor / spin' },
];

const STRENGTH_LOCATION_OPTIONS: { id: StrengthLocation; label: string }[] = [
  { id: 'gym', label: 'academia' },
  { id: 'home', label: 'casa' },
  { id: 'outdoor', label: 'ar livre' },
];

const STRENGTH_SPLIT_OPTIONS: { id: StrengthSplit; label: string }[] = [
  { id: 'fullbody', label: 'full body' },
  { id: 'upper_lower', label: 'upper / lower' },
  { id: 'ppl', label: 'push / pull / legs' },
  { id: 'bro_split', label: 'split por grupo' },
  { id: 'other', label: 'outro' },
];

const LPO_MOVEMENTS_OPTIONS: { id: LpoMovements; label: string }[] = [
  { id: 'basics', label: 'movimentos básicos' },
  { id: 'full_oly', label: 'snatch + clean & jerk' },
];

function emptyDraft(userId: string): TrainingProfile {
  return {
    user_id: userId,
    modalities: [],
    available_days: [],
    preferred_time: 'flexible',
    session_minutes: 60,
    main_goal: 'maintenance',
    consistency_band: null,
    limitations: null,
    training_level: null,
    recent_training_summary: null,
    weekly_training_hours: null,
    priority_modality: null,
    recovery_status: null,
    target_event_name: null,
    target_event_date: null,
    target_event_modality: null,
    strength_reference_loads: null,
    technical_metrics: null,
    corrida_pace_min_per_km: null,
    corrida_max_distance_km: null,
    corrida_has_race: false,
    corrida_race_info: null,
    corrida_location: null,
    pedal_ftp_watts: null,
    pedal_type: null,
    pedal_weekly_km: null,
    pedal_has_event: false,
    pedal_event_info: null,
    strength_location: null,
    strength_equipment: null,
    strength_split: null,
    lpo_saturday_9am: false,
    lpo_has_coach: false,
    lpo_movements: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function Body() {
  const userId = useApp((s) => s.userId);
  const showToast = useApp((s) => s.showToast);
  const selectedDate = useApp((s) => s.selectedDate);

  const [view, setView] = useState<View>('loading');
  const [profile, setProfile] = useState<TrainingProfile | null>(null);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const loadRequestId = useRef(0);

  useEffect(() => {
    if (!hasSupabase) {
      setView('no-supabase');
      return;
    }
    if (!userId) {
      setView('loading');
      return;
    }
    const cached = bodyDataCache.get(userId);
    if (cached) {
      setProfile(cached.profile);
      setPlan(cached.plan);
      setView(cached.view);
    }
    void loadData(userId, { silent: Boolean(cached) });
  }, [userId]);

  async function loadData(uid: string, options: { silent?: boolean } = {}) {
    const requestId = ++loadRequestId.current;
    if (!options.silent) setView('loading');

    try {
      const [profileResult, planResult] = await Promise.all([
        supabase
          .from('training_profile')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle(),
        supabase
          .from('training_plans')
          .select('*')
          .eq('user_id', uid)
          .eq('is_active', true)
          .order('week_start_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (requestId !== loadRequestId.current) return;
      if (profileResult.error) throw profileResult.error;
      if (planResult.error) throw planResult.error;

      const nextProfile = (profileResult.data as TrainingProfile | null) ?? null;
      const nextPlan = nextProfile ? ((planResult.data as TrainingPlan | null) ?? null) : null;
      const nextView: BodyDataCacheEntry['view'] = nextProfile ? 'plan' : 'empty';

      bodyDataCache.set(uid, {
        profile: nextProfile,
        plan: nextPlan,
        view: nextView,
      });
      setProfile(nextProfile);
      setPlan(nextPlan);
      setView(nextView);
    } catch (error) {
      console.error('load training data', error);
      if (!options.silent && requestId === loadRequestId.current) {
        setProfile(null);
        setPlan(null);
        setView('empty');
      }
    }
  }

  async function handleOnboardingComplete(
    draft: TrainingProfile,
    assignments: Partial<Record<DayOfWeek, (TrainingModality | 'rest')[]>>,
  ) {
    if (!userId) return;
    setSaving(true);
    try {
      const payload = { ...draft, user_id: userId, updated_at: new Date().toISOString() };
      const { data: profileData, error: profileError } = await supabase
        .from('training_profile')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

      if (profileError) throw profileError;
      const savedProfile = profileData as TrainingProfile;
      setProfile(savedProfile);

      const weekStart = isoMondayOf(new Date());
      const planData = await createPlanWithFallback(savedProfile, weekStart, assignments, 'onboarding');
      setPlan(planData);
      bodyDataCache.set(userId, { profile: savedProfile, plan: planData, view: 'plan' });
      setView('plan');
      showToast('plano de treino criado.');
    } catch (error) {
      console.error(error);
      showToast('não foi possível salvar agora.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegeneratePlan() {
    if (!profile || !userId) return;
    setSaving(true);
    try {
      const weekStart = isoMondayOf(new Date());
      const existingAssignments = plan ? assignmentsFromPlan(plan.plan_json) : undefined;
      const planData = await createPlanWithFallback(profile, weekStart, existingAssignments, 'manual');
      setPlan(planData);
      bodyDataCache.set(userId, { profile, plan: planData, view: 'plan' });
      showToast('plano refeito.');
    } catch (error) {
      console.error(error);
      showToast('não foi possível replanejar.');
    } finally {
      setSaving(false);
    }
  }

  async function createPlanWithFallback(
    trainingProfile: TrainingProfile,
    weekStart: string,
    assignments: Partial<Record<DayOfWeek, (TrainingModality | 'rest')[]>> | undefined,
    generatedFrom: 'onboarding' | 'feedback' | 'manual',
  ) {
    if (!userId) throw new Error('usuário ausente');
    try {
      return await generateTrainingPlanWithAi({
        weekStartDate: weekStart,
        assignments,
        generatedFrom,
      });
    } catch (error) {
      console.warn('generate-training-plan fallback:', error);
      const planJson = generateTemplatePlan(trainingProfile, weekStart, assignments);

      await supabase
        .from('training_plans')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('is_active', true);

      const { data: planData, error: planError } = await supabase
        .from('training_plans')
        .insert({
          user_id: userId,
          week_start_date: weekStart,
          plan_json: planJson,
          generated_from: generatedFrom,
          is_active: true,
        })
        .select()
        .single();

      if (planError) throw planError;
      showToast('IA indisponível agora. Usei o plano base e mantive o fluxo.');
      return planData as TrainingPlan;
    }
  }

  if (view === 'no-supabase') {
    return (
      <div className="screen stack-md body-screen">
        <section className="body-hero">
          <span className="eyebrow">corpo · treino</span>
          <h1>Conecte o Supabase para destravar o treino.</h1>
          <p>O plano semanal precisa do banco para guardar suas respostas e gerar a rotina.</p>
        </section>
      </div>
    );
  }

  if (view === 'loading') {
    return (
      <div className="screen stack-md body-screen">
        <section className="body-hero">
          <span className="eyebrow">corpo · treino</span>
          <h1>Carregando seu plano…</h1>
        </section>
      </div>
    );
  }

  if (view === 'empty') {
    return <EmptyState onStart={() => setView('onboarding')} />;
  }

  if (view === 'onboarding' && userId) {
    const initialAssignments = plan ? assignmentsFromPlan(plan.plan_json) : {};
    return (
      <Onboarding
        initial={profile ?? emptyDraft(userId)}
        initialAssignments={initialAssignments}
        saving={saving}
        onCancel={() => setView(profile ? 'plan' : 'empty')}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  if (view === 'plan' && profile) {
    return (
      <PlanView
        userId={userId}
        profile={profile}
        plan={plan}
        selectedDate={selectedDate}
        saving={saving}
        onEditProfile={() => setView('onboarding')}
        onRegenerate={handleRegeneratePlan}
      />
    );
  }

  return null;
}

// =====================================================================
// EMPTY STATE — pré-onboarding
// =====================================================================

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="screen stack-md body-screen">
      <section className="body-hero">
        <span className="eyebrow">corpo · treino</span>
        <h1>
          Seu treino, <em>desenhado por dentro.</em>
        </h1>
        <p>
          Corrida, pedal, musculação e LPO planejados conforme seu ciclo, sono e energia. Comece
          respondendo algumas perguntas e eu monto sua semana.
        </p>
      </section>

      <section className="card stack">
        <span className="eyebrow">primeiro passo</span>
        <p className="t-body">
          O onboarding leva uns 3 minutos. Você pode editar tudo depois — modalidades, dias, objetivo.
        </p>
        <button className="btn btn--primary btn--full" onClick={onStart}>
          começar onboarding
        </button>
      </section>
    </div>
  );
}

// =====================================================================
// ONBOARDING — wizard de 4 passos
// =====================================================================

interface OnboardingProps {
  initial: TrainingProfile;
  initialAssignments: Partial<Record<DayOfWeek, (TrainingModality | 'rest')[]>>;
  saving: boolean;
  onCancel: () => void;
  onComplete: (draft: TrainingProfile, assignments: Partial<Record<DayOfWeek, (TrainingModality | 'rest')[]>>) => void;
}

function Onboarding({ initial, initialAssignments, saving, onCancel, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<TrainingProfile>(() => ({ ...initial, lpo_saturday_9am: false }));
  const [dayAssignments, setDayAssignments] = useState<Partial<Record<DayOfWeek, (TrainingModality | 'rest')[]>>>(initialAssignments);

  const update = <K extends keyof TrainingProfile>(key: K, value: TrainingProfile[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const toggleModality = (m: TrainingModality) => {
    setDraft((current) => {
      const has = current.modalities.includes(m);
      const next = has ? current.modalities.filter((x) => x !== m) : [...current.modalities, m];
      return { ...current, modalities: next, lpo_saturday_9am: false };
    });
  };

  const toggleDay = (d: DayOfWeek) => {
    setDraft((current) => {
      const has = current.available_days.includes(d);
      return {
        ...current,
        available_days: has ? current.available_days.filter((x) => x !== d) : [...current.available_days, d],
      };
    });
  };

  const canAdvance = useMemo(() => {
    if (step === 0) return draft.modalities.length > 0;
    if (step === 1) return draft.available_days.length > 0 && draft.session_minutes > 0;
    if (step === 2) return draft.training_level !== null && draft.consistency_band !== null;
    if (step === 3) return draft.recovery_status !== null;
    return true;
  }, [step, draft]);

  const totalSteps = 5;

  return (
    <div className="screen stack-md body-screen">
      <header className="onboarding-header">
        <button className="back-link" onClick={onCancel} disabled={saving}>
          ← cancelar
        </button>
        <span className="eyebrow">onboarding · {step + 1}/{totalSteps}</span>
      </header>

      <div className="onboarding-progress">
        {Array.from({ length: totalSteps }, (_, i) => (
          <span key={i} className={`onboarding-progress-step${i <= step ? ' onboarding-progress-step--done' : ''}`} />
        ))}
      </div>

      {step === 0 && (
        <StepModalities draft={draft} onToggle={toggleModality} />
      )}
      {step === 1 && (
        <StepSchedule
          draft={draft}
          dayAssignments={dayAssignments}
          onToggleDay={toggleDay}
          onUpdate={update}
          onSetAssignment={(day, mod) =>
            setDayAssignments((prev) => {
              const current = prev[day] ?? [];
              const has = current.includes(mod);
              // Se só tinha 'rest' e usuário clicou em modalidade, remove 'rest'
              // Se clicou em 'rest', limpa tudo
              let next: (TrainingModality | 'rest')[];
              if (mod === 'rest') {
                next = ['rest'];
              } else if (has) {
                next = current.filter((m) => m !== mod);
                if (next.length === 0) next = ['rest'];
              } else {
                next = [...current.filter((m) => m !== 'rest'), mod];
              }
              return { ...prev, [day]: next };
            })
          }
        />
      )}
      {step === 2 && (
        <StepGoal draft={draft} onUpdate={update} />
      )}
      {step === 3 && (
        <StepCoachContext draft={draft} onUpdate={update} />
      )}
      {step === 4 && (
        <StepDetails draft={draft} onUpdate={update} />
      )}

      <div className="onboarding-actions">
        {step > 0 && (
          <button className="btn btn--secondary" onClick={() => setStep((s) => s - 1)} disabled={saving}>
            voltar
          </button>
        )}
        {step < totalSteps - 1 ? (
          <button
            className="btn btn--primary btn--full"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canAdvance || saving}
          >
            continuar
          </button>
        ) : (
          <button
            className="btn btn--primary btn--full"
            onClick={() => onComplete(draft, dayAssignments)}
            disabled={saving}
          >
            {saving ? 'gerando plano…' : 'gerar meu plano'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- STEP 1: modalidades ----------
function StepModalities({
  draft,
  onToggle,
}: {
  draft: TrainingProfile;
  onToggle: (m: TrainingModality) => void;
}) {
  return (
    <section className="stack">
      <div className="stack">
        <h2 className="onboarding-title">Quais modalidades fazem parte da sua rotina?</h2>
        <p className="t-body muted">Selecione as modalidades que devem entrar no planejamento. O plano será montado a partir dos seus dias, objetivo e nível atual.</p>
      </div>
      <div className="onboarding-cards">
        {MODALITY_OPTIONS.map((m) => {
          const active = draft.modalities.includes(m.id);
          return (
            <button
              key={m.id}
              className={`modality-card${active ? ' modality-card--active' : ''}`}
              onClick={() => onToggle(m.id)}
            >
              <Icon3D kind={m.icon} size={38} />
              <div>
                <strong>{m.label}</strong>
                <small>{m.hint}</small>
              </div>
              <span className="modality-check">{active ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------- STEP 2: dias e horário ----------
function StepSchedule({
  draft,
  dayAssignments,
  onToggleDay,
  onUpdate,
  onSetAssignment,
}: {
  draft: TrainingProfile;
  dayAssignments: Partial<Record<DayOfWeek, (TrainingModality | 'rest')[]>>;
  onToggleDay: (d: DayOfWeek) => void;
  onUpdate: <K extends keyof TrainingProfile>(key: K, value: TrainingProfile[K]) => void;
  onSetAssignment: (day: DayOfWeek, mod: TrainingModality | 'rest') => void;  // toggle
}) {
  return (
    <section className="stack">
      <div className="stack">
        <h2 className="onboarding-title">Quando você consegue treinar?</h2>
        <p className="t-body muted">Marque os dias em que você consegue treinar, o horário mais provável e o tempo médio real por sessão.</p>
      </div>

      <div className="stack">
        <span className="eyebrow">dias disponíveis</span>
        <div className="day-toggle-grid">
          {DAY_ORDER.map((d) => {
            const active = draft.available_days.includes(d);
            return (
              <button
                key={d}
                className={`day-toggle${active ? ' day-toggle--active' : ''}`}
                onClick={() => onToggleDay(d)}
              >
                {dayShortLabel(d)}
              </button>
            );
          })}
        </div>
      </div>

      {draft.available_days.length > 0 && draft.modalities.length > 0 && (
        <div className="stack">
          <span className="eyebrow">o que treinar em cada dia?</span>
          <div className="day-assignment-list">
            {DAY_ORDER.filter((d) => draft.available_days.includes(d)).map((d) => {
              const selected = dayAssignments[d] ?? ['rest'];
              return (
                <div key={d} className="day-assignment-row">
                  <span className="day-assignment-label">{dayLabel(d)}</span>
                  <div className="choice-row">
                    {draft.modalities.map((m) => (
                      <button
                        key={m}
                        className={`chip chip--sm${selected.includes(m) ? ' chip--active' : ''}`}
                        onClick={() => onSetAssignment(d, m)}
                      >
                        {MODALITY_LABEL[m]}
                      </button>
                    ))}
                    <button
                      className={`chip chip--sm${selected.includes('rest') ? ' chip--active' : ''}`}
                      onClick={() => onSetAssignment(d, 'rest')}
                    >
                      descanso
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="stack">
        <span className="eyebrow">horário preferido</span>
        <div className="choice-row">
          {PREFERRED_TIME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`chip${draft.preferred_time === opt.id ? ' chip--active' : ''}`}
              onClick={() => onUpdate('preferred_time', opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stack">
        <span className="eyebrow">tempo por sessão</span>
        <div className="choice-row">
          {[30, 45, 60, 75, 90, 120].map((mins) => (
            <button
              key={mins}
              className={`chip${draft.session_minutes === mins ? ' chip--active' : ''}`}
              onClick={() => onUpdate('session_minutes', mins)}
            >
              {mins} min
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- STEP 3: objetivo + experiência ----------
function StepGoal({
  draft,
  onUpdate,
}: {
  draft: TrainingProfile;
  onUpdate: <K extends keyof TrainingProfile>(key: K, value: TrainingProfile[K]) => void;
}) {
  return (
    <section className="stack">
      <div className="stack">
        <h2 className="onboarding-title">Seu objetivo e nível atual.</h2>
        <p className="t-body muted">Isso define a ênfase do plano e o quanto posso usar intensidade, carga e autonomia técnica.</p>
      </div>

      <div className="stack">
        <span className="eyebrow">objetivo principal</span>
        <div className="onboarding-cards">
          {GOAL_OPTIONS.map((g) => (
            <button
              key={g.id}
              className={`modality-card${draft.main_goal === g.id ? ' modality-card--active' : ''}`}
              onClick={() => onUpdate('main_goal', g.id)}
            >
              <span />
              <div>
                <strong>{g.label}</strong>
                <small>{g.hint}</small>
              </div>
              <span className="modality-check">{draft.main_goal === g.id ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="stack">
        <span className="eyebrow">nível técnico atual</span>
        <div className="onboarding-cards">
          {LEVEL_OPTIONS.map((level) => (
            <button
              key={level.id}
              className={`modality-card${draft.training_level === level.id ? ' modality-card--active' : ''}`}
              onClick={() => onUpdate('training_level', level.id)}
            >
              <span />
              <div>
                <strong>{level.label}</strong>
                <small>{level.hint}</small>
              </div>
              <span className="modality-check">{draft.training_level === level.id ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="stack">
        <span className="eyebrow">há quanto tempo treina consistente</span>
        <div className="choice-row">
          {CONSISTENCY_OPTIONS.map((c) => (
            <button
              key={c.id}
              className={`chip${draft.consistency_band === c.id ? ' chip--active' : ''}`}
              onClick={() => onUpdate('consistency_band', c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stack">
        <span className="eyebrow">restrições, dores ou contexto importante (opcional)</span>
        <textarea
          className="field"
          rows={3}
          placeholder="ex: tendinite no ombro esquerdo, dor lombar, viagem frequente, sono ruim, restrição médica..."
          value={draft.limitations ?? ''}
          onChange={(e) => onUpdate('limitations', e.target.value || null)}
        />
      </div>
    </section>
  );
}

// ---------- STEP 4: contexto para IA Coach ----------
function StepCoachContext({
  draft,
  onUpdate,
}: {
  draft: TrainingProfile;
  onUpdate: <K extends keyof TrainingProfile>(key: K, value: TrainingProfile[K]) => void;
}) {
  return (
    <section className="stack">
      <div className="stack">
        <h2 className="onboarding-title">Contexto para o IA Coach.</h2>
        <p className="t-body muted">Essas respostas calibram carga, progressão, recuperação e a lógica da semana.</p>
      </div>

      {draft.modalities.length > 1 && (
        <div className="stack">
          <span className="eyebrow">modalidade prioritária neste bloco</span>
          <div className="choice-row">
            {draft.modalities.map((m) => (
              <button
                key={m}
                className={`chip${draft.priority_modality === m ? ' chip--active' : ''}`}
                onClick={() => onUpdate('priority_modality', m)}
              >
                {MODALITY_LABEL[m]}
              </button>
            ))}
            <button
              className={`chip${draft.priority_modality === null ? ' chip--active' : ''}`}
              onClick={() => onUpdate('priority_modality', null)}
            >
              equilibrado
            </button>
          </div>
        </div>
      )}

      <label className="field-group">
        <span>histórico recente de treino</span>
        <textarea
          className="field"
          rows={3}
          placeholder="ex: últimas 2 semanas: 3 corridas leves, 2 musculações, sem longão; parei por 1 mês; ou volume alto com fadiga..."
          value={draft.recent_training_summary ?? ''}
          onChange={(e) => onUpdate('recent_training_summary', e.target.value || null)}
        />
      </label>

      <label className="field-group">
        <span>volume semanal atual (horas)</span>
        <input
          className="field"
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          placeholder="ex: 4.5"
          value={draft.weekly_training_hours ?? ''}
          onChange={(e) => onUpdate('weekly_training_hours', e.target.value ? Number(e.target.value) : null)}
        />
      </label>

      <div className="stack">
        <span className="eyebrow">recuperação atual</span>
        <div className="onboarding-cards">
          {RECOVERY_OPTIONS.map((recovery) => (
            <button
              key={recovery.id}
              className={`modality-card${draft.recovery_status === recovery.id ? ' modality-card--active' : ''}`}
              onClick={() => onUpdate('recovery_status', recovery.id)}
            >
              <span />
              <div>
                <strong>{recovery.label}</strong>
                <small>{recovery.hint}</small>
              </div>
              <span className="modality-check">{draft.recovery_status === recovery.id ? '✓' : ''}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="modality-section">
        <span className="eyebrow">prova ou evento-alvo (opcional)</span>
        <label className="field-group">
          <span>nome do evento</span>
          <input
            className="field"
            type="text"
            placeholder="ex: meia maratona, granfondo, triathlon sprint"
            value={draft.target_event_name ?? ''}
            onChange={(e) => onUpdate('target_event_name', e.target.value || null)}
          />
        </label>
        <label className="field-group">
          <span>data</span>
          <input
            className="field"
            type="date"
            value={draft.target_event_date ?? ''}
            onChange={(e) => onUpdate('target_event_date', e.target.value || null)}
          />
        </label>
        <label className="field-group">
          <span>modalidade / distância</span>
          <input
            className="field"
            type="text"
            placeholder="ex: 10 km, 70.3, MTB 80 km"
            value={draft.target_event_modality ?? ''}
            onChange={(e) => onUpdate('target_event_modality', e.target.value || null)}
          />
        </label>
      </div>
    </section>
  );
}

// ---------- STEP 5: detalhes por modalidade ----------
function StepDetails({
  draft,
  onUpdate,
}: {
  draft: TrainingProfile;
  onUpdate: <K extends keyof TrainingProfile>(key: K, value: TrainingProfile[K]) => void;
}) {
  const has = (m: TrainingModality) => draft.modalities.includes(m);

  return (
    <section className="stack">
      <div className="stack">
        <h2 className="onboarding-title">Últimos detalhes por modalidade.</h2>
        <p className="t-body muted">Preencha o que souber. Dados atuais ajudam a calibrar intensidade, volume e progressão sem copiar rotina de outra pessoa.</p>
      </div>

      <label className="field-group">
        <span>métricas técnicas que você já usa (opcional)</span>
        <textarea
          className="field"
          rows={2}
          placeholder="ex: FC repouso 52, FC máx 188, zonas por Garmin, pace Z2 6:20, potência crítica..."
          value={draft.technical_metrics ?? ''}
          onChange={(e) => onUpdate('technical_metrics', e.target.value || null)}
        />
      </label>

      {has('corrida') && (
        <div className="modality-section">
          <span className="eyebrow">corrida</span>
          <label className="field-group">
            <span>ritmo confortável (min/km)</span>
            <input
              className="field"
              type="text"
              inputMode="decimal"
              placeholder="ex: 6:30"
              value={draft.corrida_pace_min_per_km ?? ''}
              onChange={(e) => onUpdate('corrida_pace_min_per_km', e.target.value || null)}
            />
          </label>
          <label className="field-group">
            <span>maior distância já feita (km)</span>
            <input
              className="field"
              type="number"
              inputMode="numeric"
              placeholder="ex: 10"
              value={draft.corrida_max_distance_km ?? ''}
              onChange={(e) =>
                onUpdate('corrida_max_distance_km', e.target.value ? Number(e.target.value) : null)
              }
            />
          </label>
          <div className="field-group">
            <span>onde corre</span>
            <div className="choice-row">
              {RUN_LOCATION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`chip${draft.corrida_location === opt.id ? ' chip--active' : ''}`}
                  onClick={() => onUpdate('corrida_location', opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <label className="field-group">
            <span>tem prova marcada? (opcional)</span>
            <input
              className="field"
              type="text"
              placeholder="ex: 10km em 2 meses"
              value={draft.corrida_race_info ?? ''}
              onChange={(e) =>
                onUpdate('corrida_race_info', e.target.value || null)
              }
              onBlur={() =>
                onUpdate('corrida_has_race', Boolean(draft.corrida_race_info?.trim()))
              }
            />
          </label>
        </div>
      )}

      {has('pedal') && (
        <div className="modality-section">
          <span className="eyebrow">pedal</span>
          <div className="field-group">
            <span>tipo de bike</span>
            <div className="choice-row">
              {PEDAL_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`chip${draft.pedal_type === opt.id ? ' chip--active' : ''}`}
                  onClick={() => onUpdate('pedal_type', opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <label className="field-group">
            <span>FTP atual (watts)</span>
            <input
              className="field"
              type="number"
              inputMode="numeric"
              placeholder="ex: 210 — se não sabe, deixe em branco"
              value={draft.pedal_ftp_watts ?? ''}
              onChange={(e) =>
                onUpdate('pedal_ftp_watts', e.target.value ? Number(e.target.value) : null)
              }
            />
          </label>
          {draft.pedal_ftp_watts && (
            <div className="ftp-zones-preview">
              <span className="eyebrow" style={{ fontSize: 9 }}>zonas de potência calculadas</span>
              {ftpZones(draft.pedal_ftp_watts).map((z) => (
                <div key={z.name} className="ftp-zone-row">
                  <span className="ftp-zone-name">{z.name}</span>
                  <span className="ftp-zone-range">{z.range}</span>
                  <span className="ftp-zone-label">{z.label}</span>
                </div>
              ))}
            </div>
          )}
          <label className="field-group">
            <span>volume semanal atual (km)</span>
            <input
              className="field"
              type="number"
              inputMode="numeric"
              placeholder="ex: 80"
              value={draft.pedal_weekly_km ?? ''}
              onChange={(e) =>
                onUpdate('pedal_weekly_km', e.target.value ? Number(e.target.value) : null)
              }
            />
          </label>
          <label className="field-group">
            <span>tem evento marcado? (opcional)</span>
            <input
              className="field"
              type="text"
              placeholder="ex: granfondo em 3 meses"
              value={draft.pedal_event_info ?? ''}
              onChange={(e) => onUpdate('pedal_event_info', e.target.value || null)}
              onBlur={() => onUpdate('pedal_has_event', Boolean(draft.pedal_event_info?.trim()))}
            />
          </label>
        </div>
      )}

      {has('musculacao') && (
        <div className="modality-section">
          <span className="eyebrow">musculação</span>
          <div className="field-group">
            <span>onde treina</span>
            <div className="choice-row">
              {STRENGTH_LOCATION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`chip${draft.strength_location === opt.id ? ' chip--active' : ''}`}
                  onClick={() => onUpdate('strength_location', opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field-group">
            <span>como divide o treino</span>
            <div className="choice-row">
              {STRENGTH_SPLIT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`chip${draft.strength_split === opt.id ? ' chip--active' : ''}`}
                  onClick={() => onUpdate('strength_split', opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <label className="field-group">
            <span>equipamentos disponíveis (opcional)</span>
            <textarea
              className="field"
              rows={2}
              placeholder="ex: halteres 2-20kg, barra fixa, kettlebell 16kg"
              value={draft.strength_equipment ?? ''}
              onChange={(e) => onUpdate('strength_equipment', e.target.value || null)}
            />
          </label>
          <label className="field-group">
            <span>cargas de referência (opcional)</span>
            <textarea
              className="field"
              rows={2}
              placeholder="ex: agachamento 60kg x5, terra 80kg x3, supino 40kg x8, RPE médio 7"
              value={draft.strength_reference_loads ?? ''}
              onChange={(e) => onUpdate('strength_reference_loads', e.target.value || null)}
            />
          </label>
        </div>
      )}

      {has('lpo') && (
        <div className="modality-section">
          <span className="eyebrow">LPO</span>
          <label className="field-toggle">
            <span>
              <strong>treina com coach</strong>
              <small>se sim, eu evito interferir na programação do LPO.</small>
            </span>
            <input
              type="checkbox"
              checked={draft.lpo_has_coach}
              onChange={(e) => onUpdate('lpo_has_coach', e.target.checked)}
            />
          </label>
          <div className="field-group">
            <span>movimentos que trabalha</span>
            <div className="choice-row">
              {LPO_MOVEMENTS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`chip${draft.lpo_movements === opt.id ? ' chip--active' : ''}`}
                  onClick={() => onUpdate('lpo_movements', opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {draft.modalities.length === 0 && (
        <p className="t-body muted">Nenhuma modalidade selecionada. Volte e escolha pelo menos uma.</p>
      )}
    </section>
  );
}

// =====================================================================
// PLAN VIEW — visualização do plano semanal
// =====================================================================

interface PlanViewProps {
  userId: string | null;
  profile: TrainingProfile;
  plan: TrainingPlan | null;
  selectedDate: string;
  saving: boolean;
  onEditProfile: () => void;
  onRegenerate: () => void;
}

const CONGRATS = [
  'Treino concluído. Cada bloco que você marca é uma escolha pelo seu corpo.',
  'Sessão completa. O progresso não é visível hoje — mas está lá, célula por célula.',
  'Feito. Consistência é o único treino que nunca falha.',
  'Treino encerrado. Agora é hora de deixar o corpo assimilar o estímulo.',
  'Completo. Você treinou quando podia não ter treinado.',
];

type FitAnalysis = {
  feedback: string;
  parsed_data: Record<string, unknown>;
  adjustments?: import('../lib/trainingApi').WorkoutAdjustments;
};

function PlanView({ userId, profile, plan, selectedDate, saving, onEditProfile, onRegenerate }: PlanViewProps) {
  const goTo = useApp((s) => s.goTo);
  const days: TrainingDay[] = plan?.plan_json ?? [];
  const showToast = useApp((s) => s.showToast);
  const todayIso = isoToday();
  const [viewingDate, setViewingDate] = useState(todayIso);
  const activeWorkoutDate = viewingDate || selectedDate;
  const [fitUploading, setFitUploading] = useState(false);
  const [fitModality, setFitModality] = useState<TrainingModality>('pedal');
  const [fitAnalysis, setFitAnalysis] = useLocalState<FitAnalysis | null>(
    scopedStorageKey(`full-ritual-fit-analysis-${activeWorkoutDate}`, userId),
    null,
  );
  const [blockChecks, setBlockChecks] = useLocalState<Record<string, boolean>>(
    scopedStorageKey(`full-ritual-workout-blocks-${activeWorkoutDate}`, userId),
    {},
  );

  const toggleTraining = (dayIdx: number, groupKey: string) => {
    const key = `${dayIdx}:${groupKey}`;
    const day = days.find((item) => item.day_index === dayIdx);
    const groups = day ? getGroups(day.blocks) : [];
    setBlockChecks((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (day) {
        const done = groups.filter((group) => next[`${dayIdx}:${group.key}`]).length;
        writeWorkoutSummary(day.date, done, groups.length, userId);
      }
      return next;
    });
  };

  const getGroups = (blocks: TrainingDay['blocks']) => {
    type G = { key: string; label?: string; color?: string; blocks: typeof blocks };
    const groups: G[] = [];
    const ownerDay = days.find((day) => day.blocks === blocks);
    for (const b of (blocks ?? [])) {
      const prefixMatch = b.id.match(/^(\d+)-/);
      const modalityIndex = prefixMatch ? Number(prefixMatch[1]) : null;
      const inferredLabel = b.modalityGroup
        ?? (modalityIndex !== null ? modalityLabel(ownerDay?.modalities?.[modalityIndex]) : undefined)
        ?? (ownerDay?.modalities?.length === 1
          ? modalityLabel(ownerDay.modalities[0])
          : undefined);
      const key = b.modalityGroup ?? (modalityIndex !== null ? `modality-${modalityIndex}` : 'default');
      const last = groups[groups.length - 1];
      if (!last || key !== last.key) {
        groups.push({ key, label: inferredLabel, color: inferredLabel ? MODALITY_COLOR[inferredLabel] : undefined, blocks: [b] });
      } else {
        last.blocks.push(b);
      }
    }
    return groups;
  };

  const dayProgress = (d: TrainingDay) => {
    const groups = getGroups(d.blocks);
    const total = groups.length;
    const done = groups.filter((g) => blockChecks[`${d.day_index}:${g.key}`]).length;
    return { done, total };
  };

  useEffect(() => {
    const day = days.find((item) => item.date === activeWorkoutDate);
    if (!day) return;
    const { done, total } = dayProgress(day);
    writeWorkoutSummary(day.date, done, total, userId);
  }, [activeWorkoutDate, blockChecks, days, userId]);

  const handleFitUpload = async (file: File | null) => {
    if (!file) return;
    if (!userId) {
      showToast('faça login antes de importar o .FIT.');
      return;
    }
    setFitUploading(true);
    setFitAnalysis(null);
    try {
      const result = await uploadFitAndEvaluate({
        userId,
        file,
        date: activeWorkoutDate,
        modality: fitModality,
      });
      setFitAnalysis({
        feedback: result.ai_feedback,
        parsed_data: result.parsed_data,
        adjustments: result.ai_adjustments,
      });
      showToast('treino importado e avaliado.');
    } catch (error) {
      console.error(error);
      showToast('não consegui avaliar esse .FIT agora.');
    } finally {
      setFitUploading(false);
    }
  };

  const congratsMsg = CONGRATS[new Date().getDay() % CONGRATS.length];

  return (
    <div className="screen stack-md body-screen">
      <section className="body-hero">
        <span className="eyebrow">corpo · treino</span>
        <h1>
          Sua semana <em>desenhada.</em>
        </h1>
        <p>
          {profile.modalities.length === 0
            ? 'Adicione modalidades para começar.'
            : `${profile.modalities.map((m) => MODALITY_LABEL[m]).join(' · ')} · ${profile.available_days.length} dias`}
        </p>
      </section>

      <CyclePhaseBanner context="body" date={todayIso} />

      <section className="stack training-exercise-section">
        <span className="eyebrow">exercício · toque para abrir</span>
        <div className="training-week">
          {days.map((d) => {
            const isToday = d.date === todayIso;
            const isViewing = d.date === viewingDate;
            const dayKey = DAY_ORDER[d.day_index] ?? 'mon';
            const { done, total } = dayProgress(d);
            const complete = total > 0 && done === total;
            return (
              <article key={d.date} className={`training-day-shell${isViewing ? ' training-day-shell--open' : ''}`}>
                <button
                  onClick={() => setViewingDate(isViewing ? '' : d.date)}
                  className={`training-day${isToday ? ' training-day--today' : ''}${d.modality === 'rest' ? ' training-day--rest' : ''}${complete ? ' training-day--complete' : ''}${isViewing ? ' training-day--viewing' : ''}`}
                >
                  <div className="training-day-header">
                    <span className="training-day-name">{dayLabel(dayKey)}</span>
                    <span className="training-day-progress">
                      {complete ? (
                        <>
                          <span className="training-day-progress-check">✓</span>
                          feito
                        </>
                      ) : total > 0 ? `${done}/${total}` : ''}
                    </span>
                  </div>
                  <strong>{d.title}</strong>
                  <small>
                    {d.duration_min > 0 ? `${d.duration_min} min · ` : ''}
                    {INTENSITY_LABEL[d.intensity]}
                  </small>
                </button>

                {isViewing && (
                  <>
                    {complete && d.date === todayIso && (
                      <div className="training-congrats training-congrats--inline">
                        <span className="training-congrats-mark">✓</span>
                        <p>{congratsMsg}</p>
                      </div>
                    )}
                    <TrainingSessionCard
                      day={d}
                      label={isToday ? `hoje · ${dayShortLabel(dayKey)}` : relativeDayLabel(d.date)}
                      checks={blockChecks}
                      onToggle={(groupKey) => toggleTraining(d.day_index, groupKey)}
                      isToday={isToday}
                      getGroups={getGroups}
                      userId={userId}
                    />
                  </>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="card fit-upload-card">
        <div className="fit-upload-head">
          <span className="eyebrow">upload · garmin · mywhoosh</span>
          <span className="training-fit-date">{relativeDayLabel(activeWorkoutDate)}</span>
        </div>
        <h2 className="training-fit-title">Avaliar treino realizado.</h2>
        <p className="t-body muted fit-upload-copy">
          Suba o arquivo .FIT exportado do Garmin Connect ou MyWhoosh. A IA compara o realizado com o planejado e salva o feedback para ajustar a semana.
        </p>
        <div className="fit-modality-picker" aria-label="modalidade do arquivo">
          {(['pedal', 'corrida', 'musculacao'] as TrainingModality[]).map((modality) => (
            <button
              key={modality}
              className={`fit-modality-chip${fitModality === modality ? ' fit-modality-chip--active' : ''}`}
              type="button"
              onClick={() => setFitModality(modality)}
            >
              {MODALITY_LABEL[modality]}
            </button>
          ))}
        </div>
        <label className={`fit-upload-drop${fitUploading ? ' fit-upload-drop--loading' : ''}`}>
          <input
            type="file"
            accept=".fit,application/octet-stream"
            disabled={fitUploading}
            onChange={(event) => {
              void handleFitUpload(event.target.files?.[0] ?? null);
              event.currentTarget.value = '';
            }}
          />
          <span className="fit-upload-icon">↥</span>
          <strong>{fitUploading ? 'avaliando arquivo…' : 'importar .FIT'}</strong>
          <small>{MODALITY_LABEL[fitModality]} · {relativeDayLabel(activeWorkoutDate)}</small>
        </label>
        {fitAnalysis && (
          <div className="fit-feedback">
            <FitMetricsGrid data={fitAnalysis.parsed_data} />
            {fitAnalysis.adjustments ? (
              <FitAdjustmentsView adjustments={fitAnalysis.adjustments} />
            ) : (
              <>
                <span className="eyebrow">feedback · IA</span>
                <p>{fitAnalysis.feedback}</p>
              </>
            )}
          </div>
        )}
      </section>

      <div className="training-actions">
        <button className="btn btn--secondary btn--full" onClick={onEditProfile} disabled={saving}>
          editar perfil de treino
        </button>
        <button className="btn btn--primary btn--full" onClick={onRegenerate} disabled={saving}>
          {saving ? 'replanejando…' : 'replanejar a semana'}
        </button>
      </div>

      <button
        type="button"
        className="body-coach-fab"
        onClick={() => goTo('body_coach')}
        aria-label="abrir IA coach"
      >
        <span className="body-coach-fab__glyph" aria-hidden>✦</span>
        <span className="body-coach-fab__label">IA coach</span>
      </button>
    </div>
  );
}

function ftpZones(ftp: number) {
  return [
    { name: 'Z1', range: `< ${Math.round(ftp * 0.55)}W`, label: 'recuperação ativa' },
    { name: 'Z2', range: `${Math.round(ftp * 0.56)}–${Math.round(ftp * 0.75)}W`, label: 'endurance' },
    { name: 'Z3', range: `${Math.round(ftp * 0.76)}–${Math.round(ftp * 0.90)}W`, label: 'tempo' },
    { name: 'Z4', range: `${Math.round(ftp * 0.91)}–${Math.round(ftp * 1.05)}W`, label: 'limiar' },
    { name: 'Z5', range: `${Math.round(ftp * 1.06)}–${Math.round(ftp * 1.20)}W`, label: 'VO₂máx' },
    { name: 'Z6', range: `> ${Math.round(ftp * 1.21)}W`, label: 'anaeróbico' },
  ];
}

const PERF_LABEL: Record<'under' | 'par' | 'over', { label: string; color: string; icon: string }> = {
  under: { label: 'abaixo do planejado', color: 'var(--mind)', icon: '↓' },
  par:   { label: 'dentro do planejado', color: 'var(--diet)', icon: '✓' },
  over:  { label: 'acima do planejado',  color: 'var(--body)', icon: '↑' },
};
const QUALITY_LABEL: Record<'poor' | 'good' | 'excellent', { label: string; color: string }> = {
  poor:      { label: 'execução irregular',      color: 'var(--body)' },
  good:      { label: 'execução consistente',    color: 'var(--diet)' },
  excellent: { label: 'execução excelente',      color: 'var(--mind)' },
};
const VERDICT_LABEL: Record<'progress' | 'maintenance' | 'caution' | 'overreach', { label: string; color: string; icon: string }> = {
  progress:    { label: 'evolução em curso',      color: 'var(--diet)',   icon: '↗' },
  maintenance: { label: 'manutenção',             color: 'var(--mind)',   icon: '→' },
  caution:     { label: 'atenção',                color: 'var(--body)',   icon: '!' },
  overreach:   { label: 'risco de sobrecarga',    color: 'var(--spirit)', icon: '⚠' },
};
const ENERGY_LABEL: Record<'low' | 'normal' | 'high', { label: string; color: string }> = {
  low:    { label: 'energia baixa esperada',   color: 'var(--body)' },
  normal: { label: 'energia normal esperada',  color: 'var(--diet)' },
  high:   { label: 'energia alta disponível',  color: 'var(--mind)' },
};

function FitAdjustmentsView({ adjustments }: { adjustments: import('../lib/trainingApi').WorkoutAdjustments }) {
  const perf = PERF_LABEL[adjustments.performance.level] ?? PERF_LABEL.par;
  const quality = adjustments.performance.quality ? QUALITY_LABEL[adjustments.performance.quality] : null;
  const verdict = adjustments.context?.verdict ? VERDICT_LABEL[adjustments.context.verdict] : null;
  const energy = ENERGY_LABEL[adjustments.energy.level] ?? ENERGY_LABEL.normal;

  return (
    <div className="fit-adjustments">
      {/* Performance — visual de destaque */}
      <div className="fit-adj-perf" style={{ '--adj-color': perf.color } as CSSProperties}>
        <div className="fit-adj-perf-head">
          <span className="fit-adj-perf-icon">{perf.icon}</span>
          <div className="fit-adj-perf-labels">
            <span className="fit-adj-perf-tag">{perf.label}</span>
            {quality && (
              <span className="fit-adj-quality-tag" style={{ color: quality.color, borderColor: quality.color }}>
                {quality.label}
              </span>
            )}
          </div>
        </div>
        <p>{adjustments.performance.summary}</p>
      </div>

      {/* Análise cruzada */}
      {adjustments.context && verdict && (
        <div className="fit-adj-context" style={{ '--adj-color': verdict.color } as CSSProperties}>
          <div className="fit-adj-context-head">
            <span className="fit-adj-context-icon">{verdict.icon}</span>
            <span className="fit-adj-context-label">análise cruzada · {verdict.label}</span>
          </div>
          {adjustments.context.factors.length > 0 && (
            <ul className="fit-adj-factors">
              {adjustments.context.factors.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
          <p>{adjustments.context.summary}</p>
        </div>
      )}

      <div className="fit-adj-grid">
        <div className="fit-adj-item fit-adj-item--auto">
          <div className="fit-adj-item-head">
            <span className="fit-adj-label">água</span>
            <span className="fit-adj-badge fit-adj-badge--auto">aplicado</span>
          </div>
          <strong>{adjustments.water.extra_ml > 0 ? `+${adjustments.water.extra_ml} ml` : 'sem ajuste'}</strong>
          <p>{adjustments.water.note}</p>
        </div>

        <div className="fit-adj-item fit-adj-item--auto">
          <div className="fit-adj-item-head">
            <span className="fit-adj-label">energia</span>
            <span className="fit-adj-badge fit-adj-badge--auto">aplicado</span>
          </div>
          <strong>{energy.label}</strong>
          <p>{adjustments.energy.note}</p>
        </div>

        <div className={`fit-adj-item fit-adj-item--suggest${adjustments.next_workout.changes ? ' fit-adj-item--has-change' : ''}`}>
          <div className="fit-adj-item-head">
            <span className="fit-adj-label">próximo treino</span>
            <span className={`fit-adj-badge${adjustments.next_workout.changes ? ' fit-adj-badge--change' : ''}`}>
              {adjustments.next_workout.changes ? 'sugestão' : 'sem mudança'}
            </span>
          </div>
          <p>{adjustments.next_workout.summary}</p>
        </div>

        <div className={`fit-adj-item fit-adj-item--suggest${adjustments.skin.changes ? ' fit-adj-item--has-change' : ''}`}>
          <div className="fit-adj-item-head">
            <span className="fit-adj-label">pele</span>
            <span className={`fit-adj-badge${adjustments.skin.changes ? ' fit-adj-badge--change' : ''}`}>
              {adjustments.skin.changes ? 'sugestão' : 'sem mudança'}
            </span>
          </div>
          <p>{adjustments.skin.summary}</p>
        </div>
      </div>
    </div>
  );
}

function FitMetricsGrid({ data }: { data: Record<string, unknown> }) {
  const metrics = fitMetrics(data);
  if (!metrics.length) return null;

  return (
    <div className="fit-metrics-grid">
      {metrics.map((metric) => (
        <div key={metric.label} className="fit-metric">
          <strong>{metric.value}</strong>
          <span>{metric.label}</span>
        </div>
      ))}
    </div>
  );
}

function fitMetrics(data: Record<string, unknown>) {
  const heartRate = objectValue(data.heart_rate);
  const power = objectValue(data.power);
  const cadence = objectValue(data.cadence);
  const speed = objectValue(data.speed);
  const elevation = objectValue(data.elevation);

  return [
    metric('duração', formatNumber(data.duration_min, ' min', 0)),
    metric('distância', formatNumber(data.distance_km, ' km', 1)),
    metric('FC média', formatNumber(data.avg_hr ?? heartRate.avg, ' bpm', 0)),
    metric('FC pico', formatNumber(data.max_hr ?? heartRate.max, ' bpm', 0)),
    metric('potência', formatNumber(data.avg_power ?? power.avg, ' W', 0)),
    metric('NP', formatNumber(data.normalized_power ?? power.normalized, ' W', 0)),
    metric('IF', formatNumber(power.intensity_factor_np ?? power.intensity_factor_avg, '', 2)),
    metric('cadência', formatNumber(data.avg_cadence ?? cadence.avg, ' rpm', 0)),
    metric('velocidade', formatNumber(data.avg_speed_kmh ?? speed.avg_kmh, ' km/h', 1)),
    metric('elevação', formatNumber(data.elevation_gain_m ?? elevation.gain_m, ' m', 0)),
    metric('calorias', formatNumber(data.calories, ' kcal', 0)),
    metric('registros', formatNumber(data.records, '', 0)),
  ].filter((item): item is { label: string; value: string } => Boolean(item));
}

function metric(label: string, value: string | null) {
  return value ? { label, value } : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function formatNumber(value: unknown, suffix: string, decimals: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${number.toFixed(decimals).replace(/\.0+$/, '')}${suffix}`;
}

const MODALITY_COLOR: Record<string, string> = {
  corrida: 'var(--skin)',
  pedal: 'var(--diet)',
  musculação: 'var(--body)',
  lpo: 'var(--spirit)',
};

type TrainingGroup = { key: string; label?: string; color?: string; blocks: TrainingDay['blocks'] };

function modalityLabel(modality: TrainingModality | 'rest' | undefined) {
  return modality && modality !== 'rest' ? MODALITY_LABEL[modality] : undefined;
}

function TrainingSessionCard({
  day, label, checks, onToggle, isToday, getGroups, userId,
}: {
  day: TrainingDay;
  label: string;
  checks: Record<string, boolean>;
  onToggle: (groupKey: string) => void;
  isToday: boolean;
  getGroups: (blocks: TrainingDay['blocks']) => TrainingGroup[];
  userId: string | null;
}) {
  const isStrengthGroup = (label?: string) => {
    if (!label) return false;
    const t = label.toLowerCase();
    return t.includes('musculação') || t.includes('musculacao') || t.includes('lpo') || t.includes('força') || t.includes('forca');
  };
  const groups = getGroups(day.blocks ?? []);

  return (
    <section className={`card training-session-card${isToday ? ' training-session-card--today' : ''}`}>
      <div className="training-session-header">
        <span className="eyebrow training-session-kicker">{label}</span>
        <h2 className="training-today-title">{day.title}</h2>
        <div className="training-session-meta">
          {day.duration_min > 0 && <span className="training-duration">{day.duration_min} min</span>}
          <span className="training-intensity">{INTENSITY_LABEL[day.intensity]}</span>
        </div>
      </div>

      <div className="training-modalities">
        {groups.map((group) => {
          const isDone = Boolean(checks[`${day.day_index}:${group.key}`]);
          const color = group.color ?? 'var(--body)';
          return (
            <div
              key={group.key}
              className={`training-modality${isDone ? ' training-modality--done' : ''}`}
              style={{ '--mod-color': color } as CSSProperties}
            >
              {group.label && (
                <div className="training-modality-header">
                  <span className="training-modality-label">bloco · {group.label}</span>
                </div>
              )}

              {trainingSectionsFor(group.blocks ?? []).map((section, bi) => (
                <div key={section.id} className="training-section">
                  {bi > 0 && <div className="training-section-divider" />}
                  <div className="training-section-head">
                    <span className="training-section-icon">{section.icon}</span>
                    <span className="training-section-title">{section.title}</span>
                    {section.duration && <span className="training-block-dur">{section.duration}</span>}
                  </div>
                  <TrainingSectionText
                    content={section.content}
                    sectionId={section.id}
                    allowLoadInput={isStrengthGroup(group.label) && section.id === 'main'}
                    userId={userId}
                    date={day.date}
                  />
                </div>
              ))}

              <button
                className={`training-modality-check${isDone ? ' training-modality-check--done' : ''}`}
                onClick={() => onToggle(group.key)}
              >
                <span className="training-modality-check-circle">{isDone ? '✓' : ''}</span>
                <span>{isDone ? 'treino concluído' : 'marcar como feito'}</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function writeWorkoutSummary(date: string, done: number, total: number, userId: string | null) {
  try {
    localStorage.setItem(
      scopedStorageKey(`full-ritual-workout-summary-${date}`, userId),
      JSON.stringify({
        done,
        total,
        updated_at: new Date().toISOString(),
      }),
    );
  } catch {
    // Local score sync is best-effort; the workout check itself still works.
  }
}

function trainingSectionsFor(blocks: TrainingDay['blocks']) {
  const buckets: Record<'warmup' | 'main' | 'cooldown', {
    id: string;
    icon: string;
    title: string;
    duration?: string;
    content: string;
  }> = {
    warmup: { id: 'warmup', icon: '↗', title: 'aquecimento', content: '' },
    main: { id: 'main', icon: '◆', title: 'série', content: '' },
    cooldown: { id: 'cooldown', icon: '↘', title: 'desaquecimento', content: '' },
  };

  for (const block of blocks) {
    const bucket = trainingSectionBucket(block.title);
    const current = buckets[bucket];
    current.duration = current.duration ?? block.duration;
    current.content = [current.content, block.content].filter(Boolean).join('\n\n');
  }

  return (['warmup', 'main', 'cooldown'] as const)
    .map((key) => buckets[key])
    .filter((section) => section.content.trim().length > 0);
}

function trainingSectionBucket(title: string): 'warmup' | 'main' | 'cooldown' {
  const normalized = title.toLowerCase();
  if (normalized.includes('aquec')) return 'warmup';
  if (normalized.includes('desaquec') || normalized.includes('volta calma') || normalized.includes('acessório')) return 'cooldown';
  return 'main';
}

function TrainingSectionText({
  content, sectionId, allowLoadInput = false, userId = null, date,
}: {
  content: string;
  sectionId: string;
  allowLoadInput?: boolean;
  userId?: string | null;
  date?: string;
}) {
  const isMain = sectionId === 'main';
  const rows = trainingTextRows(content, { splitInline: !isMain, splitCompoundExercises: isMain });

  return (
    <div className={isMain ? 'training-exercise-list' : 'training-section-content-list'}>
      {rows.map((row, index) => (
        isMain ? (
          <TrainingExerciseRow
            key={`${row.slice(0, 20)}-${index}`}
            row={row}
            allowLoadInput={allowLoadInput}
            userId={userId}
            date={date}
          />
        ) : (
          <p
            key={`${row.slice(0, 20)}-${index}`}
            className={`training-section-content training-section-content--${trainingLineKind(row)}`}
          >
            <span className="training-line-dot" aria-hidden="true" />
            <span>{row}</span>
          </p>
        )
      ))}
    </div>
  );
}

function TrainingExerciseRow({
  row, allowLoadInput = false, userId = null, date,
}: {
  row: string;
  allowLoadInput?: boolean;
  userId?: string | null;
  date?: string;
}) {
  const parsed = parseTrainingExercise(row);
  if (!parsed) {
    return (
      <p className={`training-section-content training-section-content--${trainingLineKind(row)}`}>
        <span className="training-line-dot" aria-hidden="true" />
        <span>{row}</span>
      </p>
    );
  }

  const showLoad =
    allowLoadInput &&
    parsed.kind === 'exercise' &&
    !!date &&
    exerciseTakesLoad(parsed.title);

  return (
    <article className={`training-exercise-item training-exercise-item--${parsed.kind}`}>
      <div className="training-exercise-main">
        <strong>{parsed.title}</strong>
        {parsed.description && <p>{parsed.description}</p>}
      </div>
      {parsed.chips.length > 0 && (
        <div className="training-exercise-chips">
          {parsed.chips.map((chip) => (
            <span key={chip} className={chipClassName(chip)}>{chip}</span>
          ))}
        </div>
      )}
      {showLoad && (
        <LoadField
          title={parsed.title}
          userId={userId}
          date={date!}
        />
      )}
    </article>
  );
}

function LoadField({
  title, userId, date,
}: {
  title: string;
  userId: string | null;
  date: string;
}) {
  const storageKey = `full-ritual-load-${date}-${exerciseKey(title)}`;
  const [value, setValue] = useLocalState<string>(storageKey, '');

  useEffect(() => {
    if (!userId || value) return;
    let alive = true;
    void fetchWorkoutLoad({ userId, date, title }).then((load) => {
      if (!alive || !load?.load_kg) return;
      setValue(String(load.load_kg));
    });
    return () => {
      alive = false;
    };
  }, [date, title, userId, value, setValue]);

  const commit = () => {
    const num = Number(value.replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) return;
    if (!userId) return;
    void upsertWorkoutLoad({ userId, date, title, load_kg: num });
  };

  return (
    <label className="training-exercise-load">
      <span>carga</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.5}
        placeholder="kg"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
      />
      <span className="training-exercise-load__unit">kg</span>
    </label>
  );
}

function trainingTextRows(
  content: string,
  { splitInline, splitCompoundExercises }: { splitInline: boolean; splitCompoundExercises: boolean },
) {
  return content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      if (splitCompoundExercises && /\s·\s(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^·]+?\s—\s)/.test(line)) {
        return line.split(/\s·\s(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^·]+?\s—\s)/).map((part) => part.trim()).filter(Boolean);
      }
      const shouldSplitByDots =
        splitInline
        &&
        /\s·\s/.test(line)
        && !/^(A|B|C|D|E)?\d+\.|^Z\d|^RPE|^Foco|^Rec:|^↳/.test(line);
      return shouldSplitByDots ? line.split(/\s·\s/).map((part) => part.trim()).filter(Boolean) : [line];
    })
    .filter((line) => !/^↳?\s*temporada:\s*(não|nao|no|n)$/i.test(line))
    .map((line) => (/^Z1\.?$/i.test(line)
      ? 'Z1 leve, soltando as pernas e baixando a frequência cardíaca.'
      : line));
}

function parseTrainingExercise(row: string): {
  title: string;
  description?: string;
  chips: string[];
  kind: 'exercise' | 'bike' | 'cue';
} | null {
  const clean = row.replace(/^(A|B|C|D|E)?\d+\.\s*/i, '').trim();
  const separator = clean.match(/\s—\s|\s-\s/);

  if (separator) {
    const [rawTitle, ...rest] = clean.split(/\s—\s|\s-\s/);
    const details = rest.join(' — ').trim();
    const parts = details.split(/\s·\s/).map((part) => part.trim()).filter(Boolean);
    const chips = parts.filter(isTrainingMetric);
    const description = parts.filter((part) => !isTrainingMetric(part)).join(' · ');
    return {
      title: rawTitle.trim(),
      description: description || undefined,
      chips: chips.length ? chips : [],
      kind: isBikeRow(clean) ? 'bike' : 'exercise',
    };
  }

  if (/^(RPE|Rec:|Foco|Z\d|cad|pot[eê]ncia|Se FC|Consistência|Conversa|Cadência)/i.test(clean)) {
    return {
      title: clean,
      chips: [],
      kind: isBikeRow(clean) ? 'bike' : 'cue',
    };
  }

  return null;
}

function isTrainingMetric(part: string) {
  return /(\d+\s*[×x]\s*\d+|RPE|desc|rec|cad|rpm|W\b|Z\d|FC|ppm|%|min|s\b|km|CHO|ml\/h)/i.test(part)
    && part.length <= 34;
}

function isBikeRow(row: string) {
  return /(Z\d|RPE|cad|rpm|W\b|pot[eê]ncia|pedal|rolo|ERG|CHO|eletr[oó]litos)/i.test(row);
}

function chipClassName(chip: string) {
  if (/RPE/i.test(chip)) return 'training-exercise-chip training-exercise-chip--rpe';
  if (/desc|rec/i.test(chip)) return 'training-exercise-chip training-exercise-chip--rest';
  if (/cad|rpm|W\b|Z\d|pot[eê]ncia|%/i.test(chip)) return 'training-exercise-chip training-exercise-chip--bike';
  return 'training-exercise-chip';
}

function trainingLineKind(row: string) {
  if (/^(A|B|C|D|E)?\d+\.|^Z\d|^RPE/.test(row)) return 'key';
  if (/^Foco|^Rec:|^↳|Joelhos|Escápulas|Glúteo|Cotovelos|Use|Se manteve|Ativa/i.test(row)) return 'cue';
  return 'normal';
}

function relativeDayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff === -1) return 'ontem';
  return date.toLocaleDateString('pt-BR', { weekday: 'long' }).toLowerCase();
}
