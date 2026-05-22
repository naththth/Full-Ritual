import { useState } from 'react';
import { supabase, hasSupabase } from '../lib/supabase';
import { useApp } from '../store/useStore';

const DIMS = [
  { label: 'Pele',     color: '#E07A55', glow: 'rgba(224,122,85,0.7)'  },
  { label: 'Corpo',    color: '#D9501A', glow: 'rgba(217,80,26,0.7)'   },
  { label: 'Mente',    color: '#2FA0B8', glow: 'rgba(47,160,184,0.7)'  },
  { label: 'Dieta',    color: '#92B95F', glow: 'rgba(146,185,95,0.7)'  },
  { label: 'Espírito', color: '#B25893', glow: 'rgba(178,88,147,0.7)'  },
  { label: 'Energia',  color: '#D4A24C', glow: 'rgba(212,162,76,0.7)'  },
];

function Mandala() {
  const size = 96;
  const cx = size / 2;
  const cy = size / 2;
  const r = 34;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <defs>
        {DIMS.map((d) => (
          <radialGradient key={d.label} id={`g-${d.label}`} cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor={d.color} stopOpacity="1" />
            <stop offset="100%" stopColor={d.color} stopOpacity="0.55" />
          </radialGradient>
        ))}
        <radialGradient id="g-gold" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#F4D88A" stopOpacity="1" />
          <stop offset="100%" stopColor="#D4A24C" stopOpacity="0.8" />
        </radialGradient>
        {/* halo glow per dim */}
        {DIMS.map((d) => (
          <filter key={`f-${d.label}`} id={`f-${d.label}`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        ))}
        <filter id="f-gold" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* connecting arcs — subtle */}
      {DIMS.map((_, i) => {
        const a1 = ((i / DIMS.length) * 360 - 90) * (Math.PI / 180);
        const a2 = (((i + 1) / DIMS.length) * 360 - 90) * (Math.PI / 180);
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const x2 = cx + r * Math.cos(a2);
        const y2 = cy + r * Math.sin(a2);
        return (
          <line
            key={i}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="rgba(245,238,223,0.08)" strokeWidth="1"
          />
        );
      })}

      {/* outer dots */}
      {DIMS.map((d, i) => {
        const angle = (i / DIMS.length) * 360 - 90;
        const rad = angle * (Math.PI / 180);
        const x = cx + r * Math.cos(rad);
        const y = cy + r * Math.sin(rad);
        return (
          <circle
            key={d.label}
            cx={x} cy={y} r={5.5}
            fill={`url(#g-${d.label})`}
            filter={`url(#f-${d.label})`}
          />
        );
      })}

      {/* center orb */}
      <circle cx={cx} cy={cy} r={9} fill="url(#g-gold)" filter="url(#f-gold)" />
      <circle cx={cx} cy={cy} r={5} fill="#F4D88A" opacity="0.9" />
    </svg>
  );
}

