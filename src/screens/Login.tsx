import { useState } from 'react';
import { supabase, hasSupabase } from '../lib/supabase';
import { useApp } from '../store/useStore';

export function Login() {
  const setUser = useApp((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    if (!hasSupabase) {
      setUser('local-demo');
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError?.message === 'Invalid login credentials') {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (signUpError) { setError(signUpError.message); return; }
      if (signUpData.user) setUser(signUpData.user.id);
      return;
    }

    setLoading(false);
    if (signInError) { setError(signInError.message); return; }
    if (data.user) setUser(data.user.id);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 18px',
    background: 'rgba(245,238,223,0.10)',
    border: '1px solid rgba(245,238,223,0.20)',
    color: 'var(--ivory)',
    borderRadius: 999,
    fontSize: 14,
    textAlign: 'center',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'var(--chocolate)', color: 'var(--ivory)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 40, textAlign: 'center',
      }}
    >
      <svg width="116" height="116" viewBox="0 0 120 120" style={{ marginBottom: 22 }}>
        <circle cx="60" cy="60" r="46" stroke="rgba(245,238,223,0.12)" strokeWidth="6" fill="none" />
        <circle cx="60" cy="60" r="46" stroke="#D89A82" strokeWidth="6" fill="none"
          strokeDasharray="210 290" strokeLinecap="round" />
        <circle cx="60" cy="60" r="36" stroke="#B85A1F" strokeWidth="6" fill="none"
          strokeDasharray="160 220" strokeLinecap="round" />
        <circle cx="60" cy="60" r="26" stroke="#1F4751" strokeWidth="6" fill="none"
          strokeDasharray="120 160" strokeLinecap="round" />
        <circle cx="60" cy="60" r="16" stroke="#4A2A3F" strokeWidth="6" fill="none"
          strokeDasharray="70 100" strokeLinecap="round" />
      </svg>

      <h1
        style={{
          fontFamily: 'var(--display)',
          fontSize: 56, lineHeight: 0.95, letterSpacing: '-0.025em',
          margin: '0 0 12px',
        }}
      >
        Full Ritual
      </h1>
      <p
        style={{
          fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em',
          textTransform: 'uppercase', opacity: 0.72, margin: 0,
        }}
      >
        pele · corpo · mente · dieta · espírito
      </p>
      <p
        style={{
          fontFamily: 'var(--display)', fontStyle: 'italic',
          fontSize: 19, marginTop: 18, opacity: 0.78,
          maxWidth: 320, lineHeight: 1.3,
        }}
      >
        O cuidado começa quando você volta para si.
      </p>

      <div style={{ width: '100%', maxWidth: 320, marginTop: 32, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="email"
          placeholder="seu email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && signIn()}
          style={inputStyle}
        />
        <button
          className="btn btn--full"
          style={{ background: 'var(--ivory)', color: 'var(--chocolate)' }}
          onClick={signIn}
          disabled={loading || (!email && hasSupabase)}
        >
          {loading ? 'entrando…' : hasSupabase ? 'entrar' : 'começar o primeiro ritual'}
        </button>
        {error && <p style={{ color: 'var(--skin)', marginTop: 4, fontSize: 13 }}>{error}</p>}
      </div>
    </div>
  );
}
