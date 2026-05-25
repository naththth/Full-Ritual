// Prompt interno da IA NUTRI — Full Ritual
// Regra: nunca diagnosticar, nunca prescrever, nunca inventar dados.

export const IA_NUTRI_SYSTEM_PROMPT = `Você é a IA NUTRI do app Full Ritual.

Seu papel é apoiar o usuário na organização da alimentação, leitura de padrões alimentares, adaptação de rotina, hidratação, composição de refeições e preparação para treinos, sempre com base em princípios de nutrição baseada em evidências.

Você não é nutricionista, médico ou profissional de saúde do usuário. Você não diagnostica, não prescreve tratamento, não altera medicamentos e não substitui orientação profissional. Quando houver prescrição nutricional, exames, medicamentos, sintomas persistentes ou condição clínica, oriente o usuário a validar decisões com profissional habilitado.

PRINCÍPIOS CIENTÍFICOS OBRIGATÓRIOS:
- Use evidência consolidada: consensos ISSN, ACSM, Academy of Nutrition and Dietetics, meta-análises de proteína e periodização nutricional esportiva.
- Diferenciece consenso, provável, incerto e pseudociência quando importar.
- Alimentação suficiente vem antes de restrição. Déficit, quando indicado, deve ser moderado, sustentável e individualizado.
- Proteína adequada e distribuída ao longo do dia: referência geral de 1,2 a 1,6g/kg/dia para população ativa; até 2,2g/kg/dia para atletas em déficit.
- Carboidrato e gordura não são vilões. Ajuste carboidrato à demanda, especialmente em perfis esportivos.
- Longevidade fica na base: micronutrientes, fibra, gorduras de boa qualidade, variedade, baixa dependência de ultraprocessados.
- Indivíduo antes do protocolo. Adapte para mulheres, idosos, adolescentes, vegetarianos, condições clínicas. Encaminhe quando sair do escopo.
- Proteja disponibilidade energética em alto volume de treino. Sinalize risco de RED-S (Relative Energy Deficiency in Sport).

REGRAS INEGOCIÁVEIS:
1. Não sugerir dietas extremas.
2. Não prometer emagrecimento rápido.
3. Não prescrever calorias agressivamente baixas.
4. Não recomendar jejum como dogma.
5. Não recomendar exclusão de grupos alimentares sem justificativa científica clara.
6. Não recomendar suplementação em dose clínica ou terapêutica sem contexto profissional.
7. Não interpretar exames como diagnóstico.
8. Não alterar medicamentos.
9. Não usar tom de julgamento, culpa ou terrorismo alimentar.
10. Não reforçar comportamento alimentar de risco.
11. Sempre respeitar intolerâncias, alergias e restrições.
12. Sempre priorizar orientação profissional já existente — não contradizer prescrição de nutricionista.
13. Sempre deixar claro quando algo é estimativa.
14. Sempre explicar a lógica nutricional de forma simples.
15. Sempre sugerir ações práticas e sustentáveis.

SINAIS DE ALERTA — encaminhar para profissional imediatamente:
- Transtorno alimentar suspeito (restrição extrema, compulsão frequente, comportamento purgativo)
- RED-S, fadiga persistente com alto volume de treino, alteração de ciclo menstrual
- Fraturas por estresse, diabetes, doença renal, distúrbio gastrointestinal importante
- Exames alterados, uso de medicamentos que impactem metabolismo ou absorção
- Gestação, lactação ou condição clínica relevante que demande plano individualizado

ESTRUTURA DE RESPOSTA:
Organize sempre em blocos:
1. Leitura do contexto
2. O que parece positivo
3. Pontos de atenção
4. Sugestões práticas (ações concretas para o dia ou semana)
5. Como ajustar na rotina
6. Quando validar com profissional

TOM: científico, cuidadoso, direto, acolhedor e prático. Sem moralismo, terrorismo nutricional, infantilização, buzzwords de dieta ou promessas. Português natural e maduro.`;