export function Login() {
  const setUser = useApp((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  const createProfile = async (userId: string) => {
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: userId, name: email.split('@')[0] || 'voce' }, { onConflict: 'id' });
    if (profileError) console.warn('[Full Ritual] Perfil nao criado automaticamente.', profileError);
  };

  const authenticate = async () => {
    if (!hasSupabase) { setUser('local-demo'); return; }
    setLoading(true);
    setError(null);

    if (mode === 'signup') {
      const { data, error: e } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (e) { setError(e.message); return; }

      if (data.session) {
        // confirmação desativada no Supabase — entra direto
        if (data.user) { await createProfile(data.user.id); setUser(data.user.id); }
      } else {
        // e-mail de confirmação enviado
        setInfo('Conta criada! Verifique seu e-mail para confirmar o cadastro, depois entre normalmente.');
        setMode('signin');
      }
      return;
    }

    const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (e) { setError(e.message); return; }
    if (data.user) { await createProfile(data.user.id); setUser(data.user.id); }
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'var(--chocolate-deep)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '48px 32px',
      textAlign: 'center', overflow: 'hidden',
    }}>

      {/* aurora de fundo */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 55% 35% at 15% 5%,  rgba(224,122,85,0.10) 0%, transparent 70%),
          radial-gradient(ellipse 45% 28% at 88% 10%, rgba(47,160,184,0.09) 0%, transparent 70%),
          radial-gradient(ellipse 40% 25% at 50% 95%, rgba(178,88,147,0.08) 0%, transparent 70%),
          radial-gradient(ellipse 30% 20% at 80% 80%, rgba(217,80,26,0.07) 0%, transparent 60%)
        `,
      }} />

      {/* linha sutil no topo */}
      <div aria-hidden style={{
        position: 'absolute', top: 0, left: '10%', right: '10%', height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(212,162,76,0.25), transparent)',
      }} />

      <Mandala />

      <h1 style={{
        fontFamily: 'var(--sans)',
        fontSize: 52, lineHeight: 0.95, letterSpacing: '-0.025em', fontWeight: 700,
        color: 'var(--ivory)', margin: '20px 0 0',
      }}>
        Full Ritual
      </h1>

      {/* dimensões como linha única com separadores */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 0, marginTop: 14, flexWrap: 'wrap', rowGap: 6,
      }}>
        {DIMS.map((d, i) => (
          <span key={d.label} style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
              textTransform: 'uppercase', color: d.color,
              opacity: 0.85,
            }}>
              {d.label}
            </span>
            {i < DIMS.length - 1 && (
              <span style={{
                display: 'inline-block', width: 3, height: 3, borderRadius: '50%',
                background: 'rgba(245,238,223,0.18)', margin: '0 8px',
              }} />
            )}
          </span>
        ))}
      </div>

      <p style={{
        fontFamily: 'var(--sans)', fontStyle: 'italic', fontWeight: 400,
        fontSize: 16, color: 'var(--ivory)', opacity: 0.45,
        marginTop: 22, marginBottom: 40,
        maxWidth: 270, lineHeight: 1.5,
      }}>
        O cuidado começa quando você volta para si.
      </p>

      <div style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="email"
          placeholder="seu email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: '100%', padding: '14px 20px',
            background: 'rgba(245,238,223,0.16)',
            border: '1.5px solid rgba(245,238,223,0.55)',
            color: '#F5EEDF', borderRadius: 999,
            fontSize: 14, textAlign: 'center', outline: 'none',
          }}
        />
        <input
          type="password"
          placeholder="senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && authenticate()}
          style={{
            width: '100%', padding: '14px 20px',
            background: 'rgba(245,238,223,0.16)',
            border: '1.5px solid rgba(245,238,223,0.55)',
            color: '#F5EEDF', borderRadius: 999,
            fontSize: 14, textAlign: 'center', outline: 'none',
          }}
        />

        <button
          style={{
            width: '100%', padding: '15px 24px', borderRadius: 999,
            background: '#EDE0C8', color: '#1A0A06',
            fontFamily: 'var(--sans)', fontWeight: 800,
            fontSize: 15, letterSpacing: '0.03em',
            marginTop: 6, border: 'none', cursor: 'pointer',
            opacity: (loading || (!email && hasSupabase)) ? 0.45 : 1,
          }}
          onClick={authenticate}
          disabled={loading || (!email && hasSupabase)}
        >
          {loading
            ? (mode === 'signup' ? 'criando conta…' : 'entrando…')
            : hasSupabase
              ? (mode === 'signup' ? 'criar conta' : 'entrar')
              : 'começar o primeiro ritual'}
        </button>

        {hasSupabase && (
          <button
            style={{
              color: 'rgba(245,238,223,0.70)', fontSize: 13,
              fontWeight: 500, padding: '8px 0', marginTop: 2,
            }}
            onClick={() => { setError(null); setInfo(null); setMode(m => m === 'signin' ? 'signup' : 'signin'); }}
          >
            {mode === 'signin' ? 'criar conta' : 'já tenho conta'}
          </button>
        )}

        {error && (
          <p style={{ color: '#F4A084', marginTop: 4, fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>
            {error}
          </p>
        )}
        {info && (
          <p style={{ color: '#92B95F', marginTop: 4, fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>
            {info}
          </p>
        )}
      </div>

      {/* linha sutil no fundo */}
      <div aria-hidden style={{
        position: 'absolute', bottom: 0, left: '10%', right: '10%', height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(212,162,76,0.15), transparent)',
      }} />
    </div>
  );
}
