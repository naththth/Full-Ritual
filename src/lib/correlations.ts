import { dimensionLabels, normalizeActiveDimensions } from './dimensions';
import type { Checkin, DailyScore, DimensionKey, SleepLog } from '../types';

export interface CorrelationInsight {
  title: string;
  body: string;
  strength: number;
}

export function buildAutomaticCorrelations({
  sleepLogs,
  checkins,
  scores,
  activeDimensions,
}: {
  sleepLogs: SleepLog[];
  checkins: Checkin[];
  scores: DailyScore[];
  activeDimensions?: DimensionKey[];
}): CorrelationInsight[] {
  const insights: CorrelationInsight[] = [];
  const active = normalizeActiveDimensions(activeDimensions);
  const hasDimension = (key: DimensionKey) => active.includes(key);

  const sleepByDate = new Map(sleepLogs.map((s) => [s.date, s]));
  const checkinsWithSleep = checkins.filter((c) => sleepByDate.get(c.date)?.duration_min);

  // Sono < 6h → pele reativa
  if (hasDimension('skin') && checkinsWithSleep.length >= 3) {
    const shortSleepSkin = checkinsWithSleep.filter((c) => {
      const sleep = sleepByDate.get(c.date);
      return (sleep?.duration_min ?? 0) < 360 && c.skin_state <= 5;
    });
    const strength = shortSleepSkin.length / checkinsWithSleep.length;
    insights.push({
      title: 'Sono e pele',
      body:
        strength >= 0.45
          ? `Em ${Math.round(strength * 100)}% das noites com menos de 6h, a pele apareceu mais reativa. Barreira e hidratação têm mais ROI nesses dias.`
          : 'Seu sono ainda não formou padrão forte com a pele. Continue registrando para a leitura ficar mais precisa.',
      strength,
    });
  }

  // Sono < 6h → energia baixa no dia seguinte
  if (checkinsWithSleep.length >= 3) {
    const shortSleepEnergy = checkinsWithSleep.filter((c) => {
      const sleep = sleepByDate.get(c.date);
      return (sleep?.duration_min ?? 0) < 390 && c.energy <= 5;
    });
    const strength = shortSleepEnergy.length / checkinsWithSleep.length;
    if (strength >= 0.35) {
      insights.push({
        title: 'Sono e energia',
        body: `Noites abaixo de 6h30 coincidem com energia ≤5 em ${Math.round(strength * 100)}% dos registros. Sono é o lever mais direto de energia.`,
        strength,
      });
    }
  }

  // Sono < 6h → calma baixa
  if (checkinsWithSleep.length >= 3) {
    const shortSleepCalm = checkinsWithSleep.filter((c) => {
      const sleep = sleepByDate.get(c.date);
      return (sleep?.duration_min ?? 0) < 390 && c.calm <= 4;
    });
    const strength = shortSleepCalm.length / checkinsWithSleep.length;
    if (strength >= 0.35) {
      insights.push({
        title: 'Sono e calma',
        body: `${Math.round(strength * 100)}% das noites curtas aparecem com calma baixa no dia seguinte. Ansiedade leve pode ser fisiológica, não só emocional.`,
        strength,
      });
    }
  }

  // Desequilíbrio corpo/mente
  const activeDays = scores.filter((s) => s.score_mind > 0 && s.score_body > 0);
  if (hasDimension('body') && hasDimension('mind') && activeDays.length >= 5) {
    const avgMind = average(activeDays.map((s) => s.score_mind));
    const avgBody = average(activeDays.map((s) => s.score_body));
    const diff = avgBody - avgMind;
    insights.push({
      title: 'Treino e mente',
      body:
        diff > 15
          ? `O corpo está ${Math.round(diff)}pts à frente da mente na semana. Uma pausa ativa ou prática contemplativa fecha essa brecha.`
          : diff < -15
            ? `A mente está ${Math.round(Math.abs(diff))}pts à frente do corpo. Considere aumentar movimento ou intensidade do treino.`
            : 'Corpo e mente estão equilibrados. Isso é base sólida para ajustar sono e dieta sem sobrecarga.',
      strength: Math.min(1, Math.abs(diff) / 40),
    });
  }

  // Dieta irregular
  const dietDays = scores.filter((s) => s.score_diet > 0);
  if (hasDimension('diet') && dietDays.length >= 5) {
    const avgDiet = average(dietDays.map((s) => s.score_diet));
    const dietVariance = variance(dietDays.map((s) => s.score_diet));
    insights.push({
      title: 'Consistência da dieta',
      body:
        avgDiet < 50
          ? 'Alimentação irregular no histórico. Registrar pelo menos a refeição principal já muda a leitura de energia.'
          : dietVariance > 400
            ? 'Dieta tem alta variação dia a dia. Padrão mais estável no café da manhã tende a estabilizar o resto.'
            : 'Dieta sustentando o ritual. As fotos de refeição ajudam a IA a capturar qualidade além de quantidade.',
      strength: avgDiet / 100,
    });
  }

  // Energia consistente alta
  const energyDays = checkins.filter((c) => c.energy >= 7);
  if (energyDays.length >= 4 && checkins.length >= 5) {
    const rate = energyDays.length / checkins.length;
    insights.push({
      title: 'Energia sustentada',
      body:
        rate >= 0.7
          ? `Energia ≥7 em ${Math.round(rate * 100)}% dos dias registrados. O que está funcionando merece manutenção, não mudança.`
          : `Energia alta em ${Math.round(rate * 100)}% dos dias. Analise o que diferencia os dias bons dos fracos.`,
      strength: rate,
    });
  }

  // Espírito alto → energia alta no mesmo dia
  const spiritAndEnergy = scores.filter((s) => s.score_spirit > 70);
  const matchingCheckins = spiritAndEnergy.map((s) => checkins.find((c) => c.date === s.date)).filter(Boolean);
  if (hasDimension('spirit') && matchingCheckins.length >= 3) {
    const highEnergy = matchingCheckins.filter((c) => (c?.energy ?? 0) >= 7);
    const strength = highEnergy.length / matchingCheckins.length;
    if (strength >= 0.55) {
      insights.push({
        title: 'Espírito e energia',
        body: `Dias com ritual espiritual completo coincidem com energia alta em ${Math.round(strength * 100)}% dos registros. Intenção e presença têm retorno físico.`,
        strength,
      });
    }
  }

  if (!insights.length) {
    insights.push({
      title: 'Primeira leitura',
      body: `Registre sono, energia e ${dimensionLabels(active)} por alguns dias. As correlações aparecem quando o ritual deixa rastro.`,
      strength: 0.2,
    });
  }

  return insights.sort((a, b) => b.strength - a.strength);
}

/** Resumo em texto das correlações, para enviar ao Gemini como contexto. */
export function correlationsToText(correlations: CorrelationInsight[]): string {
  return correlations
    .map((c) => `- ${c.title} (força ${Math.round(c.strength * 100)}%): ${c.body}`)
    .join('\n');
}

function average(values: number[]) {
  const valid = values.filter((v) => Number.isFinite(v));
  if (!valid.length) return 0;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function variance(values: number[]) {
  const avg = average(values);
  return average(values.map((v) => (v - avg) ** 2));
}
