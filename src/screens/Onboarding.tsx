import { useMemo, useState } from 'react';
import { supabase, hasSupabase } from '../lib/supabase';
import { useApp } from '../store/useStore';
import type {
  ContentPref, DimensionKey, MusicPref, SkinType, SpiritTheme,
} from '../types';

// ─── opções ────────────────────────────────────────────────────────────────

const SKIN_TYPES: { value: SkinType; label: string; desc: string }[] = [
  { value: 'oleosa',   label: 'Oleosa',   desc: 'brilho ao longo do dia' },
  { value: 'mista',    label: 'Mista',    desc: 'zona T oleosa, bochechas normais' },
  { value: 'seca',     label: 'Seca',     desc: 'sensação de tensão, opaca' },
  { value: 'sensivel', label: 'Sensível', desc: 'reage facilmente, avermelha' },
  { value: 'normal',   label: 'Normal',   desc: 'equilibrada, poucos problemas' },
];

const CONTENT: { value: ContentPref; label: string }[] = [
  { value: 'longevidade',  label: 'longevidade'  },
  { value: 'neurociencia', label: 'neurociência' },
  { value: 'filosofia',    label: 'filosofia'    },
  { value: 'performance',  label: 'performance'  },
  { value: 'literatura',   label: 'literatura'   },
  { value: 'ciencia',      label: 'ciência'      },
  { value: 'negocios',     label: 'negócios'     },
  { value: 'arte',         label: 'arte'         },
];

const MUSIC: { value: MusicPref; label: string }[] = [
  { value: 'focus',      label: 'foco'      },
  { value: 'ambient',    label: 'ambient'   },
  { value: 'classical',  label: 'clássico'  },
  { value: 'brazilian',  label: 'brasileira'},
  { value: 'electronic', label: 'eletrônica'},
  { value: 'jazz',       label: 'jazz'      },
  { value: 'silence',    label: 'silêncio'  },
];

const SPIRIT_THEMES: { value: SpiritTheme; label: string }[] = [
  { value: 'gratidao',       label: 'gratidão'       },
  { value: 'proposito',      label: 'propósito'      },
  { value: 'ancestralidade', label: 'ancestralidade' },
  { value: 'presenca',       label: 'presença'       },
  { value: 'silencio',       label: 'silêncio'       },
  { value: 'natureza',       label: 'natureza'       },
  { value: 'criatividade',   label: 'criatividade'   },
];

const DIMENSIONS_CONFIG: { key: DimensionKey; label: string; color: string; desc: string }[] = [
  { key: 'skin',   label: 'Pele',     color: 'var(--skin)',   desc: 'rotina de skincare e autocuidado' },
  { key: 'body',   label: 'Corpo',    color: 'var(--body)',   desc: 'treinos, composição e movimento' },
  { key: 'mind',   label: 'Mente',    color: 'var(--mind)',   desc: 'leitura, foco e saúde cognitiva' },
  { key: 'diet',   label: 'Dieta',    color: 'var(--diet)',   desc: 'alimentação, água e nutrição' },
  { key: 'spirit', label: 'Espírito', color: 'var(--spirit)', desc: 'intenção, presença e emoções' },
];

// ─── helpers ───────────────────────────────────────────────────────────────

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
}

// ─── step types ────────────────────────────────────────────────────────────

type StepId =
  | 'nome'
  | 'sexo'
  | 'dimensoes'
  | 'pele'
  | 'mente'
  | 'dieta'
  | 'espirito'
  | 'ciclo'
  | 'pronto';

interface StepMeta {
  label: string;
  subtitle: string;
  color: string;
}

const STEP_META: Record<StepId, StepMeta> = {
  nome:            { label: 'quem é você?',           subtitle: 'para começar',           color: 'var(--gold)'   },
  sexo:            { label: 'seu corpo',               subtitle: 'para personalizar',      color: 'var(--skin)'   },
  dimensoes:       { label: 'suas dimensões',          subtitle: 'ative ou desative',      color: 'var(--gold)'   },
  pele:            { label: 'sua pele',               subtitle: 'dimensão · Pele',       color: 'var(--skin)'   },
  mente:           { label: 'sua mente',              subtitle: 'dimensão · Mente',      color: 'var(--mind)'   },
  dieta:           { label: 'sua dieta',              subtitle: 'dimensão · Dieta',      color: 'var(--diet)'   },
  espirito:        { label: 'sua essência',           subtitle: 'dimensão · Espírito',   color: 'var(--spirit)' },
  ciclo:           { label: 'seu ciclo',              subtitle: 'dimensão · Ciclo',      color: 'var(--skin)'   },
  pronto:          { label: 'tudo pronto.',           subtitle: 'Full Ritual',           color: 'var(--gold)'   },
};

