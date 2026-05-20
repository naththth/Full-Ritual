import { useEffect } from 'react';
import { Home } from './screens/Home';
import { Ritual } from './screens/Ritual';
import { Insight } from './screens/Insight';
import { Profile } from './screens/Profile';
import { Login } from './screens/Login';
import { Chat } from './screens/Chat';
import { Diet } from './screens/Diet';
import { Evolution } from './screens/Evolution';
import { Mind } from './screens/Mind';
import { Products } from './screens/Products';
import { Sleep } from './screens/Sleep';
import { Spirit } from './screens/Spirit';
import { TabBar } from './components/TabBar';
import { useApp } from './store/useStore';
import { supabase, hasSupabase } from './lib/supabase';
import './styles/global.css';

export default function App() {
  const screen = useApp((s) => s.screen);
  const focusedDimension = useApp((s) => s.focusedDimension);
  const userId = useApp((s) => s.userId);
  const setUser = useApp((s) => s.setUser);
  const toast = useApp((s) => s.toast);

  // Sessão Supabase
  useEffect(() => {
    if (!hasSupabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setUser(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [setUser]);

  if (!userId) return <Login />;

  return (
    <div className="app-shell">
      <main className="app">
        <div className="scroll">
          {screen === 'home' && <Home />}
          {screen === 'ritual' && <Ritual />}
          {screen === 'mind' && <Mind />}
          {screen === 'diet' && <Diet />}
          {screen === 'spirit' && <Spirit />}
          {screen === 'insight' && <Insight />}
          {screen === 'profile' && <Profile />}
          {screen === 'products' && <Products />}
          {screen === 'sleep' && <Sleep />}
          {screen === 'evolution' && <Evolution />}
          {screen === 'chat' && <Chat />}
          {screen === 'dimension' && (focusedDimension === 'skin' || focusedDimension === 'body') && <Ritual />}
          {screen === 'dimension' && focusedDimension === 'mind' && <Mind />}
          {screen === 'dimension' && focusedDimension === 'diet' && <Diet />}
          {screen === 'dimension' && focusedDimension === 'spirit' && <Spirit />}
        </div>
        <TabBar />
        {toast && (
          <div
            style={{
              position: 'fixed', left: '50%', transform: 'translateX(-50%)',
              bottom: 96, zIndex: 80,
              maxWidth: 400, width: 'calc(100% - 40px)',
              background: 'var(--chocolate)', color: 'var(--ivory)',
              padding: '14px 18px', borderRadius: 20,
              fontSize: 13, fontFamily: 'var(--sans)',
              boxShadow: '0 18px 40px rgba(74,44,34,0.30)',
            }}
            role="status"
            aria-live="polite"
          >
            {toast}
          </div>
        )}
      </main>
    </div>
  );
}
