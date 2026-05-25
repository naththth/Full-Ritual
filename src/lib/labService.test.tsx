import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  categorizeMarkers,
  fetchLabResults,
  getLabSummaryForInsights,
  saveLabResult,
} from './labService';
import type { LabMarker, LabResult } from '../types';

// ---------- Mock Supabase ----------

const mockSingle = vi.fn();
const mockEq = vi.fn();
const mockLimit = vi.fn();
const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();

function makeChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: mockEq,
    order: () => chain,
    limit: mockLimit,
    single: mockSingle,
    insert: () => chain,
  };
  mockEq.mockReturnValue(chain);
  mockLimit.mockReturnValue(chain);
  return chain;
}

const chain = makeChain();

vi.mock('./supabase', () => ({
  hasSupabase: true,
  supabase: {
    from: () => chain,
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  makeChain();
});

// ---------- Helpers ----------

const normalMarker = (): LabMarker => ({
  value: 45,
  unit: 'ng/mL',
  ref_min: 20,
  ref_max: 200,
  status: 'normal',
});

const highMarker = (): LabMarker => ({
  value: 250,
  unit: 'ng/mL',
  ref_min: 20,
  ref_max: 200,
  status: 'high',
});

const criticalMarker = (): LabMarker => ({
  value: 5,
  unit: 'ng/mL',
  ref_min: 20,
  ref_max: 200,
  status: 'critical',
});

const makeResult = (overrides: Partial<LabResult> = {}): LabResult => ({
  id: 'r1',
  user_id: 'u1',
  date: '2026-05-24',
  lab_name: 'Fleury',
  photo_url: null,
  file_type: 'manual',
  markers: { ferritina: normalMarker() },
  notes: null,
  created_at: '2026-05-24T10:00:00Z',
  ...overrides,
});

// ---------- Teste 1: Upload cria registro vinculado ao usuário ----------

describe('saveLabResult', () => {
  it('insere registro com user_id correto', async () => {
    mockSingle.mockResolvedValue({ data: makeResult(), error: null });

    // Reconstruir chain com insert que retorna chain com select/single
    chain.insert = () => ({
      select: () => ({ single: mockSingle }),
    });

    const result = await saveLabResult({
      user_id: 'u1',
      date: '2026-05-24',
      lab_name: null,
      photo_url: null,
      file_type: 'manual',
      markers: { ferritina: normalMarker() },
      notes: null,
    });

    expect(result.user_id).toBe('u1');
  });
});

// ---------- Teste 2: PDF exibido em container rolável ----------

describe('PdfViewer', () => {
  it('renderiza container com scroll e embed do PDF', async () => {
    // Importar dinamicamente para testar o componente
    const { PdfViewer } = await import('../components/PdfViewer');
    render(<PdfViewer url="https://example.com/laudo.pdf" />);

    const container = screen.getByTestId('pdf-viewer');
    expect(container).toBeDefined();

    // O container deve ter role scrollable via CSS (overflow: auto)
    // Verificamos que o objeto/fallback está presente
    const fallback = screen.getByRole('link', { name: /abrir pdf/i });
    expect(fallback).toBeDefined();
  });
});

// ---------- Teste 3: Marcadores separados por status ----------

describe('categorizeMarkers', () => {
  it('separa marcadores normais dos preocupantes', () => {
    const markers = {
      ferritina: normalMarker(),
      vitamina_d: highMarker(),
      hemoglobina: criticalMarker(),
    };

    const { normal, concerning } = categorizeMarkers(markers);

    expect(Object.keys(normal)).toEqual(['ferritina']);
    expect(Object.keys(concerning)).toHaveLength(2);
    expect(concerning).toHaveProperty('vitamina_d');
    expect(concerning).toHaveProperty('hemoglobina');
  });

  it('trata nao_classificado como normal (sem referência)', () => {
    const markers = {
      estradiol: { value: 80, unit: 'pg/mL', status: 'nao_classificado' as const },
    };
    const { normal, concerning } = categorizeMarkers(markers);
    expect(Object.keys(normal)).toContain('estradiol');
    expect(Object.keys(concerning)).toHaveLength(0);
  });

  it('retorna vazio quando não há marcadores', () => {
    const { normal, concerning } = categorizeMarkers({});
    expect(Object.keys(normal)).toHaveLength(0);
    expect(Object.keys(concerning)).toHaveLength(0);
  });
});

// ---------- Teste 4: Usuário não vê exames de outro usuário ----------

describe('fetchLabResults', () => {
  it('filtra por user_id antes de buscar no banco', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

    await fetchLabResults('u1');

    expect(mockEq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('lança erro quando Supabase falha', async () => {
    mockLimit.mockResolvedValue({ data: null, error: new Error('permissão negada') });
    await expect(fetchLabResults('u1')).rejects.toThrow('permissão negada');
  });
});

// ---------- Teste 5: Estado vazio quando não há exames ----------

describe('getLabSummaryForInsights — lista vazia', () => {
  it('retorna lastDate null e contagens zero', () => {
    const summary = getLabSummaryForInsights([]);
    expect(summary.lastDate).toBeNull();
    expect(summary.normalCount).toBe(0);
    expect(summary.concerningCount).toBe(0);
    expect(summary.concerning).toHaveLength(0);
  });
});

// ---------- Teste 6: Energia/Insights consomem resumo estruturado ----------

describe('getLabSummaryForInsights — com resultados', () => {
  it('devolve resumo estruturado com marcadores preocupantes do exame mais recente', () => {
    const results: LabResult[] = [
      makeResult({
        date: '2026-05-24',
        markers: {
          ferritina: normalMarker(),
          vitamina_d: highMarker(),
          hemoglobina: criticalMarker(),
        },
      }),
      makeResult({
        id: 'r2',
        date: '2026-03-10',
        markers: { ferritina: normalMarker() },
      }),
    ];

    const summary = getLabSummaryForInsights(results);

    expect(summary.lastDate).toBe('2026-05-24');
    expect(summary.normalCount).toBe(1);
    expect(summary.concerningCount).toBe(2);
    expect(summary.concerning.map((c) => c.key)).toContain('vitamina_d');
    expect(summary.concerning.map((c) => c.key)).toContain('hemoglobina');
  });

  it('expõe status e valor para cada marcador preocupante', () => {
    const results: LabResult[] = [
      makeResult({
        markers: { vitamina_d: { value: 12, unit: 'ng/mL', status: 'low' } },
      }),
    ];

    const summary = getLabSummaryForInsights(results);
    const vitD = summary.concerning.find((c) => c.key === 'vitamina_d');

    expect(vitD).toBeDefined();
    expect(vitD!.status).toBe('low');
    expect(vitD!.value).toBe(12);
    expect(vitD!.unit).toBe('ng/mL');
  });
});
