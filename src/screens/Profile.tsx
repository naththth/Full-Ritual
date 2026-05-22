import { useState, useEffect } from 'react';
import { BackButton } from '../components/BackButton';
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

type SettingsIconKind = 'skincare' | 'library' | 'body';

function SettingsIcon({ kind }: { kind: SettingsIconKind }) {
  if (kind === 'skincare') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M11.5 25.5h9" />
        <path d="M13 11.5h6v14h-6z" />
        <path d="M13.8 8.2h4.4v3.3h-4.4z" />
        <path d="M14.7 6.2h2.6" />
        <path d="M16 15.2c2 1.7 3 3.3 3 4.8a3 3 0 0 1-6 0c0-1.5 1-3.1 3-4.8Z" />
      </svg>
    );
  }

  if (kind === 'library') {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M9 8.2h6.2c1.3 0 2.4.4 3.1 1.2v16.4c-.7-.8-1.8-1.2-3.1-1.2H9z" />
        <path d="M18.3 9.4c.7-.8 1.8-1.2 3.1-1.2H23v16.4h-1.6c-1.3 0-2.4.4-3.1 1.2" />
        <path d="M12 12.8h3.2" />
        <path d="M12 16.2h3.2" />
        <path d="M21 12v6.5l1.3-1 1.3 1V12" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M16 7.2v17.6" />
      <path d="M11.2 10.8h9.6" />
      <path d="M12.8 24.8h6.4" />
      <path d="M9.2 13.2 6 20h6.4z" />
      <path d="m22.8 13.2-3.2 6.8H26z" />
      <path d="M7.8 20c.9 1.1 2.2 1.6 3.8 0" />
      <path d="M21.2 20c.9 1.1 2.2 1.6 3.8 0" />
    </svg>
  );
}

function SettingsArrow() {
  return (
    <span className="settings-arrow" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M8.5 5.5 15 12l-6.5 6.5" />
      </svg>
    </span>
  );
}

export function Profile() {
  const profile = useApp((s) => s.profile);
  const userId = useApp((s) => s.userId);
  const setProfile = useApp((s) => s.setProfile);
  const showToast = useApp((s) => s.showToast);
  const goTo = useApp((s) => s.goTo);

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
      <header className="screen-header stack">
        <BackButton />
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
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: photoUrl ? `url(${photoUrl}) center/cover` : 'var(--camel)',
              display: 'grid', placeItems: 'center',
              fontFamily: 'var(--display)', fontSize: 32, color: 'var(--chocolate)',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            {!photoUrl && (name[0] ?? '?')}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])}
              style={{ display: 'none' }}
            />
          </label>
          <div style={{ flex: 1 }} className="stack">
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
          <span className="eyebrow">tipo de pele</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
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
      </section>

      <section className="card stack settings-card">
        <span className="eyebrow">configuração · app</span>
        <button className="settings-row settings-row--skin" onClick={() => goTo('products')}>
          <span className="settings-mark"><SettingsIcon kind="skincare" /></span>
          <span>
            <strong>Produtos e rotina skincare</strong>
            <small>cadastro, frequência e regeneração da ordem de uso</small>
          </span>
          <SettingsArrow />
        </button>
        <button className="settings-row settings-row--mind" onClick={() => goTo('library')}>
          <span className="settings-mark"><SettingsIcon kind="library" /></span>
          <span>
            <strong>Biblioteca e leitura</strong>
            <small>importar Goodreads, cadastrar livros e registrar páginas</small>
          </span>
          <SettingsArrow />
        </button>
        <button className="settings-row settings-row--body" onClick={() => goTo('body_metrics')}>
          <span className="settings-mark"><SettingsIcon kind="body" /></span>
          <span>
            <strong>Peso, altura e composição</strong>
            <small>registrar medidas, foto pra IA analisar e ver evolução</small>
          </span>
          <SettingsArrow />
        </button>
      </section>

      <PreferenceBlock
        eyebrow="modalidades · esporte"
        title="O que seu corpo pratica."
        hint="influencia as sugestões de treino, recuperação e ritmo."
        options={SPORTS}
        selected={sports}
        onToggle={(v) => toggle(sports, v, setSports)}
      />

      <PreferenceBlock
        eyebrow="som · trilha"
        title="Como você gosta de escutar."
        hint="a IA pode sugerir uma playlist quando o ritual pedir foco ou pausa."
        options={MUSIC}
        selected={music}
        onToggle={(v) => toggle(music, v, setMusic)}
      />

      <PreferenceBlock
        eyebrow="leitura · skills"
        title="Onde sua mente quer ir."
        hint="alimenta as sugestões de leitura, podcast e conteúdo."
        options={CONTENT}
        selected={content}
        onToggle={(v) => toggle(content, v, setContent)}
      />

      <PreferenceBlock
        eyebrow="espírito · temas"
        title="O que te chama de volta para si."
        hint="define as perguntas que o check-in espírito vai te fazer."
        options={SPIRIT}
        selected={themes}
        onToggle={(v) => toggle(themes, v, setThemes)}
      />

      <section className="card stack">
        <span className="eyebrow">metas · saúde diária</span>
        <p className="t-body-sm muted">Usadas nos relatórios de progresso e alertas de débito.</p>
        <div className="profile-goals-grid">
          <GoalField
            label="sono"
            unit="h"
            value={goalSleepH}
            min={5}
            max={10}
            step={0.5}
            onChange={setGoalSleepH}
          />
          <GoalField
            label="água"
            unit="L"
            value={goalWaterL}
            min={1}
            max={5}
            step={0.25}
            onChange={setGoalWaterL}
          />
          <GoalField
            label="meditação"
            unit="min"
            value={goalMeditationMin}
            min={5}
            max={60}
            step={5}
            onChange={setGoalMeditationMin}
          />
          <GoalField
            label="leitura"
            unit="pág"
            value={goalReadingPages}
            min={5}
            max={100}
            step={5}
            onChange={setGoalReadingPages}
          />
        </div>
      </section>

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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
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
