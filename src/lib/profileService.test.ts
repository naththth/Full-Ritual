import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
  hasSupabase: true,
}));

// ─── helpers ────────────────────────────────────────────────────────────────

const VALID_DIMENSIONS = ['skin', 'body', 'mind', 'diet', 'spirit'] as const;

// Simula um perfil mínimo que acabou de ser criado (sem onboarding)
function makeNewProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: '',
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
    onboarding_completed_at: null,
    onboarding_completed: false,
    onboarding_version: null,
    biological_sex: null,
    selected_dimensions: ['skin', 'body', 'mind', 'diet', 'spirit'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── importações sob teste ───────────────────────────────────────────────────

import {
  needsOnboarding,
  isEnergyAlwaysActive,
  isInsightSelectable,
  getSelectableDimensions,
  shouldShowCycleTracking,
  buildProfilePatch,
  toggleDimension,
  normalizeDimensions,
} from './profileService';

// ─── testes ─────────────────────────────────────────────────────────────────

describe('profileService', () => {
  // 1. Novo usuário sem onboarding completo → deve ser direcionado ao onboarding
  it('novo usuário sem onboarding_completed retorna needsOnboarding = true', () => {
    const profile = makeNewProfile({ onboarding_completed: false });
    expect(needsOnboarding(profile)).toBe(true);
  });

  // 2. Usuário com onboarding_completed = true não deve ver onboarding novamente
  it('usuário com onboarding_completed = true retorna needsOnboarding = false', () => {
    const profile = makeNewProfile({
      onboarding_completed: true,
      onboarding_completed_at: '2026-05-20T10:00:00Z',
    });
    expect(needsOnboarding(profile)).toBe(false);
  });

  // 3. Energia deve estar sempre ativa (não aparece na seleção de dimensões)
  it('isEnergyAlwaysActive retorna true — energia não é dimensão selecionável', () => {
    expect(isEnergyAlwaysActive()).toBe(true);
  });

  // 4. Insights não deve aparecer como dimensão selecionável
  it('isInsightSelectable retorna false — insights não é dimensão', () => {
    expect(isInsightSelectable()).toBe(false);
  });

  // 5. Dimensões escolhidas devem ser salvas no perfil
  it('buildProfilePatch serializa selected_dimensions corretamente', () => {
    const dims = ['skin', 'mind'] as const;
    const patch = buildProfilePatch({ selected_dimensions: [...dims] });
    expect(patch.selected_dimensions).toEqual(['skin', 'mind']);
  });

  // 6. Ciclo menstrual só deve aparecer quando aplicável
  it('shouldShowCycleTracking: false para masculino, true para feminino com cycle_tracking', () => {
    const masc = makeNewProfile({ biological_sex: 'masculino', cycle_tracking: true });
    expect(shouldShowCycleTracking(masc)).toBe(false);

    const fem = makeNewProfile({ biological_sex: 'feminino', cycle_tracking: true });
    expect(shouldShowCycleTracking(fem)).toBe(true);

    const femOff = makeNewProfile({ biological_sex: 'feminino', cycle_tracking: false });
    expect(shouldShowCycleTracking(femOff)).toBe(false);
  });

  // Sanity: getSelectableDimensions não inclui 'energy' nem 'insight'
  it('getSelectableDimensions retorna exatamente as 5 dimensões sem energy/insight', () => {
    const dims = getSelectableDimensions();
    expect(dims).toEqual(VALID_DIMENSIONS);
    expect(dims).not.toContain('energy');
    expect(dims).not.toContain('insight');
  });
});

describe('toggleDimension — pós-onboarding', () => {
  // 1. Usuário consegue ativar dimensão depois do onboarding
  it('ativa uma dimensão que estava inativa', () => {
    const current = ['skin', 'body'] as const;
    const result = toggleDimension([...current], 'mind');
    expect(result).toContain('mind');
    expect(result).toContain('skin');
    expect(result).toContain('body');
  });

  // 2. Usuário consegue desativar dimensão opcional
  it('desativa uma dimensão que estava ativa', () => {
    const current = ['skin', 'body', 'mind'] as const;
    const result = toggleDimension([...current], 'mind');
    expect(result).not.toContain('mind');
    expect(result).toContain('skin');
    expect(result).toContain('body');
  });

  // 3. Energia nunca aparece nas dimensões selecionáveis
  it('energy não faz parte das dimensões selecionáveis (não é DimensionKey)', () => {
    const dims = getSelectableDimensions();
    expect(dims).not.toContain('energy');
  });

  // 4. Insights nunca é tratado como dimensão
  it('insight não aparece nas dimensões selecionáveis', () => {
    const dims = getSelectableDimensions();
    expect(dims).not.toContain('insight');
  });

  // 5. Alteração persiste corretamente via buildProfilePatch
  it('alteração de dimensão serializa corretamente para o banco', () => {
    const after = toggleDimension(['skin', 'body', 'mind', 'diet', 'spirit'], 'diet');
    const patch = buildProfilePatch({ selected_dimensions: after });
    expect(patch.selected_dimensions).toEqual(['skin', 'body', 'mind', 'spirit']);
    expect(patch.selected_dimensions).not.toContain('diet');
  });

  // Não pode desativar a última dimensão (mínimo 1 ativa)
  it('não desativa a única dimensão restante', () => {
    const result = toggleDimension(['skin'], 'skin');
    expect(result).toContain('skin');
    expect(result).toHaveLength(1);
  });
});

describe('normalizeDimensions', () => {
  it('filtra valores inválidos e mantém apenas DimensionKey válidas', () => {
    const raw = ['skin', 'energy', 'insight', 'body', 'unknown'];
    const result = normalizeDimensions(raw);
    expect(result).toEqual(['skin', 'body']);
    expect(result).not.toContain('energy');
    expect(result).not.toContain('insight');
    expect(result).not.toContain('unknown');
  });

  it('retorna todas as 5 dimensões quando array vazio é passado', () => {
    const result = normalizeDimensions([]);
    expect(result).toEqual(['skin', 'body', 'mind', 'diet', 'spirit']);
  });
});
