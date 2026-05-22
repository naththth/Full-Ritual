import { useState, useEffect } from 'react';
import { useApp } from '../store/useStore';
import { supabase, hasSupabase } from '../lib/supabase';
import { useAutoSave } from '../lib/useAutoSave';
import type {
  Profile as ProfileData, SkinType, SportModality, MusicPref, ContentPref, SpiritTheme,
} from '../types';

const SKIN_TYPES: { value: SkinType; label: string }[] = [
  { value: 'oleosa',   label: 'oleosa' },
  { value: 'mista',    label: 'mista' },
  { value: 'seca',     label: 'seca' },
  { value: 'sensivel', label: 'sensível' },
  { value: 'normal',   label: 'normal' },
];

const SPORTS: { value: SportModality; label: string }[] = [
  { value: 'natacao',     label: 'natação' },
  { value: 'ciclismo',    label: 'ciclismo' },
  { value: 'corrida',     label: 'corrida' },
  { value: 'forca',       label: 'força' },
  { value: 'yoga',        label: 'yoga' },
  { value: 'pilates',     label: 'pilates' },
  { value: 'mobilidade',  label: 'mobilidade' },
  { value: 'caminhada',   label: 'caminhada' },
];

const MUSIC: { value: MusicPref; label: string }[] = [
  { value: 'focus',      label: 'foco' },
  { value: 'ambient',    label: 'ambient' },
  { value: 'classical',  label: 'clássico' },
  { value: 'brazilian',  label: 'brasileira' },
  { value: 'electronic', label: 'eletrônica' },
  { value: 'jazz',       label: 'jazz' },
  { value: 'silence',    label: 'silêncio' },
];

const CONTENT: { value: ContentPref; label: string }[] = [
  { value: 'longevidade',   label: 'longevidade' },
  { value: 'neurociencia',  label: 'neurociência' },
  { value: 'filosofia',     label: 'filosofia' },
  { value: 'performance',   label: 'performance' },
  { value: 'literatura',    label: 'literatura' },
  { value: 'ciencia',       label: 'ciência' },
  { value: 'negocios',      label: 'negócios' },
  { value: 'arte',          label: 'arte' },
];

const SPIRIT: { value: SpiritTheme; label: string }[] = [
  { value: 'gratidao',        label: 'gratidão' },
  { value: 'proposito',       label: 'propósito' },
  { value: 'ancestralidade',  label: 'ancestralidade' },
  { value: 'presenca',        label: 'presença' },
  { value: 'silencio',        label: 'silêncio' },
  { value: 'natureza',        label: 'natureza' },
  { value: 'criatividade',    label: 'criatividade' },
];