export function buildNutriContext(profile: Record<string, unknown>, extra?: {
  manualMeals?: unknown[];
  pdfDoc?: { file_name: string } | null;
  latestLab?: { date?: string; lab_name?: string | null; markers?: Record<string, unknown>; file_type?: string | null } | null;
  waterToday?: number;
  question?: string;
}): string {
  const parts: string[] = [];

  if (profile.goal) parts.push(`Objetivo: ${profile.goal}`);
  if (profile.objective_details) parts.push(`Detalhes do objetivo: ${profile.objective_details}`);
  if (profile.weight_kg) parts.push(`Peso: ${profile.weight_kg}kg`);
  const estimatedTargets = estimateNutritionTargets(profile.weight_kg, profile.goal, profile.objective_details);
  if (estimatedTargets) {
    parts.push('ESTIMATIVA INICIAL DA IA NUTRI — usar como ponto de partida, não prescrição:');
    parts.push(`  Calorias estimadas: ${estimatedTargets.calories}kcal/dia`);
    parts.push(`  Proteína estimada: ${estimatedTargets.protein}g/dia (${estimatedTargets.proteinPerKg}g/kg)`);
    parts.push(`  Contexto do cálculo: ${estimatedTargets.label}`);
  }
  if (profile.height_cm) parts.push(`Altura: ${profile.height_cm}cm`);
  if (profile.age) parts.push(`Idade: ${profile.age} anos`);
  if (profile.sex) parts.push(`Sexo: ${profile.sex}`);
  if (profile.activity_level) parts.push(`Nível de atividade: ${profile.activity_level}`);
  if (profile.work_routine) parts.push(`Rotina de trabalho: ${profile.work_routine}`);
  if (profile.desired_meals_count) parts.push(`Refeições desejadas: ${profile.desired_meals_count}`);
  if (profile.hunger_level) parts.push(`Nível de fome: ${profile.hunger_level}`);

  if (profile.training_routine) parts.push(`Treino: ${profile.training_routine}`);
  if (profile.training_frequency) parts.push(`Frequência de treino: ${profile.training_frequency}`);
  if (profile.training_schedule) parts.push(`Horários de treino: ${profile.training_schedule}`);
  if (profile.training_duration_min) parts.push(`Duração dos treinos: ~${profile.training_duration_min}min`);
  if (profile.training_intensity) parts.push(`Intensidade de treino: ${profile.training_intensity}`);
  if (profile.fasted_training) parts.push('Treina em jejum: sim');
  if (profile.sports_goal) parts.push(`Objetivo esportivo: ${profile.sports_goal}`);

  if (profile.liked_foods) parts.push(`Alimentos que gosta: ${profile.liked_foods}`);
  if (profile.avoided_foods) parts.push(`Alimentos que evita: ${profile.avoided_foods}`);
  if (profile.current_water_ml) parts.push(`Consumo atual de água: ${profile.current_water_ml}ml/dia`);
  if (profile.supplements) parts.push(`Suplementos: ${profile.supplements}`);

  if (profile.dietary_restrictions) parts.push(`Restrições alimentares: ${profile.dietary_restrictions}`);
  if (profile.intolerances) parts.push(`Intolerâncias: ${profile.intolerances}`);
  if (profile.allergies) parts.push(`Alergias: ${profile.allergies}`);
  if (profile.digestive_symptoms) parts.push(`Sintomas digestivos: ${profile.digestive_symptoms}`);
  if (profile.injuries) parts.push(`Lesões relevantes: ${profile.injuries}`);
  if (profile.medications) parts.push(`Medicamentos: ${profile.medications}`);

  if (profile.diet_history) parts.push(`Histórico de dietas: ${profile.diet_history}`);
  if (profile.appetite_and_energy) parts.push(`Fome, saciedade e energia: ${profile.appetite_and_energy}`);
  if (profile.budget) parts.push(`Orçamento: ${profile.budget}`);
  if (profile.cooking_skill) parts.push(`Habilidade culinária: ${profile.cooking_skill}`);
  if (profile.available_meal_times) parts.push(`Horários disponíveis para refeições: ${profile.available_meal_times}`);

  if (extra?.pdfDoc) parts.push(`Dieta DietBox cadastrada: ${extra.pdfDoc.file_name}`);
  if (extra?.manualMeals && Array.isArray(extra.manualMeals) && extra.manualMeals.length > 0) {
    parts.push(`Dieta manual cadastrada: ${extra.manualMeals.length} refeição(ões)`);
  }
  if (extra?.latestLab) {
    const markerCount = extra.latestLab.markers ? Object.keys(extra.latestLab.markers).length : 0;
    parts.push(`Exame mais recente no hub de saúde: ${extra.latestLab.lab_name ?? 'laboratório não informado'} · ${extra.latestLab.date ?? 'sem data'} · ${markerCount} marcador(es) salvo(s).`);
    parts.push('Use exames apenas como contexto informativo. Não interpretar como diagnóstico.');
  }
  if (extra?.waterToday !== undefined) parts.push(`Água hoje: ${extra.waterToday}ml`);

  return parts.join('\n');
}

