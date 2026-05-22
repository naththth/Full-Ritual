import { DIMENSIONS, type DailyScore, type DimensionKey } from '../types';

export const ALL_DIMENSIONS = Object.keys(DIMENSIONS) as DimensionKey[];

const SCORE_FIELD: Record<DimensionKey, keyof DailyScore> = {
  skin: 'score_skin',
  body: 'score_body',
  mind: 'score_mind',
  diet: 'score_diet',
  spirit: 'score_spirit',
};

export function normalizeActiveDimensions(activeDimensions: DimensionKey[] | null | undefined): DimensionKey[] {
  const valid = (activeDimensions ?? []).filter((key): key is DimensionKey => ALL_DIMENSIONS.includes(key));
  return valid.length ? valid : ALL_DIMENSIONS;
}

export function dimensionScoreField(key: DimensionKey): keyof DailyScore {
  return SCORE_FIELD[key];
}

export function dimensionScore(score: DailyScore, key: DimensionKey): number {
  const value = score[SCORE_FIELD[key]];
  return typeof value === 'number' ? value : 0;
}

export function averageDimensionScore(score: DailyScore, dimensions: DimensionKey[]): number {
  const active = normalizeActiveDimensions(dimensions);
  if (!active.length) return score.score_total ?? 0;
  return Math.round(active.reduce((sum, key) => sum + dimensionScore(score, key), 0) / active.length);
}

export function dimensionLabels(dimensions: DimensionKey[]): string {
  return normalizeActiveDimensions(dimensions).map((key) => DIMENSIONS[key].label.toLowerCase()).join(', ');
}