export function Profile() {
  const profile = useApp((s) => s.profile);
  const userId = useApp((s) => s.userId);
  const setProfile = useApp((s) => s.setProfile);
  const showToast = useApp((s) => s.showToast);
  const activeDimensions = useApp((s) => s.activeDimensions);
  const sexoStore = useApp((s) => s.sexo);
  const setSexoStore = useApp((s) => s.setSexo);

  const hasSkin   = activeDimensions.includes('skin');
  const hasBody   = activeDimensions.includes('body');
  const hasMind   = activeDimensions.includes('mind');
  const hasDiet   = activeDimensions.includes('diet');
  const hasSpirit = activeDimensions.includes('spirit');
  const hasCycle  = sexoStore === 'feminino' || sexoStore === 'outro';

  const [name, setName] = useState(profile?.name ?? '');
  const [birthdate, setBirthdate] = useState(profile?.birthdate ?? '');
  const [skinType, setSkinType] = useState<SkinType | null>(profile?.skin_type ?? null);
  const [sports, setSports] = useState<SportModality[]>(profile?.sport_modalities ?? []);
  const [music, setMusic] = useState<MusicPref[]>(profile?.music_prefs ?? []);
  const [content, setContent] = useState<ContentPref[]>(profile?.content_prefs ?? []);
  const [themes, setThemes] = useState<SpiritTheme[]>(profile?.spirit_themes ?? []);
  const [photoUrl, setPhotoUrl] = useState<string | null>(profile?.photo_url ?? null);
  const [goalSleepH, setGoalSleepH] = useState(profile?.goal_sleep_h ?? 8);
  const [goalWaterL, setGoalWaterL] = useState(profile?.goal_water_l ?? 2.5);
  const [goalMeditationMin, setGoalMeditationMin] = useState(profile?.goal_meditation_min ?? 10);
  const [goalReadingPages, setGoalReadingPages] = useState(profile?.goal_reading_pages ?? 20);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Carrega perfil do banco se autenticado
    if (!hasSupabase || !userId) return;
    supabase.from('profiles').select('*').eq('id', userId).single().then(({ data }) => {
      if (data) setProfile(data);
    });
  }, [userId, setProfile]);

  const toggle = <T extends string>(arr: T[], v: T, setter: (n: T[]) => void) => {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  const handlePhoto = async (file: File) => {
    if (!hasSupabase || !userId) {
      // Modo offline: preview local apenas
      const reader = new FileReader();
      reader.onload = () => setPhotoUrl(reader.result as string);
      reader.readAsDataURL(file);
      return;
    }
    const path = `${userId}/avatar-${Date.now()}.${file.name.split('.').pop()}`;
    const { data, error } = await supabase.storage.from('avatars').upload(path, file, {
      cacheControl: '3600',
      upsert: true,
    });
    if (error) {
      showToast('não foi possível enviar a foto.');
      return;
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(data.path);
    setPhotoUrl(pub.publicUrl);
  };

  const saveKey = JSON.stringify({
    name, birthdate, skinType, sports, music, content, themes, photoUrl,
    goalSleepH, goalWaterL, goalMeditationMin, goalReadingPages,
  });

  const buildProfilePayload = () => ({
    id: userId ?? profile?.id ?? 'local',
    name: name.trim() || 'voce',
    birthdate: birthdate || null,
    skin_type: skinType,
    sport_modalities: sports,
    music_prefs: music,
    content_prefs: content,
    spirit_themes: themes,
    photo_url: photoUrl,
    goal_sleep_h: goalSleepH,
    goal_water_l: goalWaterL,
    goal_meditation_min: goalMeditationMin,
    goal_reading_pages: goalReadingPages,
  });

  const saveProfile = async (showSuccess = true) => {
    const payload = buildProfilePayload();
    setSaving(true);
    try {
      if (hasSupabase && userId) {
        const { data, error } = await supabase.from('profiles').upsert(payload).select('*').single();
        if (error) throw error;
        if (data) setProfile(data as ProfileData);
      } else {
        const current = profile;
        setProfile({
          id: payload.id,
          name: payload.name,
          photo_url: payload.photo_url,
          birthdate: payload.birthdate,
          skin_type: payload.skin_type,
          cycle_tracking: current?.cycle_tracking ?? false,
          cycle_start: current?.cycle_start ?? null,
          cycle_length: current?.cycle_length ?? 28,
          sport_modalities: payload.sport_modalities,
          music_prefs: payload.music_prefs,
          content_prefs: payload.content_prefs,
          spirit_themes: payload.spirit_themes,
          target_weight_kg: current?.target_weight_kg ?? null,
          target_weight_kg_max: current?.target_weight_kg_max ?? null,
          target_body_fat_pct: current?.target_body_fat_pct ?? null,
          target_date: current?.target_date ?? null,
          ai_enabled: current?.ai_enabled ?? true,
          notifications_enabled: current?.notifications_enabled ?? true,
          goal_sleep_h: payload.goal_sleep_h,
          goal_water_l: payload.goal_water_l,
          goal_meditation_min: payload.goal_meditation_min,
          goal_reading_pages: payload.goal_reading_pages,
          created_at: current?.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      if (showSuccess) showToast('ritual pessoal salvo.');
    } catch (error) {
      console.error(error);
      showToast('não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  useAutoSave(saveKey, async () => {
    if (!hasSupabase || !userId) return;
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      name,
      birthdate: birthdate || null,
      skin_type: skinType,
      sport_modalities: sports,
      music_prefs: music,
      content_prefs: content,
      spirit_themes: themes,
      photo_url: photoUrl,
    });
    if (error) {
      console.error(error);
      showToast('não foi possível salvar.');
    }
  });

  return (
    <div className="screen stack-md">
      <header className="stack">
        <span className="eyebrow">perfil · ritual pessoal</span>
        <h1 className="t-display-lg">
          O que <em className="t-display-italic">rege</em> seus dias.
        </h1>
        <p className="t-body muted">
          Tudo aqui muda como a IA conversa com você — não é só metadado.
        </p>
      </header>

      {/* IDENTIDADE */}
      <section className="card stack">
        <span className="eyebrow">identidade</span>
        <div className="row" style={{ gap: 16 }}>
          <label
            className="profile-avatar-label"
            style={photoUrl ? { background: `url(${photoUrl}) center/cover` } : undefined}
          >
            {!photoUrl && (name[0] ?? '?')}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])}
              style={{ display: 'none' }}
            />
          </label>
          <div className="stack" style={{ flex: 1 }}>
            <input
              className="field"
              placeholder="nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="field"
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              aria-label="data de nascimento"
            />
          </div>
        </div>

        <div>
          <span className="eyebrow">sexo biológico</span>
          <div className="chip-wrap" style={{ marginTop: 8 }}>
            {(['masculino', 'feminino', 'outro'] as const).map((s) => (
              <button
                key={s}
                className={`chip ${sexoStore === s ? 'chip--active' : ''}`}
                onClick={() => {
                  setSexoStore(s);
                  if (s === 'masculino' && hasSupabase && userId && profile?.cycle_tracking) {
                    supabase.from('profiles').upsert({ id: userId, cycle_tracking: false }).then(() => {
                      if (profile) setProfile({ ...profile, cycle_tracking: false });
                    });
                  }
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {hasSkin && (
          <div>
            <span className="eyebrow">tipo de pele</span>
            <div className="chip-wrap" style={{ marginTop: 8 }}>
              {SKIN_TYPES.map((t) => (
                <button
                  key={t.value}
                  className={`chip ${skinType === t.value ? 'chip--active' : ''}`}
                  onClick={() => setSkinType(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {hasBody && (
        <PreferenceBlock
          eyebrow="modalidades · esporte"
          title="O que seu corpo pratica."
          hint="influencia as sugestões de treino, recuperação e ritmo."
          options={SPORTS}
          selected={sports}
          onToggle={(v) => toggle(sports, v, setSports)}
        />
      )}

      {hasMind && (
        <PreferenceBlock
          eyebrow="som · trilha"
          title="Como você gosta de escutar."
          hint="a IA pode sugerir uma playlist quando o ritual pedir foco ou pausa."
          options={MUSIC}
          selected={music}
          onToggle={(v) => toggle(music, v, setMusic)}
        />
      )}

      {hasMind && (
        <PreferenceBlock
          eyebrow="leitura · skills"
          title="Onde sua mente quer ir."
          hint="alimenta as sugestões de leitura, podcast e conteúdo."
          options={CONTENT}
          selected={content}
          onToggle={(v) => toggle(content, v, setContent)}
        />
      )}

      {hasSpirit && (
        <PreferenceBlock
          eyebrow="espírito · temas"
          title="O que te chama de volta para si."
          hint="define as perguntas que o check-in espírito vai te fazer."
          options={SPIRIT}
          selected={themes}
          onToggle={(v) => toggle(themes, v, setThemes)}
        />
      )}

      <section className="card stack">
        <span className="eyebrow">metas · saúde diária</span>
        <p className="t-body-sm muted">Usadas nos relatórios de progresso e alertas de débito.</p>
        <div className="profile-goals-grid">
          <GoalField label="sono" unit="h" value={goalSleepH} min={5} max={10} step={0.5} onChange={setGoalSleepH} />
          {hasDiet && (
            <GoalField label="água" unit="L" value={goalWaterL} min={1} max={5} step={0.25} onChange={setGoalWaterL} />
          )}
          {hasMind && (
            <GoalField label="meditação" unit="min" value={goalMeditationMin} min={5} max={60} step={5} onChange={setGoalMeditationMin} />
          )}
          {hasMind && (
            <GoalField label="leitura" unit="pág" value={goalReadingPages} min={5} max={100} step={5} onChange={setGoalReadingPages} />
          )}
        </div>
      </section>

      {hasCycle && (
        <section className="card stack">
          <span className="eyebrow">ciclo menstrual</span>
          <p className="t-body-sm muted">Configura o acompanhamento de fases na tela Energia.</p>
          <div className="chip-wrap">
            <button
              className={`chip ${profile?.cycle_tracking ? 'chip--active' : ''}`}
              onClick={() => {
                if (!hasSupabase || !userId) return;
                supabase.from('profiles').upsert({ id: userId, cycle_tracking: !profile?.cycle_tracking }).then(() => {
                  if (profile) setProfile({ ...profile, cycle_tracking: !profile.cycle_tracking });
                });
              }}
            >
              {profile?.cycle_tracking ? 'ativado' : 'desativado'}
            </button>
          </div>
        </section>
      )}

      <button className="btn btn--primary btn--full" onClick={() => void saveProfile()} disabled={saving}>
        {saving ? 'salvando...' : 'salvar alterações'}
      </button>

      <div style={{ height: 40 }} />
    </div>
  );
}

function GoalField({
  label, unit, value, min, max, step, onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="goal-field">
      <span className="eyebrow">{label}</span>
      <div className="goal-field__value">
        <strong>{value}</strong>
        <span>{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`Meta de ${label}: ${value} ${unit}`}
      />
    </div>
  );
}

interface PreferenceBlockProps<T extends string> {
  eyebrow: string;
  title: string;
  hint: string;
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (v: T) => void;
}

function PreferenceBlock<T extends string>({
  eyebrow, title, hint, options, selected, onToggle,
}: PreferenceBlockProps<T>) {
  return (
    <section className="card stack">
      <span className="eyebrow">{eyebrow}</span>
      <h3 className="t-display-md">{title}</h3>
      <p className="t-body-sm muted">{hint}</p>
      <div className="chip-wrap" style={{ marginTop: 4 }}>
        {options.map((o) => (
          <button
            key={o.value}
            className={`chip ${selected.includes(o.value) ? 'chip--active' : ''}`}
            onClick={() => onToggle(o.value)}
            aria-pressed={selected.includes(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}
