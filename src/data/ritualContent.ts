import type { DimensionKey, ProductCategory, ProductFrequency, ProductStep } from '../types';

export type RoutinePeriod = 'day' | 'night';
export type RoutineArea = 'face' | 'body' | 'aromas';

export interface RoutineTask {
  title: string;
  description: string;
  tag: string;
}

export interface MealPlan {
  id: string;
  mealType: 'manha' | 'almoco' | 'lanche' | 'jantar' | 'ceia';
  title: string;
  time: string;
  variants: Record<string, { title: string; note?: string }[]>;
}

export interface TrainingOption {
  id: string;
  label: string;
  advice: string;
}

export const QUOTES = [
  'O dia não precisa ser perfeito para ser bem conduzido.',
  'A disciplina mais profunda é voltar para si antes de reagir ao mundo.',
  'Cuidar do corpo é organizar a casa onde a mente mora.',
  'O que você repete com presença vira identidade.',
  'Calma também é cuidado.',
  'Sua energia precisa de direção, não de cobrança.',
  'Hoje, faça o essencial com beleza.',
];

export const ROUTINES: Record<RoutinePeriod, Record<RoutineArea, RoutineTask[]>> = {
  day: {
    face: [
      {
        title: 'Lavar com Bioderma Sensibio',
        description: 'Água fria ou morna, sem atrito. Se estiver sensível, use menos produto.',
        tag: 'barreira',
      },
      {
        title: 'Aplicar SkinCeuticals P-Tiox',
        description: 'Segunda, quarta e sexta pela manhã. Se a pele estiver ardendo, pause.',
        tag: 'ativo',
      },
      {
        title: 'Aplicar Bioderma Sensibio AR+ Cream',
        description: 'Sua barreira vem antes da pressa. Aplique sem esfregar.',
        tag: 'barreira',
      },
      {
        title: 'Finalizar com protetor solar Adcos',
        description: 'Mesmo em dia nublado ou perto de janela.',
        tag: 'indispensável',
      },
    ],
    body: [
      {
        title: 'Banho com sabonete líquido Verbena',
        description: 'Use nos dias de trabalho para abrir o dia com frescor e leveza.',
        tag: 'energia',
      },
      {
        title: 'Aplicar Ureadin nas áreas ásperas',
        description: 'Braços, bumbum e regiões com textura ou bolinhas.',
        tag: 'textura',
      },
      {
        title: 'Pink Cheeks se houver atrito',
        description: 'Antes de treino, caminhada ou roupa que encosta entre as pernas.',
        tag: 'atrito',
      },
      {
        title: 'Água Refrescante Energia no corpo ou roupa',
        description: 'Pós-banho, antes de abrir o computador. Evite rosto e áreas sensíveis.',
        tag: 'aroma',
      },
    ],
    aromas: [
      {
        title: 'Difusor Alecrim & Capim Limão no escritório',
        description: 'Use como sinal de começo do expediente. Se estiver forte, reduza as varetas.',
        tag: 'foco',
      },
      {
        title: 'Playlist sem letra antes da agenda',
        description: 'Dez minutos para entrar em concentração sem se atropelar.',
        tag: 'mente',
      },
      {
        title: 'Abrir janela e água ao lado',
        description: 'O ambiente também faz parte do ritual.',
        tag: 'presença',
      },
    ],
  },
  night: {
    face: [
      {
        title: 'Lavar com Bioderma Sensibio',
        description: 'Remova protetor, suor e oleosidade sem esfregar.',
        tag: 'limpeza',
      },
      {
        title: 'Ativo da noite quando indicado',
        description: 'Salicílico segunda/quinta, Retrinal quarta. Se estiver sensível, troque por barreira.',
        tag: 'ativo',
      },
      {
        title: 'Finalizar com Bioderma Sensibio AR+ Cream',
        description: 'Feche a noite acalmando a pele.',
        tag: 'barreira',
      },
    ],
    body: [
      {
        title: 'Acender vela de Olíbano antes do banho',
        description: 'Dez a quinze minutos antes. Banheiro organizado e luz baixa.',
        tag: 'transição',
      },
      {
        title: 'Banho com Ylang Ylang ou Lavanda',
        description: 'Ylang Ylang para ritual spa. Lavanda para sono emocional.',
        tag: 'banho',
      },
      {
        title: 'Hidratação corporal de tratamento',
        description: 'Ureadin ou óleo onde precisa. Bioderma entre as pernas se houver atrito.',
        tag: 'cuidado',
      },
      {
        title: 'Amande nos dias de autoestima',
        description: 'Duas a três vezes por semana para pele macia e ritual premium.',
        tag: 'corpo',
      },
      {
        title: 'Provence na cama quinze minutos antes de deitar',
        description: 'Borrife longe do rosto e deixe assentar.',
        tag: 'sono',
      },
    ],
    aromas: [
      {
        title: 'Vela de Olíbano durante o banho',
        description: 'Nunca deixe acesa sem supervisão. Apague antes de sair do banheiro.',
        tag: 'ritual',
      },
      {
        title: 'Música de leitura noturna ou brown noise',
        description: 'Sem letra se quiser dormir mais rápido.',
        tag: 'desacelerar',
      },
      {
        title: 'Frase de fechamento',
        description: 'Eu não preciso resolver mais nada agora.',
        tag: 'espírito',
      },
    ],
  },
};