function estimateNutritionTargets(weightValue: unknown, goalValue: unknown, objectiveDetailsValue: unknown): {
  calories: number;
  protein: number;
  proteinPerKg: number;
  label: string;
} | null {
  const weight = Number(weightValue);
  if (!Number.isFinite(weight) || weight < 30 || weight > 300) return null;

  const goal = typeof goalValue === 'string' ? goalValue : '';
  const details = typeof objectiveDetailsValue === 'string' ? objectiveDetailsValue : '';
  const config = adjustTargetConfigForDetails(targetConfigForGoal(goal), details);
  return {
    calories: Math.round(weight * config.calorieFactor),
    protein: Math.round(weight * config.proteinPerKg),
    proteinPerKg: config.proteinPerKg,
    label: config.label,
  };
}

function adjustTargetConfigForDetails(
  config: { calorieFactor: number; proteinPerKg: number; label: string },
  details: string,
) {
  const text = normalizeText(details);
  if (!text) return config;

  if (matchesAny(text, ['emagrecer', 'perder gordura', 'perda de gordura', 'secar', 'definicao', 'definir', 'reduzir peso'])) {
    return {
      calorieFactor: Math.min(config.calorieFactor, 27),
      proteinPerKg: Math.max(config.proteinPerKg, 1.8),
      label: `${config.label} · ajuste para perda de gordura`,
    };
  }

  if (matchesAny(text, ['ganhar massa', 'hipertrofia', 'massa muscular', 'aumentar peso', 'bulk', 'superavit'])) {
    return {
      calorieFactor: Math.max(config.calorieFactor, 34),
      proteinPerKg: Math.max(config.proteinPerKg, 1.8),
      label: `${config.label} · ajuste para ganho de massa`,
    };
  }

  if (matchesAny(text, ['maratona', 'prova', 'corrida', 'pedal', 'endurance', 'performance', 'competicao'])) {
    return {
      calorieFactor: Math.max(config.calorieFactor, 34),
      proteinPerKg: Math.max(config.proteinPerKg, 1.7),
      label: `${config.label} · ajuste para demanda esportiva`,
    };
  }

  if (matchesAny(text, ['manter', 'manutencao', 'sem emagrecer', 'sem perder peso'])) {
    return {
      calorieFactor: Math.max(config.calorieFactor, 30),
      proteinPerKg: Math.max(config.proteinPerKg, 1.6),
      label: `${config.label} · ajuste para manutenção`,
    };
  }

  return config;
}

function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function matchesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(normalizeText(term)));
}

function targetConfigForGoal(goal: string) {
  switch (goal) {
    case 'performance':
      return { calorieFactor: 34, proteinPerKg: 1.8, label: 'performance e recuperação' };
    case 'composicao':
      return { calorieFactor: 28, proteinPerKg: 1.8, label: 'composição corporal' };
    case 'energia':
      return { calorieFactor: 32, proteinPerKg: 1.6, label: 'energia estável' };
    case 'longevidade':
      return { calorieFactor: 30, proteinPerKg: 1.6, label: 'longevidade e manutenção' };
    case 'condicao_especifica':
      return { calorieFactor: 30, proteinPerKg: 1.5, label: 'ponto de partida conservador' };
    case 'saude_geral':
    default:
      return { calorieFactor: 30, proteinPerKg: 1.6, label: 'saúde geral' };
  }
}
