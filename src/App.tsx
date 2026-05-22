import { useEffect, useRef } from 'react';
import { Home } from './screens/Home';
import { Energy } from './screens/Energy';
import { Ritual } from './screens/Ritual';
import { Body } from './screens/Body';
import { Insight } from './screens/Insight';
import { Library } from './screens/Library';
import { Profile } from './screens/Profile';
import { Login } from './screens/Login';
import { Chat } from './screens/Chat';
import { BodyCoach } from './screens/BodyCoach';
import { BodyMetrics } from './screens/BodyMetrics';
import { Labs } from './screens/Labs';
import { Supplements } from './screens/Supplements';
import { Vitals } from './screens/Vitals';
import { Pain } from './screens/Pain';
import { Health } from './screens/Health';
import { Diet } from './screens/Diet';
import { Evolution } from './screens/Evolution';
import { Mind } from './screens/Mind';
import { Products } from './screens/Products';
import { Spirit } from './screens/Spirit';
import { TabBar } from './components/TabBar';
import { useApp } from './store/useStore';
import { supabase, hasSupabase } from './lib/supabase';
import { isoToday } from './lib/dates';
import './styles/global.css';

export default function App() {
  const screen = useApp((s) => s.screen);
  const focusedDimension = useApp((s) => s.focusedDimension);
  const userId = useApp((s) => s.userId);
  const setUser = useApp((s) => s.setUser);
  const setSelectedDate = useApp((s) => s.setSelectedDate);
  const toast = useApp((s) => s.toast);
  const autoSelectedDate = useRef(isoToday());

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

  useEffect(() => {
    const handleStorageError = () => {
      useApp.getState().showToast('Armazenamento do celular cheio. A tela segue aberta, mas este registro pode nao salvar.');
    };
    window.addEventListener('full-ritual:storage-error', handleStorageError);
    return () => window.removeEventListener('full-ritual:storage-error', handleStorageError);
  }, []);

  useEffect(() => {
    const selectToday = () => {
      const today = isoToday();
      autoSelectedDate.current = today;
      setSelectedDate(today);
    };
    const refreshTodayIfStillOnAutoDate = () => {
      const state = useApp.getState();
      const today = isoToday();

      if (state.selectedDate === autoSelectedDate.current) {
        autoSelectedDate.current = today;
        state.setSelectedDate(today);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshTodayIfStillOnAutoDate();
    };

    selectToday();
    window.addEventListener('focus', refreshTodayIfStillOnAutoDate);
    window.addEventListener('pageshow', refreshTodayIfStillOnAutoDate);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', refreshTodayIfStillOnAutoDate);
      window.removeEventListener('pageshow', refreshTodayIfStillOnAutoDate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [setSelectedDate]);

  if (!userId) return <Login />;

  return (
    <div className="app-shell">
      <main className="app">
        <div className="scroll">
          {screen === 'home' && <Home />}
          {screen === 'energy' && <Energy />}
          {screen === 'ritual' && <Ritual />}
          {screen === 'body' && <Body />}
          {screen === 'mind' && <Mind />}
          {screen === 'diet' && <Diet />}
          {screen === 'spirit' && <Spirit />}
          {screen === 'insight' && <Insight />}
          {screen === 'profile' && <Profile />}
          {screen === 'products' && <Products />}
          {screen === 'library' && <Library />}
          {screen === 'evolution' && <Evolution />}
          {screen === 'chat' && <Chat />}
          {screen === 'body_coach' && <BodyCoach />}
          {screen === 'body_metrics' && <BodyMetrics />}
          {screen === 'labs' && <Labs />}
          {screen === 'supplements' && <Supplements />}
          {screen === 'vitals' && <Vitals />}
          {screen === 'pain' && <Pain />}
          {screen === 'health' && <Health />}
          {screen === 'dimension' && focusedDimension === 'skin' && <Ritual />}
          {screen === 'dimension' && focusedDimension === 'body' && <Body />}
          {screen === 'dimension' && focusedDimension === 'mind' && <Mind />}
          {screen === 'dimension' && focusedDimension === 'diet' && <Diet />}
          {screen === 'dimension' && focusedDimension === 'spirit' && <Spirit />}
        </div>
        <TabBar />
        {toast && (
          <div className="app-toast" role="status" aria-live="polite">
            {toast}
          </div>
        )}
      </main>
    </div>
  );
}