function weekdayFromIso(dateIso: string) {
  return new Date(`${dateIso}T12:00:00`).getDay();
}

function activeMorningSkinTask(day: number): RoutineTask {
  if ([1, 3, 5].includes(day)) {
    return {
      title: 'Aplicar SkinCeuticals P-Tiox',
      description: 'Dia de ativo: segunda, quarta e sexta pela manhã. Se a pele estiver ardendo, pause.',
      tag: 'ativo',
    };
  }

  return {
    title: 'Manhã de barreira sem P-Tiox',
    description: 'Hoje o foco é hidratar, acalmar e proteger. Ativo volta segunda, quarta ou sexta.',
    tag: 'barreira',
  };
}

function activeNightSkinTask(day: number): RoutineTask {
  if ([1, 4].includes(day)) {
    return {
      title: 'Ácido salicílico com cautela',
      description: 'Segunda e quinta. Use só se a pele estiver confortável e finalize com barreira.',
      tag: 'ativo',
    };
  }

  if (day === 3) {
    return {
      title: 'Retrinal na rotina da noite',
      description: 'Quarta-feira. Camada fina, sem misturar com outros ativos fortes.',
      tag: 'renovação',
    };
  }

  return {
    title: 'Noite de reparação de barreira',
    description: 'Sem ativo hoje: limpeza gentil e Sensibio AR+ para reduzir reatividade.',
    tag: 'reparação',
  };
}

export function getRoutineTasks(period: RoutinePeriod, area: RoutineArea, dateIso: string): RoutineTask[] {
  if (area !== 'face') return ROUTINES[period][area];

  const day = weekdayFromIso(dateIso);

  if (period === 'day') {
    return [
      ROUTINES.day.face[0],
      activeMorningSkinTask(day),
      ROUTINES.day.face[2],
      ROUTINES.day.face[3],
    ];
  }

  return [
    ROUTINES.night.face[0],
    activeNightSkinTask(day),
    ROUTINES.night.face[2],
  ];
}

export function getDefaultMealVariant(_mealId: string, _dateIso: string) {
  return 'principal';
}

export function getMealItemsForDate(meal: MealPlan, dateIso: string) {
  const recommendedVariant = getDefaultMealVariant(meal.id, dateIso);
  const variant = meal.variants[recommendedVariant] ? recommendedVariant : 'principal';
  return {
    variant,
    items: meal.variants[variant] ?? meal.variants.principal,
  };
}

export const DIMENSION_COPY: Record<DimensionKey, {
  phrase: string;
  area: RoutineArea;
  period: RoutinePeriod;
  support: string;
}> = {
  skin: {
    phrase: 'Hoje, a barreira primeiro.',
    area: 'face',
    period: 'day',
    support: 'Pele pede repetição gentil: limpeza, barreira, proteção e uma foto quando algo mudar.',
  },
  body: {
    phrase: 'Movimento como retorno, não como dívida.',
    area: 'body',
    period: 'day',
    support: 'Corpo responde melhor quando treino, água, atrito e banho conversam entre si.',
  },
  mind: {
    phrase: 'Volte mais lento do que partiu.',
    area: 'aromas',
    period: 'day',
    support: 'Mente entra no eixo com ambiente, foco curto e pausas que não pedem performance.',
  },
  diet: {
    phrase: 'Comer com presença, não com pressa.',
    area: 'body',
    period: 'day',
    support: 'Dieta aqui é ritmo: refeições, água, treino e saciedade sendo registrados sem rigidez.',
  },
  spirit: {
    phrase: 'A intenção orienta o que o dia carrega.',
    area: 'aromas',
    period: 'night',
    support: 'Espírito fecha o dia com intenção, gratidão e alívio do que não precisa seguir no corpo.',
  },
};

