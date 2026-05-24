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
