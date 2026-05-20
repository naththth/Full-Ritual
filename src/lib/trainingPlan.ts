import type {
  DayOfWeek,
  IntensityLevel,
  TrainingBlock,
  TrainingDay,
  TrainingModality,
  TrainingProfile,
} from '../types';

const DAY_ORDER: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL: Record<DayOfWeek, string> = {
  mon: 'segunda',
  tue: 'terça',
  wed: 'quarta',
  thu: 'quinta',
  fri: 'sexta',
  sat: 'sábado',
  sun: 'domingo',
};

export function dayLabel(day: DayOfWeek): string {
  return DAY_LABEL[day];
}

export function dayShortLabel(day: DayOfWeek): string {
  return DAY_LABEL[day].slice(0, 3);
}

export function isoMondayOf(date: Date): string {
  const copy = new Date(date);
  const dow = copy.getDay(); // 0 = sun
  const diff = dow === 0 ? -6 : 1 - dow;
  copy.setDate(copy.getDate() + diff);
  return copy.toISOString().slice(0, 10);
}

export function dayIndexFromIso(iso: string, weekStartIso: string): number {
  const start = new Date(`${weekStartIso}T00:00:00`);
  const target = new Date(`${iso}T00:00:00`);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

interface SlotPlan {
  modality: TrainingModality | 'rest';
  intensity: IntensityLevel;
}

/**
 * Distribui modalidades pelos dias disponíveis seguindo regras simples:
 * - LPO trava no sábado se selecionado e sábado disponível;
 * - Musculação separa do cardio quando possível;
 * - Corrida e pedal alternam para não sobrecarregar pernas;
 * - Dias não selecionados viram descanso.
 */
export function distributeModalities(profile: TrainingProfile): Record<DayOfWeek, SlotPlan> {
  const slots: Record<DayOfWeek, SlotPlan> = {
    mon: { modality: 'rest', intensity: 'easy' },
    tue: { modality: 'rest', intensity: 'easy' },
    wed: { modality: 'rest', intensity: 'easy' },
    thu: { modality: 'rest', intensity: 'easy' },
    fri: { modality: 'rest', intensity: 'easy' },
    sat: { modality: 'rest', intensity: 'easy' },
    sun: { modality: 'rest', intensity: 'easy' },
  };

  const available = new Set<DayOfWeek>(profile.available_days);
  const modalities = [...profile.modalities];
  const hasLpo = modalities.includes('lpo');

  // 1) LPO fixo no sábado, se aplicável
  if (hasLpo && profile.lpo_saturday_9am && available.has('sat')) {
    slots.sat = { modality: 'lpo', intensity: 'hard' };
  }

  // 2) Ordena os outros dias
  const remainingDays = DAY_ORDER.filter((d) => available.has(d) && slots[d].modality === 'rest');
  const cardioModalities = modalities.filter((m) => m === 'corrida' || m === 'pedal');
  const strengthSelected = modalities.includes('musculacao');

  // Round-robin priorizando alternância cardio/força
  let cardioIdx = 0;
  let useStrength = !strengthSelected ? false : true;

  remainingDays.forEach((day, i) => {
    const wantStrength = strengthSelected && useStrength && i % 2 === 0;
    if (wantStrength) {
      slots[day] = { modality: 'musculacao', intensity: 'moderate' };
    } else if (cardioModalities.length > 0) {
      const mod = cardioModalities[cardioIdx % cardioModalities.length];
      cardioIdx += 1;
      const isLongDay = day === 'sun' || day === 'sat';
      slots[day] = {
        modality: mod,
        intensity: isLongDay ? 'hard' : 'moderate',
      };
    } else if (strengthSelected) {
      slots[day] = { modality: 'musculacao', intensity: 'moderate' };
    }
  });

  return slots;
}

interface SessionContent {
  title: string;
  blocks: TrainingBlock[];
}

function blocksToDetails(blocks: TrainingBlock[]): string {
  return blocks.map((b) => `${b.title.toUpperCase()}\n${b.content}`).join('\n\n');
}

function buildSession(
  modality: TrainingModality | 'rest',
  intensity: IntensityLevel,
  profile: TrainingProfile,
): SessionContent {
  if (modality === 'rest') {
    return {
      title: 'descanso ativo',
      blocks: [
        {
          id: 'rest',
          icon: '○',
          title: 'descanso ativo',
          content: 'O descanso é treino. 10–15 min de mobilidade articular — quadril, tornozelo, torácica. Caminhada leve em Z1 se sentir vontade. Foco em recuperação do sistema nervoso central. Sem cobrança de desempenho.',
        },
      ],
    };
  }
  if (modality === 'lpo') return buildLpo(profile);
  if (modality === 'musculacao') return buildMusculacao(intensity, profile);
  if (modality === 'corrida') return buildCorrida(intensity, profile);
  return buildPedal(intensity, profile);
}

function buildLpo(profile: TrainingProfile): SessionContent {
  const fullOly = profile.lpo_movements === 'full_oly';
  const coachNote = profile.lpo_has_coach ? '\n↳ Siga a periodização do coach para carga.' : '';

  return {
    title: 'LPO',
    blocks: [
      { id: 'warmup', icon: '◇', title: 'aquecimento', duration: '15–20 min',
        content: fullOly
          ? 'Foam roller torácico · rotação torácica 10×/lado\nOverhead squat PVC 3×10 · hang power snatch vazio 3×3'
          : 'Mobilidade tornozelo 90s/lado · abertura quadril\nOverhead squat PVC 3×10 · hang pull vazio 3×5' },
      { id: 'main', icon: '◆', title: fullOly ? 'snatch + clean & jerk' : 'power clean + push press', duration: fullOly ? '55 min' : '45 min',
        content: fullOly
          ? 'SNATCH — 6 séries: 3→2→2→2→1→1 · desc 2–3 min\n↳ Extensão total antes do pull. Se travou no 3º pull, pare a carga.\n\nCLEAN & JERK — 5 séries de 2+1 · desc 2 min\n↳ Cotovelo alto na recepção. Split firme no jerk.'
          : 'POWER CLEAN — 5×3 progressivo (60→75% 1RM) · desc 2 min\n↳ Barra rente ao corpo, coxas paralelas na recepção.\n\nPUSH PRESS — 4×5 @70–75% 1RM · desc 90s\n↳ Dip vertical e drive do quadril, não do joelho.' + coachNote },
      { id: 'accessory', icon: '◈', title: 'acessório + desaquecimento',
        content: fullOly
          ? 'Agachamento frontal 3×3 @80% 1RM · desc 2 min\nRespira diafragmático deitado 5 min · gelo em punhos se necessário'
          : 'Agachamento frontal 3×5 técnico · RDL 3×8 excêntrico 3s\nPigeon pose 90s/lado' },
    ],
  };
}

function buildMusculacao(intensity: IntensityLevel, profile: TrainingProfile): SessionContent {
  const split = profile.strength_split ?? 'fullbody';
  const location = profile.strength_location ?? 'gym';
  const locNote = location === 'home' ? ' (casa: halteres/elásticos)' : location === 'outdoor' ? ' (ar livre: peso corporal)' : '';

  const h = intensity === 'hard';

  // helper: 3 blocos por sessão — aquecimento, lista completa de exercícios, desaquecimento
  const musSession = (
    title: string,
    warmup: string,
    exercises: string,
    cooldown: string,
    warmupDur = '8 min',
    mainDur = `${profile.session_minutes - 15} min${locNote}`,
  ): SessionContent => ({
    title,
    blocks: [
      { id: 'warmup', icon: '◇', title: 'aquecimento', duration: warmupDur, content: warmup },
      { id: 'main',   icon: '◆', title: 'treino',      duration: mainDur,   content: exercises },
      { id: 'cooldown', icon: '○', title: 'desaquecimento', duration: '5 min', content: cooldown },
    ],
  });

  if (split === 'fullbody') return musSession(
    h ? 'full body pesado' : 'full body',
    'Rotação quadril 10×/lado · mobilidade escapular · ponte 2×15 · agachamento de parede ×10',
    `Agachamento livre — ${h ? '5×5 · RPE 8–9 · desc 3min' : '4×8 · RPE 7 · desc 2min'}
Supino inclinado haltere — ${h ? '4×6 · RPE 7' : '4×10 · RPE 7'} · desc 90s
Remada curvada supinada — 4×${h ? '6' : '10'} · RPE 8 · desc 90s
Desenvolvimento haltere — 3×${h ? '8' : '12'} · desc 60s
Romanian Deadlift — 3×${h ? '6' : '10'} · RPE 7 · desc 90s
Dead bug — 3×8/lado · Prancha lateral — 2×30s`,
    'Quadríceps 90s/lado · peitoral doorway 60s · isquio 60s/lado',
  );

  if (split === 'upper_lower') {
    if (h) return musSession(
      'lower body',
      'Mobilidade tornozelo 90s/lado · clamshell 2×15/lado · ponte 2×20 · agachamento de parede 2×10',
      `Agachamento livre — 5×5 · RPE 8 · desc 3min  ↑2,5kg se limpo
Leg press — 3×12 amplitude total · desc 90s
Romanian Deadlift — 4×8 · RPE 7–8 · desc 2min  exc 3–4s
Cadeira flexora / Nordic curl — 3×10 · desc 90s
Afundo búlgaro — 3×10/perna · desc 60s
Panturrilha em pé — 4×15 · pausa 2s no topo
Prancha — 3×45s · Bird dog — 3×8/lado`,
      'Pigeon pose 90s/lado · distração tornozelo 60s/lado',
      '10 min',
    );
    return musSession(
      'upper body',
      'Abertura torácica · rotação externa ombro 2×15 · ativação manguito rotador',
      `Supino reto — 4×6 · RPE 8 · desc 2–3min
Pull-up / puxada — 4×6–8 · RPE 8 · desc 2min
Desenvolvimento militar — 3×8 · RPE 7 · desc 90s
Remada unilateral — 3×10/lado · desc 60s
Crucifixo inclinado — 3×15 exc 3s · desc 60s
Face pull corda — 3×20 leve · desc 45s`,
      'Peitoral doorway 2×60s · mobilidade torácica foam roller',
    );
  }

  if (split === 'ppl') {
    if (h) return musSession(
      'pull',
      'Depressão escapular 2×10 · face pull leve 2×20 · manguito rotador elástico 2×15/lado',
      `Deadlift convencional — 4×5 · RPE 8 · desc 3min  empurre o chão
Pull-up — 4×6 · RPE 8 · desc 2min
Remada curvada pronada — 4×8 · RPE 7 · desc 90s
Puxada fechada supinada — 3×12 · desc 60s
Rosca direta — 3×12 · desc 60s
Rosca martelo — 3×15 · desc 45s
Curl deitado — 3×10 exc 3–4s (posterior coxa)`,
      'Bíceps na parede 60s/lado · posterior ombro 60s/lado',
    );
    return musSession(
      'push',
      'Rotação interna/externa ombro · tríceps elástico · flexão com pausa 2×10',
      `Supino inclinado haltere — 4×8 · RPE 7–8 · desc 2min  cotovelo 45°
Desenvolvimento Arnold — 3×10 · desc 90s
Crucifixo inclinado cabo — 3×15 · desc 60s
Elevação lateral — 3×20 pausa 1s · desc 45s
Tríceps corda — 4×15 pausa na extensão · desc 45s
Tríceps francês — 3×12 · RPE 6 · desc 60s
Finalizador: 100 elevações laterais — 4×25 · desc 30s`,
      'Tríceps na parede 60s/lado · mobilidade ombro anterior',
    );
  }

  return musSession(
    'musculação',
    'Mobilidade articular do grupo do dia · ativação com carga leve',
    `2–3 compostos: 4×5–8 · RPE 7–9 · desc 2–3min
2–3 isolados: 3×12–15 · desc 60–90s
Última série deve ser desafiadora — sem energia sobrada = carga baixa`,
    'Alongamento estático do grupo trabalhado',
  );
}

function buildCorrida(intensity: IntensityLevel, profile: TrainingProfile): SessionContent {
  const pace = profile.corrida_pace_min_per_km;
  const raceNote = profile.corrida_has_race && hasMeaningfulEventInfo(profile.corrida_race_info)
    ? `\n↳ Temporada: ${profile.corrida_race_info}` : '';

  if (intensity === 'easy') {
    return {
      title: 'corrida · regenerativa',
      blocks: [
        { id: 'warmup', icon: '◇', title: 'aquecimento', duration: '5 min', content: 'Caminhada progressiva · respiração nasal' },
        { id: 'main', icon: '◆', title: 'trote Z1', duration: '20–25 min',
          content: `RPE 3–4${pace ? ` · abaixo de ${pace}/km` : ''} · FC Z1 exclusivamente\nSe FC subir para Z2: reduza ou caminhe — objetivo é flush metabólico` },
        { id: 'cooldown', icon: '○', title: 'desaquecimento', duration: '5 min',
          content: 'Caminhada + panturrilha · quadríceps · flexor de quadril' + raceNote },
      ],
    };
  }

  if (intensity === 'hard') {
    return {
      title: 'corrida · longão',
      blocks: [
        { id: 'warmup', icon: '◇', title: 'aquecimento', duration: '10 min', content: 'Trote Z1 progressivo para Z2' },
        { id: 'main', icon: '◆', title: 'base Z2 + progressão Z3',
          content: `80% do tempo — Z2 · RPE 5–6 · conversa possível${pace ? ` · ~${pace}/km` : ''} · cad 170–180ppm\n20% final — Z3 · RPE 6–7 · progressão natural\n↳ A partir de 60min: gel/banana a cada 40–45min · 400–600ml/h` },
        { id: 'cooldown', icon: '○', title: 'desaquecimento', duration: '10 min',
          content: 'Caminhada + rolo: panturrilha · IT · fáscia plantar' + raceNote },
      ],
    };
  }

  const pace600 = calcPaceFor600(pace);
  return {
    title: 'corrida · intervalado',
    blocks: [
      { id: 'warmup', icon: '◇', title: 'aquecimento', duration: '12 min',
        content: 'Trote Z1→Z2 progressivo + 4 strides 80m a 75% esforço' },
      { id: 'main', icon: '◆', title: '6 × 600m', duration: '~25 min',
        content: `Z4–Z5 · RPE 8–9${pace600 ? ` · alvo ~${pace600}/600m` : ''}\nRec: 90s trote lento entre reps\nConsistência > velocidade. Última rep = mesma cadência que a 1ª` },
      { id: 'cooldown', icon: '○', title: 'volta calma', duration: '15 min',
        content: 'Z1 + isquio · panturrilha · glúteo' + raceNote },
    ],
  };
}

function buildPedal(intensity: IntensityLevel, profile: TrainingProfile): SessionContent {
  const ftp = profile.pedal_ftp_watts;
  const trainerNote = 'Speed no rolo: potência estável, cadência e RPE mandam mais que velocidade.';
  const eventNote = profile.pedal_has_event && hasMeaningfulEventInfo(profile.pedal_event_info)
    ? `\n↳ Evento: ${profile.pedal_event_info}` : '';
  const pw = (lo: number, hi: number) => ftp ? ` · ${Math.round(ftp * lo)}–${Math.round(ftp * hi)}W` : '';

  if (intensity === 'easy') {
    return {
      title: 'pedal · recuperação',
      blocks: [
        { id: 'warmup', icon: '◇', title: 'aquecimento', duration: '8 min',
          content: `Z1 progressivo${pw(0.40, 0.55)}\nComece solto no rolo, sem travar ombro e sem perseguir velocidade.` },
        { id: 'main', icon: '◌', title: 'Z1 contínuo', duration: '40–50 min',
          content: `Base solta no rolo — RPE 3–4 · cad 85–95rpm${ftp ? ` · <${Math.round(ftp * 0.55)}W` : ''}\nFoco técnico — pedalada redonda, quadril quieto no selim, mãos leves no guidão.\nLeitura do rolo — ${trainerNote}\nSe a perna pesar — reduza 5–10W e mantenha cadência.` + eventNote },
        { id: 'cooldown', icon: '○', title: 'volta calma', duration: '6 min',
          content: `Z1 leve${pw(0.40, 0.50)}\nSolte a cadência e deixe a frequência cardíaca cair antes de sair do rolo.` },
      ],
    };
  }

  if (intensity === 'hard') {
    return {
      title: 'pedal · longo',
      blocks: [
        { id: 'warmup', icon: '◇', title: 'aquecimento', duration: '15 min',
          content: `Z1→Z2 progressivo${pw(0.46, 0.75)}\nNo rolo: suba potência aos poucos, sem sprintar. Cadência 85–95rpm.` },
        { id: 'main', icon: '◆', title: 'endurance Z2 + progressão',
          content: `Bloco 1: base longa — 70% do tempo · Z2${pw(0.56, 0.75)} · RPE 5–6 · cad 85–95rpm\nBloco 2: progressão controlada — 20% do tempo · Z3${pw(0.76, 0.90)} · RPE 6–7 · cad 88–95rpm\nBloco 3: fechamento forte — 10% final · Z4${pw(0.91, 1.05)} · RPE 7–8 · não deixe cadência cair abaixo de 80rpm\nNutrição no rolo — >60min: 60–90g CHO/hora · 500–700ml/h + eletrólitos\nTécnica — quadril estável, tronco quieto e pressão constante nos pedais.\nLeitura do rolo — ${trainerNote}` },
        { id: 'cooldown', icon: '○', title: 'desaquecimento', duration: '10 min',
          content: `Z1 leve${pw(0.40, 0.55)}\nDepois do rolo: glúteo médio · TFL · panturrilha, 60s cada.` + eventNote },
      ],
    };
  }

  return {
    title: 'pedal · base qualidade',
    blocks: [
      { id: 'warmup', icon: '◇', title: 'aquecimento', duration: '10 min',
        content: `Z1→Z2 progressivo${pw(0.46, 0.75)}\nNo rolo: aumente a carga em rampa, mantendo cadência 85–95rpm e respiração controlada.` },
      { id: 'main', icon: '◆', title: '3 × 10min Z3',
        content: `Bloco 1 — 10min Z3${pw(0.76, 0.90)} · RPE 6–7 · cad 88–95rpm\nRecuperação — 5min Z2${pw(0.56, 0.75)} · respiração volta sem zerar esforço\nBloco 2 — 10min Z3${pw(0.76, 0.90)} · mesma potência do bloco 1, sem heroísmo\nRecuperação — 5min Z2${pw(0.56, 0.75)} · solte ombros e mandíbula\nBloco 3 — 10min Z3${pw(0.76, 0.90)} · feche estável, não em sprint\nTécnica no rolo — raspe o chão no retorno do pedal (6h→12h), quadril quieto e pressão constante.\nLeitura do rolo — ${trainerNote}` + eventNote },
      { id: 'cooldown', icon: '○', title: 'volta calma', duration: '10 min',
        content: `Z1 leve${pw(0.46, 0.55)}\nCadência solta, respiração baixa e sem buscar potência.` },
    ],
  };
}

function hasMeaningfulEventInfo(value: string | null | undefined): value is string {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return !['não', 'nao', 'no', 'n', 'nenhum', 'nenhuma', 'sem evento', 'sem prova', 'n/a', '-'].includes(normalized);
}

function calcPaceFor600(pace: string | null): string {
  if (!pace) return '';
  const parts = pace.split(':');
  if (parts.length !== 2) return '';
  const totalSeconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
  const for600 = Math.round(totalSeconds * 0.6 * 0.95); // 600m a ~5K pace
  const m = Math.floor(for600 / 60);
  const s = for600 % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function durationForModality(modality: TrainingModality | 'rest', baseMinutes: number): number {
  if (modality === 'rest') return 0;
  if (modality === 'lpo') return 90;
  if (modality === 'pedal') return Math.max(60, baseMinutes);
  if (modality === 'corrida') return Math.max(40, baseMinutes - 10);
  return baseMinutes;
}

/**
 * Gera um plano de uma semana a partir do perfil do usuário.
 * `explicitAssignments` mapeia cada dia a uma lista de modalidades (multi-select).
 * Se não fornecido, distribui automaticamente.
 */
export function generateTemplatePlan(
  profile: TrainingProfile,
  weekStartIso: string,
  explicitAssignments?: Partial<Record<DayOfWeek, (TrainingModality | 'rest')[]>>,
): TrainingDay[] {
  const startDate = new Date(`${weekStartIso}T00:00:00`);
  const autoSlots = explicitAssignments ? null : distributeModalities(profile);

  return DAY_ORDER.map((day, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const dateIso = date.toISOString().slice(0, 10);

    // Determina lista de modalidades para o dia
    let mods: (TrainingModality | 'rest')[];
    if (explicitAssignments) {
      mods = explicitAssignments[day] ?? ['rest'];
    } else {
      mods = [autoSlots![day].modality];
    }

    const active = mods.filter((m): m is TrainingModality => m !== 'rest');

    if (active.length === 0) {
      const restSession = buildSession('rest', 'easy', profile);
      return {
        day_index: index,
        date: dateIso,
        modality: 'rest',
        modalities: ['rest'],
        title: 'descanso ativo',
        details: blocksToDetails(restSession.blocks),
        blocks: restSession.blocks,
        duration_min: 0,
        intensity: 'easy',
      };
    }

    const isWeekend = day === 'sat' || day === 'sun';
    const sessions = active.map((m) => {
      const intens: IntensityLevel = m === 'lpo' ? 'hard' : isWeekend ? 'hard' : 'moderate';
      return { ...buildSession(m, intens, profile), intensity: intens };
    });

    const primaryIntensity = sessions[0].intensity;
    const allBlocks = sessions.flatMap((s, si) =>
      s.blocks.map((b) => ({
        ...b,
        id: `${si}-${b.id}`,
        modalityGroup: active.length > 1 ? MODALITY_LABEL[active[si]] : undefined,
      }))
    );

    return {
      day_index: index,
      date: dateIso,
      modality: active[0],
      modalities: active,
      title: sessions.map((s) => s.title).join(' · '),
      details: blocksToDetails(allBlocks),
      blocks: allBlocks,
      duration_min: active.reduce((sum, m) => sum + durationForModality(m, profile.session_minutes), 0),
      intensity: primaryIntensity,
    };
  });
}

/** Extrai as atribuições dia→modalidades[] de um plano existente. */
export function assignmentsFromPlan(
  planJson: TrainingDay[],
): Partial<Record<DayOfWeek, (TrainingModality | 'rest')[]>> {
  const result: Partial<Record<DayOfWeek, (TrainingModality | 'rest')[]>> = {};
  for (const day of planJson) {
    const key = DAY_ORDER[day.day_index];
    if (key) result[key] = day.modalities ?? [day.modality];
  }
  return result;
}

export const MODALITY_LABEL: Record<TrainingModality, string> = {
  corrida: 'corrida',
  pedal: 'pedal',
  musculacao: 'musculação',
  lpo: 'LPO',
};

export const INTENSITY_LABEL: Record<IntensityLevel, string> = {
  easy: 'leve',
  moderate: 'moderado',
  hard: 'forte',
  max: 'máximo',
};
