import type { CyclePhase } from '../types';
import { addDays, dateFromIso, isoToday } from './dates';

export interface CycleDay {
  date: string;
  day: number;
  phase: CyclePhase;
  text: string;
  isToday: boolean;
}

export function cycleInfo(cycleStart?: string | null, cycleLength = 28, date = new Date()): CycleDay {
  const startIso = cycleStart || '2026-04-20';
  const start = dateFromIso(startIso);
  const today = dateFromIso(isoToday(date));
  const length = cycleLength || 28;
  const diff = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  const day = (((diff % length) + length) % length) + 1;
  const phase = phaseForDay(day, length);

  return {
    date: isoToday(date),
    day,
    phase,
    text: textForPhase(phase),
    isToday: true,
  };
}

export function fiveWeekCycle(cycleStart?: string | null, cycleLength = 28) {
  return Array.from({ length: 35 }, (_, index) => {
    const date = addDays(new Date(), index - 17);
    const info = cycleInfo(cycleStart, cycleLength, date);
    return { ...info, isToday: isoToday(date) === isoToday() };
  });
}

function phaseForDay(day: number, cycleLength: number): CyclePhase {
  const lutealStart = Math.max(18, cycleLength - 10);
  if (day <= 5) return 'menstrual';
  if (day <= 13) return 'folicular';
  if (day <= Math.min(17, lutealStart - 1)) return 'ovulatoria';
  return 'lutea';
}

function textForPhase(phase: CyclePhase) {
  const map: Record<CyclePhase, string> = {
    menstrual: 'Mais sensibilidade, retenção e necessidade de acolhimento. Rotina básica é vitória.',
    folicular: 'Energia em reconstrução. Pele tende a ficar mais estável e a constância volta com menos atrito.',
    ovulatoria: 'Pode haver mais disposição, mas observe pele, sono e sinais de inflamação.',
    lutea: 'Pode aumentar fome, retenção, sensibilidade emocional e reatividade da pele.',
  };
  return map[phase];
}