// ─── componentes de UI internos ────────────────────────────────────────────

function Pill({
  label, active, color, onClick,
}: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 18px', borderRadius: 999, fontSize: 14, fontWeight: 600,
        background: active ? color : 'rgba(58,31,22,0.06)',
        color: active ? '#fff' : 'var(--chocolate)',
        border: `1.5px solid ${active ? color : 'rgba(58,31,22,0.12)'}`,
        transition: 'all 180ms',
      }}
    >
      {label}
    </button>
  );
}

function CardOption({
  label, hint, active, color, onClick,
}: { label: string; hint?: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', borderRadius: 16, textAlign: 'left', width: '100%',
        background: active ? `color-mix(in srgb, ${color} 12%, transparent)` : 'rgba(58,31,22,0.04)',
        border: `1.5px solid ${active ? color : 'rgba(58,31,22,0.10)'}`,
        transition: 'all 180ms',
      }}
    >
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: active ? color : 'var(--chocolate)' }}>
          {label}
        </div>
        {hint && (
          <div style={{ fontSize: 13, color: 'var(--chocolate)', opacity: 0.48, marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${active ? color : 'rgba(58,31,22,0.2)'}`,
        background: active ? color : 'transparent',
        display: 'grid', placeItems: 'center', transition: 'all 180ms',
      }}>
        {active && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <polyline points="2 6 5 9 10 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </button>
  );
}

function NumericInput({
  label, value, onChange, unit, min, max, step = 1,
}: { label: string; value: number | ''; onChange: (v: number | '') => void; unit: string; min: number; max: number; step?: number }) {
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--chocolate)', opacity: 0.55, display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="number" min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          style={{
            flex: 1, padding: '12px 16px',
            background: 'rgba(58,31,22,0.05)',
            border: '1.5px solid rgba(58,31,22,0.14)',
            color: 'var(--chocolate)', borderRadius: 12,
            fontSize: 16, fontWeight: 600, outline: 'none',
          }}
        />
        <span style={{ fontSize: 13, color: 'var(--chocolate)', opacity: 0.45, flexShrink: 0 }}>{unit}</span>
      </div>
    </div>
  );
}

// ─── componente principal ──────────────────────────────────────────────────

export function Onboarding() {
  const userId = useApp((s) => s.userId);
  const profile = useApp((s) => s.profile);
  const setProfile = useApp((s) => s.setProfile);
  const setActiveDimensions = useApp((s) => s.setActiveDimensions);
  const activeDimensions = useApp((s) => s.activeDimensions);
  const storeSexo = useApp((s) => s.sexo);
  const setSexoStore = useApp((s) => s.setSexo);
  const goTo = useApp((s) => s.goTo);

  // modo: 'setup' = primeiro onboarding, 'reconfig' = editar dimensões depois
  const isReconfig = !!(profile?.onboarding_completed);

  // dados básicos
  const [name, setName] = useState(profile?.name ?? '');
  const [birthdate, setBirthdate] = useState(profile?.birthdate ?? '');
  const [sexo, setSexo] = useState<'masculino' | 'feminino' | 'outro' | null>(
    storeSexo ?? (profile?.cycle_tracking ? 'feminino' : null)
  );

  // dimensões escolhidas — no reconfig parte das ativas
  const [dims, setDims] = useState<DimensionKey[]>(
    isReconfig ? activeDimensions : []
  );
  // quais dimensões eram novas (não estavam ativas antes) no reconfig
  const prevDims = isReconfig ? activeDimensions : [];

  // pele
  const [skinType, setSkinType] = useState<SkinType | null>(null);

  // mente
  const [contentPrefs, setContentPrefs] = useState<ContentPref[]>([]);
  const [musicPrefs, setMusicPrefs] = useState<MusicPref[]>([]);
  const [goalReadingPages, setGoalReadingPages] = useState<number | ''>(20);
  const [goalMeditationMin, setGoalMeditationMin] = useState<number | ''>(10);

  // dieta
  const [dietSetupMode, setDietSetupMode] = useState<'existing_plan' | 'needs_ai_nutri' | null>(null);

  // espírito
  const [spiritThemes, setSpiritThemes] = useState<SpiritTheme[]>([]);

  // ciclo
  const [cycleTracking, setCycleTracking] = useState(false);
  const [cycleLength, setCycleLength] = useState<number | ''>(28);

  const [saving, setSaving] = useState(false);

  // ─── sequência de steps dinâmica ──────────────────────────────────────

  const steps = useMemo<StepId[]>(() => {
    // no reconfig só adiciona perguntas para dimensões recém-adicionadas
    const newDims = isReconfig ? dims.filter(d => !prevDims.includes(d)) : dims;
    const base: StepId[] = isReconfig ? ['dimensoes'] : ['nome', 'sexo', 'dimensoes'];
    if (newDims.includes('skin'))   base.push('pele');
    if (newDims.includes('mind'))   base.push('mente');
    if (newDims.includes('diet'))   base.push('dieta');
    if (newDims.includes('spirit')) base.push('espirito');
    if (!isReconfig && (sexo === 'feminino' || sexo === 'outro') && dims.length > 0) base.push('ciclo');
    if (isReconfig && (sexo === 'feminino' || sexo === 'outro') && newDims.length > 0) base.push('ciclo');
    base.push('pronto');
    return base;
  }, [dims, sexo, isReconfig, prevDims]);

  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];
  const meta = STEP_META[step];
  const progress = (stepIdx / (steps.length - 1)) * 100;

  const next = () => setStepIdx(i => Math.min(i + 1, steps.length - 1));
  const back = () => setStepIdx(i => Math.max(i - 1, 0));

  const canAdvance = (): boolean => {
    if (step === 'nome') return name.trim().length > 0;
    if (step === 'sexo') return sexo !== null;
    if (step === 'dimensoes') return dims.length > 0;
    if (step === 'dieta') return dietSetupMode !== null;
    return true; // restantes opcionais
  };

  // ─── salvar ───────────────────────────────────────────────────────────

  const finish = async () => {
    setSaving(true);

    const now = new Date().toISOString();
    const selectedDims = dims.length > 0 ? dims : (['skin', 'body', 'mind', 'diet', 'spirit'] as DimensionKey[]);

    const profilePayload = {
      id: userId ?? 'local',
      name: name.trim() || 'voce',
      birthdate: birthdate || null,
      biological_sex: sexo,
      skin_type: skinType,
      sport_modalities: profile?.sport_modalities ?? [],
      music_prefs: musicPrefs,
      content_prefs: contentPrefs,
      spirit_themes: spiritThemes,
      photo_url: null,
      cycle_tracking: cycleTracking,
      cycle_length: cycleTracking ? (Number(cycleLength) || 28) : 28,
      cycle_start: null,
      target_weight_kg: profile?.target_weight_kg ?? null,
      target_weight_kg_max: profile?.target_weight_kg_max ?? null,
      target_body_fat_pct: profile?.target_body_fat_pct ?? null,
      target_date: profile?.target_date ?? null,
      ai_enabled: true,
      notifications_enabled: true,
      goal_sleep_h: profile?.goal_sleep_h ?? 8,
      goal_water_l: profile?.goal_water_l ?? null,
      goal_meditation_min: goalMeditationMin !== '' ? Number(goalMeditationMin) : 10,
      goal_reading_pages: goalReadingPages !== '' ? Number(goalReadingPages) : 20,
      selected_dimensions: selectedDims,
      onboarding_completed: true,
      onboarding_version: '2',
    };

    if (hasSupabase && userId) {
      // perfil principal
      const { data } = await supabase.from('profiles').upsert({
        ...profilePayload,
        onboarding_completed_at: now,
      }).select('*').single();
      if (data) setProfile(data);

      if (dims.includes('diet') && dietSetupMode) {
        await supabase.from('diet_plans').upsert({
          user_id: userId,
          manual_foods: [],
          pdf_url: null,
          pdf_name: null,
          notes: null,
          setup_mode: dietSetupMode,
          nutri_configured: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      }
    } else {
      setProfile({
        ...profilePayload,
        onboarding_completed_at: now,
        created_at: now,
        updated_at: now,
      } as Parameters<typeof setProfile>[0]);
    }

    setSaving(false);
    setActiveDimensions(dims.length > 0 ? dims : ['skin', 'body', 'mind', 'diet', 'spirit']);
    setSexoStore(sexo);
    goTo('home');
  };

  // ─── render dos steps ──────────────────────────────────────────────────

  const renderStep = () => {
    const c = meta.color;

    if (step === 'nome') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={sub}>Como quer ser chamada aqui dentro?</p>
        <input
          autoFocus type="text" placeholder="seu nome"
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && canAdvance() && next()}
          style={textInput}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={fieldLabel}>Data de nascimento (opcional)</label>
          <input
            type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)}
            style={{ ...textInput, fontSize: 14, color: birthdate ? 'var(--chocolate)' : 'rgba(58,31,22,0.35)' }}
          />
        </div>
      </div>
    );

    if (step === 'sexo') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={sub}>Isso personaliza algumas funcionalidades do app.</p>
        {(['feminino', 'masculino', 'outro'] as const).map(s => (
          <CardOption key={s} label={s} active={sexo === s} color={c} onClick={() => setSexo(s)} />
        ))}
      </div>
    );

    if (step === 'dimensoes') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={sub}>Escolha as dimensões que quer acompanhar. Você pode mudar isso depois.</p>
        {DIMENSIONS_CONFIG.map(d => (
          <CardOption
            key={d.key} label={d.label} hint={d.desc}
            active={dims.includes(d.key)} color={d.color}
            onClick={() => setDims(toggle(dims, d.key))}
          />
        ))}
      </div>
    );

    if (step === 'pele') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={sub}>Qual é o tipo da sua pele?</p>
        {SKIN_TYPES.map(({ value, label, desc }) => (
          <CardOption key={value} label={label} hint={desc} active={skinType === value} color={c}
            onClick={() => setSkinType(value)} />
        ))}
      </div>
    );

    if (step === 'mente') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <label style={{ ...fieldLabel, display: 'block', marginBottom: 10 }}>Temas de interesse</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CONTENT.map(c2 => (
              <Pill key={c2.value} label={c2.label} active={contentPrefs.includes(c2.value)} color={c}
                onClick={() => setContentPrefs(toggle(contentPrefs, c2.value))} />
            ))}
          </div>
        </div>
        <div>
          <label style={{ ...fieldLabel, display: 'block', marginBottom: 10 }}>Música para foco</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MUSIC.map(m => (
              <Pill key={m.value} label={m.label} active={musicPrefs.includes(m.value)} color={c}
                onClick={() => setMusicPrefs(toggle(musicPrefs, m.value))} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <NumericInput label="Meta de leitura" value={goalReadingPages} onChange={setGoalReadingPages} unit="páginas/dia" min={1} max={200} />
          <NumericInput label="Meta de meditação" value={goalMeditationMin} onChange={setGoalMeditationMin} unit="minutos/dia" min={1} max={120} />
        </div>
      </div>
    );

    if (step === 'dieta') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <p style={sub}>Escolha só o ponto de partida. Meta de água fica dentro da dimensão Dieta; peso e objetivo ficam no IA NUTRI.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CardOption
            label="Já possuo uma dieta"
            hint="ao entrar no app, você poderá subir o PDF ou inserir manualmente"
            active={dietSetupMode === 'existing_plan'}
            color={c}
            onClick={() => setDietSetupMode('existing_plan')}
          />
          <CardOption
            label="Não possuo dieta"
            hint="a dimensão Dieta vai abrir um formulário para configurar o IA Nutri"
            active={dietSetupMode === 'needs_ai_nutri'}
            color={c}
            onClick={() => setDietSetupMode('needs_ai_nutri')}
          />
        </div>
      </div>
    );

    if (step === 'espirito') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={sub}>O que ressoa com você?</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SPIRIT_THEMES.map(t => (
            <Pill key={t.value} label={t.label} active={spiritThemes.includes(t.value)} color={c}
              onClick={() => setSpiritThemes(toggle(spiritThemes, t.value))} />
          ))}
        </div>
      </div>
    );

    if (step === 'ciclo') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={sub}>Quer acompanhar seu ciclo menstrual no app?</p>
        <CardOption label="Sim, quero acompanhar" active={cycleTracking} color={c}
          onClick={() => setCycleTracking(true)} />
        <CardOption label="Não por enquanto" active={!cycleTracking} color={c}
          onClick={() => setCycleTracking(false)} />
        {cycleTracking && (
          <NumericInput label="Duração média do ciclo" value={cycleLength} onChange={setCycleLength}
            unit="dias" min={21} max={45} />
        )}
      </div>
    );

    if (step === 'pronto') return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 16, gap: 14 }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--grad-gold)', display: 'grid', placeItems: 'center',
          boxShadow: 'var(--glow-gold)',
        }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#2B130E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--chocolate)' }}>
          Oi, {name || 'você'}!
        </h3>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--chocolate)', opacity: 0.58, lineHeight: 1.6, maxWidth: 260 }}>
          Seu ritual está pronto. Você pode ajustar qualquer coisa depois no seu perfil ou em cada dimensão.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 4 }}>
          {dims.map(d => {
            const dc = DIMENSIONS_CONFIG.find(x => x.key === d)!;
            return (
              <span key={d} style={{
                padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: `color-mix(in srgb, ${dc.color} 15%, transparent)`,
                color: dc.color, border: `1px solid color-mix(in srgb, ${dc.color} 30%, transparent)`,
              }}>
                {dc.label}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── estilos compartilhados ────────────────────────────────────────────

  const sub: React.CSSProperties = {
    margin: '0 0 4px', fontSize: 15, color: 'var(--chocolate)', opacity: 0.58, lineHeight: 1.5,
  };
  const textInput: React.CSSProperties = {
    width: '100%', padding: '15px 18px',
    background: 'rgba(58,31,22,0.05)', border: '1.5px solid rgba(58,31,22,0.16)',
    color: 'var(--chocolate)', borderRadius: 14, fontSize: 18, fontWeight: 600, outline: 'none',
  };
  const fieldLabel: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    color: 'var(--chocolate)', opacity: 0.45,
  };

  const isLastContent = step !== 'pronto';
  const isOptionalStep = !['nome', 'sexo', 'dimensoes'].includes(step);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'var(--ivory)',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>
      {/* barra de progresso */}
      <div style={{ height: 3, background: 'rgba(58,31,22,0.08)', flexShrink: 0 }}>
        <div style={{
          height: '100%', width: `${progress}%`,
          background: meta.color, transition: 'width 380ms var(--e-out), background 380ms',
        }} />
      </div>

      {/* header */}
      <div style={{ padding: '22px 26px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: meta.color }}>
              {meta.subtitle}
            </p>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--chocolate)', lineHeight: 1.1 }}>
              {meta.label}
            </h2>
          </div>
          {(stepIdx > 0 || isReconfig) && (
            <button
              onClick={stepIdx > 0 ? back : () => goTo('home')}
              style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                display: 'grid', placeItems: 'center',
                background: 'radial-gradient(circle at 35% 24%, rgba(255,255,255,0.92), rgba(251,246,235,0.72) 42%, rgba(200,181,140,0.22) 100%), var(--paper)',
                border: '1px solid rgba(212,162,76,0.32)',
                color: 'var(--chocolate)',
              }}
              aria-label="voltar"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
                <path d="M14.5 7.25 9.75 12l4.75 4.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10.25 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M7.25 7.75c-1.5 1.15-2.35 2.6-2.35 4.25s.85 3.1 2.35 4.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* conteúdo scrollável */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 26px 0' }}>
        {renderStep()}
      </div>

      {/* rodapé com botões */}
      <div style={{ padding: '20px 26px 36px', flexShrink: 0 }}>
        {step !== 'pronto' ? (
          <>
            <button
              onClick={next}
              disabled={!canAdvance()}
              style={{
                width: '100%', padding: '16px', borderRadius: 999,
                background: meta.color, color: '#fff',
                fontWeight: 700, fontSize: 15, letterSpacing: '0.02em',
                opacity: canAdvance() ? 1 : 0.3,
                transition: 'opacity 180ms',
              }}
            >
              {isLastContent ? 'continuar' : 'continuar'}
            </button>
            {isOptionalStep && (
              <button onClick={next} style={{
                width: '100%', padding: '12px', marginTop: 6,
                color: 'var(--chocolate)', opacity: 0.35, fontSize: 13, fontWeight: 500,
              }}>
                pular
              </button>
            )}
          </>
        ) : (
          <button
            onClick={finish} disabled={saving}
            style={{
              width: '100%', padding: '16px', borderRadius: 999,
              background: 'var(--chocolate)', color: 'var(--ivory)',
              fontWeight: 700, fontSize: 15, letterSpacing: '0.02em',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'salvando…' : 'começar meu ritual'}
          </button>
        )}
      </div>
    </div>
  );
}
