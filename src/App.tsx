import { useEffect, useRef, useState } from 'react';
import { Home } from './screens/Home';
import { Energy } from './screens/Energy';
import { Ritual } from './screens/Ritual';
import { Body } from './screens/Body';
import { Insight } from './screens/Insight';
import { Library } from './screens/Library';
import { Profile } from './screens/Profile';
import { Login } from './screens/Login';
import { Onboarding } from './screens/Onboarding';
import { Chat } from './screens/Chat';
import { BodyCoach } from './screens/BodyCoach';
import { BodyMetrics } from './screens/BodyMetrics';
import { Labs } from './screens/Labs';
import { Supplements } from './screens/Supplements';
import { Pain } from './screens/Pain';
import { Health } from './screens/Health';
import { Diet } from './screens/Diet';
import { Evolution } from './screens/Evolution';
import { Mind } from './screens/Mind';
import { Products } from './screens/Products';
import { Spirit } from './screens/Spirit';
import { NavigationMenu } from './components/NavigationMenu';
import { useApp } from './store/useStore';
import { supabase, hasSupabase } from './lib/supabase';
import { isoToday } from './lib/dates';
import './styles/global.css';

export default function App() {
  const screen = useApp((s) => s.screen);
  const focusedDimension = useApp((s) => s.focusedDimension);
  const selectedDate = useApp((s) => s.selectedDate);
  const userId = useApp((s) => s.userId);
  const activeDimensions = useApp((s) => s.activeDimensions);
  const setUser = useApp((s) => s.setUser);
  const goTo = useApp((s) => s.goTo);
  const setSelectedDate = useApp((s) => s.setSelectedDate);
  const toast = useApp((s) => s.toast);
  const autoSelectedDate = useRef(isoToday());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [authReady, setAuthReady] = useState(!hasSupabase);

  const setProfile = useApp((s) => s.setProfile);
  const profile = useApp((s) => s.profile);

  useEffect(() => {
    if (!hasSupabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user.id ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        setProfile(null);
      } else {
        setUser(session.user.id);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [setUser, setProfile]);

  useEffect(() => {
    if (!userId || !hasSupabase) return;
    setProfile(null); // limpa perfil anterior enquanto carrega
    supabase.from('profiles').select('*').eq('id', userId).single().then(({ data }) => {
      if (data) setProfile(data);
    });
  }, [userId, setProfile]);

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [screen, focusedDimension, selectedDate]);

  useEffect(() => {
    if (screen === 'products' && !activeDimensions.includes('skin')) goTo('home');
    if (screen === 'library' && !activeDimensions.includes('mind')) goTo('home');
  }, [activeDimensions, goTo, screen]);

  if (!authReady) return (
    <div className="app-shell"><main className="app" /></div>
  );

  if (!userId) return (
    <div className="app-shell"><main className="app"><Login /></main></div>
  );

  // Perfil ainda carregando — aguarda antes de decidir onboarding
  const profileLoaded = profile !== null || !hasSupabase;
  const needsOnboarding = profileLoaded && !profile?.onboarding_completed;
  const showOnboarding = needsOnboarding || screen === 'onboarding';

  return (
    <div className="app-shell">
      <main className="app">
        {showOnboarding ? <Onboarding /> : (
          <>
        <NavigationMenu />
        <div className="scroll" ref={scrollRef}>
          {screen === 'home' && <Home />}
          {screen === 'energy' && <Energy />}
          {screen === 'ritual' && <Ritual />}
          {screen === 'body' && <Body />}
          {screen === 'mind' && <Mind />}
          {screen === 'diet' && <Diet />}
          {screen === 'spirit' && <Spirit />}
          {screen === 'insight' && <Insight />}
          {screen === 'profile' && <Profile />}
          {screen === 'products' && activeDimensions.includes('skin') && <Products />}
          {screen === 'library' && activeDimensions.includes('mind') && <Library />}
          {screen === 'evolution' && <Evolution />}
          {screen === 'chat' && <Chat />}
          {screen === 'body_coach' && <BodyCoach />}
          {screen === 'body_metrics' && <BodyMetrics />}
          {screen === 'labs' && <Labs />}
          {screen === 'supplements' && <Supplements />}
          {screen === 'pain' && <Pain />}
          {screen === 'health' && <Health />}
          {screen === 'dimension' && focusedDimension === 'skin' && <Ritual />}
          {screen === 'dimension' && focusedDimension === 'body' && <Body />}
          {screen === 'dimension' && focusedDimension === 'mind' && <Mind />}
          {screen === 'dimension' && focusedDimension === 'diet' && <Diet />}
          {screen === 'dimension' && focusedDimension === 'spirit' && <Spirit />}
        </div>
        {toast && (
          <div className="app-toast" role="status" aria-live="polite">
            {toast}
          </div>
        )}
          </>
        )}
      </main>
    </div>
  );
}
