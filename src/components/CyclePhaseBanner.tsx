import type { CSSProperties } from 'react';
import { cycleInfo } from '../lib/cycle';
import { dateFromIso } from '../lib/dates';
import { useApp } from '../store/useStore';
import type { CyclePhase } from '../types';

type Context = 'diet' | 'body' | 'mind';

const PHASE_COLOR: Record<CyclePhase, string> = {
  menstrual: 'var(--spirit)',
  folicular:  'var(--diet)',
  ovulatoria: 'var(--skin)',
  lutea:      'var(--body)',
};

const PHASE_LABEL: Record<CyclePhase, string> = {
  menstrual: 'menstrual',
  folicular:  'folicular',
  ovulatoria: 'ovulatória',
  lutea:      'lútea',
};

const TIPS: Record<CyclePhase, Record<Context, string[]>> = {
  menstrual: {
    diet: [
      'Priorize ferro: carne vermelha magra, lentilha, espinafre.',
      'Magnésio (cacau, banana, semente de abóbora) ajuda com cólicas.',
      'Evite sódio em excesso — retenção já está elevada.',
    ],
    body: [
      'Prefira treinos leves: yoga, caminhada, mobilidade.',
      'Evite HIIT intenso — escute a fadiga sem culpa.',
      'Recuperação ativa tem mais ROI que força pesada agora.',
    ],
    mind: [
      'Fase de introspecção: journaling e escrita têm mais profundidade.',
      'Reduza cobranças de produtividade — é fisiológico, não fraqueza.',
    ],
  },
  folicular: {
    diet: [
      'Carboidratos complexos sustentam energia crescente.',
      'Boa fase para aumentar proteína e experimentar novos alimentos.',
      'Metabolismo favorável: aproveite para calibrar a dieta.',
    ],
    body: [
      'Melhor janela para treinos de força e novos PRs.',
      'Tolerância à intensidade está alta — explore a carga.',
      'Recuperação mais rápida: menos DOMS que na fase lútea.',
    ],
    mind: [
      'Fase de clareza e foco: ótima para aprender algo novo.',
      'Sessões de leitura profunda e estudo rendem mais agora.',
    ],
  },
  ovulatoria: {
    diet: [
      'Antioxidantes são aliados: vegetais coloridos, frutas vermelhas.',
      'Reduza alimentos inflamatórios (ultra-processados, açúcar simples).',
      'Ômega-3 apoia equilíbrio hormonal nessa transição.',
    ],
    body: [
      'Pico de estrogênio: alta performance, mas atenção a ligamentos.',
      'Evite mudanças bruscas de volume — risco de lesão elevado.',
      'Bom momento para trabalho de velocidade e potência.',
    ],
    mind: [
      'Sociabilidade e comunicação fluem melhor nessa fase.',
      'Aproveite para conversas difíceis e colaborações.',
    ],
  },
  lutea: {
    diet: [
      'Apetite aumenta — é real, não fraqueza. Ajuste a proteína.',
      'Magnésio (cacau 70%+, banana) reduz compulsão por doce.',
      'Reduza sódio para minimizar retenção de líquido.',
    ],
    body: [
      'RPE sobe com mesmo esforço — ajuste a percepção de carga.',
      'Priorize intensidade moderada e recuperação de qualidade.',
      'Sono e descanso têm mais impacto na performance agora.',
    ],
    mind: [
      'Sensibilidade emocional pode ser maior — isso tem valor.',
      'Técnicas de respiração e meditação ajudam na regulação.',
    ],
  },
};

export function CyclePhaseBanner({ context, date }: { context: Context; date: string }) {
  const profile = useApp((s) => s.profile);

  if (!profile?.cycle_tracking || !profile.cycle_start) return null;

  const info = cycleInfo(profile.cycle_start, profile.cycle_length ?? 28, dateFromIso(date));
  const tips = TIPS[info.phase][context];
  const color = PHASE_COLOR[info.phase];

  return (
    <aside
      className="cycle-phase-banner"
      style={{ '--phase-color': color } as CSSProperties}
    >
      <header className="cycle-phase-banner__header">
        <span className="cycle-phase-banner__dot" />
        <span className="eyebrow">ciclo · fase {PHASE_LABEL[info.phase]} · dia {info.day}</span>
      </header>
      <ul className="cycle-phase-banner__tips">
        {tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </aside>
  );
}
