import type { Checkin, DailyScore, SleepLog } from '../types';

export interface CorrelationInsight {
  title: string;
  body: string;
  strength: number;
}

export function buildAutomaticCorrelations({
  sleepLogs,
  checkins,
  scores,
}: {
  sleepLogs: SleepLog[];
  checkins: Checkin[];
  scores: DailyScore[];
}): CorrelationInsight[] {
  const insights: CorrelationInsight[] = [];

  const sleepByDate = new Map(sleepLogs.map((sleep) => [sleep.date, sleep]));
  const checkinsWithSleep = checkins.filter((checkin) => sleepByDate.get(checkin.date)?.duration_min);
  const shortSleepSkin = checkinsWithSleep.filter((checkin) => {
    const sleep = sleepByDate.get(checkin.date);
    return (sleep?.duration_min ?? 0) < 360 && checkin.skin_state <= 5;
  });

  if (checkinsWithSleep.length >= 2) {
    const strength = shortSleepSkin.length / checkinsWithSleep.length;
    insights.push({
      title: 'Sono e pele',
      body:
        strength >= 0.45
          ? 'Quando o sono fica abaixo de seis horas, a pele aparece mais reativa nos registros. Hoje vale priorizar barreira, água e menos ativos.'
          : 'Seu sono ainda não formou um padrão forte com a pele. Continue registrando duração e estado da pele para a leitura ficar mais precisa.',
      strength,
    });
  }

  const mindScores = scores.filter((score) => score.score_mind > 0);
  if (mindScores.length >= 5) {
    const avgMind = average(mindScores.map((score) => score.score_mind));
    const avgBody = average(mindScores.map((score) => score.score_body));
    insights.push({
      title: 'Treino e calma',
      body:
        avgBody > avgMind + 12
          ? 'O corpo está recebendo mais presença que a mente. Uma pausa curta depois do treino ajuda o sistema a entender que terminou.'
          : 'Corpo e mente estão relativamente próximos. Esse equilíbrio é uma boa base para ajustar sono e dieta sem excesso.',
      strength: Math.min(1, Math.abs(avgBody - avgMind) / 50),
    });
  }

  const dietScores = scores.filter((score) => score.score_diet > 0);
  if (dietScores.length >= 5) {
    const avgDiet = average(dietScores.map((score) => score.score_diet));
    insights.push({
      title: 'Dieta e energia',
      body:
        avgDiet < 55
          ? 'A alimentação está ficando irregular no histórico. Registrar foto e refeição principal já melhora a leitura de energia.'
          : 'A dieta está sustentando o ritual. As fotos de refeição vão ajudar a IA a perceber variações de humor e saciedade.',
      strength: avgDiet / 100,
    });
  }

  if (!insights.length) {
    insights.push({
      title: 'Primeira leitura',
      body: 'Registre sono, pele, treino e refeições por alguns dias. As correlações aparecem melhor quando o ritual deixa rastro.',
      strength: 0.2,
    });
  }

  return insights;
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}
