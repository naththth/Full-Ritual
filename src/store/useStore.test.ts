import { describe, expect, it, beforeEach } from 'vitest';
import { useApp } from './useStore';

describe('useApp store', () => {
  beforeEach(() => {
    useApp.setState({
      userId: null,
      profile: null,
      screen: 'home',
      focusedDimension: undefined,
      navigationStack: [],
      activeDimensions: ['skin', 'body', 'mind', 'diet', 'spirit'],
    });
  });

  it('starts logged out with no profile', () => {
    const state = useApp.getState();
    expect(state.userId).toBeNull();
    expect(state.profile).toBeNull();
  });

  it('setUser updates userId and resets navigation', () => {
    useApp.getState().setUser('user-123');
    const state = useApp.getState();
    expect(state.userId).toBe('user-123');
    expect(state.screen).toBe('home');
    expect(state.navigationStack).toEqual([]);
  });

  it('goTo pushes onto navigation stack and goBack pops', () => {
    const { goTo, goBack } = useApp.getState();
    goTo('body');
    goTo('insight');
    expect(useApp.getState().screen).toBe('insight');
    goBack();
    expect(useApp.getState().screen).toBe('body');
    goBack();
    expect(useApp.getState().screen).toBe('home');
  });

  it('goTo resolves dimension screen to canonical screen', () => {
    useApp.getState().goTo('dimension', 'mind');
    expect(useApp.getState().screen).toBe('mind');
    expect(useApp.getState().focusedDimension).toBe('mind');
  });
});

describe('activeDimensions — pós-onboarding', () => {
  beforeEach(() => {
    useApp.setState({
      userId: 'user-1',
      profile: null,
      screen: 'home',
      focusedDimension: undefined,
      navigationStack: [],
      activeDimensions: ['skin', 'body', 'mind', 'diet', 'spirit'],
    });
  });

  // 6. Navegação respeita dimensões ativas
  it('setActiveDimensions atualiza as dimensões no store', () => {
    useApp.getState().setActiveDimensions(['skin', 'mind']);
    expect(useApp.getState().activeDimensions).toEqual(['skin', 'mind']);
    expect(useApp.getState().activeDimensions).not.toContain('body');
    expect(useApp.getState().activeDimensions).not.toContain('diet');
    expect(useApp.getState().activeDimensions).not.toContain('spirit');
  });

  it('setProfile sincroniza activeDimensions a partir de selected_dimensions', () => {
    const profile = {
      id: 'user-1',
      name: 'Test',
      photo_url: null,
      birthdate: null,
      skin_type: null,
      cycle_tracking: false,
      cycle_start: null,
      cycle_length: null,
      sport_modalities: [],
      music_prefs: [],
      content_prefs: [],
      spirit_themes: [],
      target_weight_kg: null,
      target_weight_kg_max: null,
      target_body_fat_pct: null,
      target_date: null,
      ai_enabled: true,
      notifications_enabled: true,
      goal_sleep_h: null,
      goal_water_l: null,
      goal_meditation_min: null,
      goal_reading_pages: null,
      onboarding_completed_at: '2026-01-01T00:00:00Z',
      onboarding_completed: true,
      onboarding_version: '2',
      biological_sex: null as null,
      selected_dimensions: ['skin', 'spirit'],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    useApp.getState().setProfile(profile);
    expect(useApp.getState().activeDimensions).toEqual(['skin', 'spirit']);
  });
});