export const MEALS: MealPlan[] = [
  {
    id: 'intra',
    mealType: 'lanche',
    title: 'Intra treino cardio',
    time: '01:00 / se houver cardio',
    variants: {
      principal: [{ title: 'Suco de caixinha', note: 'Use quando houver cardio, pedal ou corrida mais longo.' }],
      sem: [{ title: 'Não teve cardio', note: 'Marque essa opção quando não houver cardio.' }],
    },
  },
  {
    id: 'breakfast',
    mealType: 'manha',
    title: 'Café da manhã',
    time: '07:30',
    variants: {
      principal: [{ title: 'Pão de forma Nutrella 1 fatia' }, { title: 'Ovo de galinha 3 unidades' }],
      sub1: [
        { title: 'Tapioca de goma 30g' },
        { title: 'Ovo de galinha 1 unidade' },
        { title: 'Clara de ovo 2 unidades' },
        { title: 'Queijo muçarela 1 fatia' },
      ],
      sub2: [{ title: 'Pão de forma Nutrella 1 fatia' }, { title: 'Doce de leite 30g' }, { title: 'Ovo de galinha 2 unidades' }],
      sub3: [
        { title: 'Banana 1 unidade' },
        { title: 'Ovo de galinha 1 unidade' },
        { title: 'Aveia em flocos 10g' },
        { title: 'Whey 20g', note: 'Pode virar panqueca com cacau ou canela.' },
      ],
    },
  },
  {
    id: 'lunch',
    mealType: 'almoco',
    title: 'Almoço',
    time: '12:30',
    variants: {
      principal: [
        { title: 'Arroz branco cozido 80g' },
        { title: 'Peito de galinha/frango assado 140g' },
        { title: 'Legumes de preferência 100g' },
      ],
      subArroz: [{ title: 'Batata inglesa/doce, cará, inhame ou mandioquinha 120g', note: 'Ou abóbora 160g.' }],
      subProteina: [{ title: 'Carne vermelha ou salmão 110g', note: 'Ou ovo: 2 inteiros + 2 claras; ou peixe 170g.' }],
    },
  },
  {
    id: 'snack',
    mealType: 'lanche',
    title: 'Lanche da tarde',
    time: '16:00',
    variants: {
      principal: [
        { title: 'Pão de forma Nutrella 2 fatias', note: 'Pode trocar por pão francês.' },
        { title: 'Queijo ricota light 40g' },
        { title: 'Ovo de galinha 2 unidades' },
      ],
      sub1: [
        { title: 'Banana 1 unidade' },
        { title: 'Ovo de galinha 1 unidade' },
        { title: 'Aveia em flocos 2 colheres de sopa' },
        { title: 'Cacau em pó Garoto 10g', note: 'Pode virar panqueca.' },
      ],
      sub2: [
        { title: 'Batata inglesa cozida 180g', note: 'Pode trocar por batata doce, mandioca ou mandioquinha.' },
        { title: 'Peito de frango assado 70g' },
      ],
    },
  },
  {
    id: 'dinner',
    mealType: 'jantar',
    title: 'Jantar',
    time: '20:00',
    variants: {
      principal: [
        { title: 'Arroz branco cozido 80g' },
        { title: 'Peito de galinha/frango assado 120g' },
        { title: 'Legumes de preferência 150g' },
      ],
      subArroz: [{ title: 'Batata inglesa/doce, cará, inhame ou mandioquinha 110g', note: 'Ou abóbora 160g.' }],
      subProteina: [{ title: 'Carne vermelha ou salmão 100g', note: 'Ou ovo: 1 inteiro + 2 claras; ou peixe 150g.' }],
    },
  },
];

export const TRAINING_OPTIONS: TrainingOption[] = [
  { id: 'none', label: 'Sem treino', advice: 'Sem treino: mantenha rotina-base, água constante e dieta principal. Ritmo é cuidado.' },
  { id: 'lpo', label: 'LPO', advice: 'LPO: foco em mobilidade, hidratação e proteína. Evite pele muito perfumada antes do suor intenso.' },
  { id: 'pedal', label: 'Pedal', advice: 'Pedal: atenção a protetor, suor, vento e atrito. Banho morno após o treino e roupa seca rápido.' },
  { id: 'corrida', label: 'Corrida', advice: 'Corrida: protetor antes, Pink Cheeks nas áreas de atrito e limpeza suave depois.' },
  { id: 'musculacao', label: 'Musculação', advice: 'Musculação: suor, banco e atrito pedem banho/limpeza depois. Proteína ajuda recuperação.' },
  { id: 'yoga', label: 'Yoga', advice: 'Yoga: menos intensidade, mais presença. Use respiração como parte do ritual.' },
];

export const QUICK_LINKS = [
  ['Modelos mentais em 5 minutos', 'Explore uma nova lente para decidir melhor', 'https://fs.blog/mental-models/'],
  ['Hábitos pequenos, identidade grande', 'Constância vence intensidade quando vira identidade', 'https://jamesclear.com/identity-based-habits'],
  ['Respiração box breathing', 'Regule o sistema antes do trabalho', 'https://www.youtube.com/results?search_query=box+breathing+5+minutes'],
  ['Aprender algo novo hoje', 'Um vídeo curto para ampliar repertório', 'https://www.youtube.com/@TEDEd/videos'],
] as const;

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'limpeza',
  'tonico',
  'esfoliante',
  'serum',
  'tratamento',
  'olhos',
  'hidratante',
  'mascara',
  'protetor_solar',
  'corpo',
];

export const PRODUCT_STEPS: ProductStep[] = ['manha', 'noite', 'ambos'];
export const PRODUCT_FREQUENCIES: ProductFrequency[] = ['diaria', 'alternada', 'semanal', 'quinzenal'];
