import { useState, useEffect } from 'react';
import { useApp } from '../store/useStore';
import { supabase, hasSupabase } from '../lib/supabase';
import type {
  SkinType, SportModality, MusicPref, ContentPref, SpiritTheme,
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

  const [name, setName] = useState(profile?.name ?? '');
  const [birthdate, setBirthdate] = useState(profile?.birthdate ?? '');
  const [skinType, setSkinType] = useState<SkinType | null>(profile?.skin_type ?? null);
  const [sports, setSports] = useState<SportModality[]>(profile?.sport_modalities ?? []);
  const [music, setMusic] = useState<MusicPref[]>(profile?.music_prefs ?? []);
  const [content, setContent] = useState<ContentPref[]>(profile?.content_prefs ?? []);
  const [themes, setThemes] = useState<SpiritTheme[]>(profile?.spirit_themes ?? []);
  const [photoUrl, setPhotoUrl] = useState<string | null>(profile?.photo_url ?? null);

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

  const save = async () => {
    if (!hasSupabase || !userId) {
      showToast('configure o Supabase para salvar.');
      return;
    }
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
      showToast('não foi possível salvar.');
      return;
    }
    showToast('perfil atualizado.');
  };

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

      <button className="btn btn--primary btn--full" onClick={save}>
        guardar preferências
      </button>

      <div style={{ height: 40 }} />
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
