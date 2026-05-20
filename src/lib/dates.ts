export function isoToday(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function dateFromIso(iso: string) {
  return new Date(`${iso}T12:00:00`);
}

export function relativeDateLabel(iso: string) {
  const today = dateFromIso(isoToday());
  const target = dateFromIso(iso);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diff === -1) return 'ontem';
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';

  return target
    .toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })
    .replace('.', '')
    .toLowerCase();
}

export function weekDaysAround(iso: string) {
  const selected = dateFromIso(iso);
  const day = selected.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = addDays(selected, mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    return isoToday(date);
  });
}

export function lastDays(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(new Date(), index - count + 1);
    return isoToday(date);
  });
}

export function minutesToSleepLabel(minutes: number | null | undefined) {
  if (!minutes) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${String(mins).padStart(2, '0')}`;
}

export function diffMinutes(start: string, end: string) {
  if (!start || !end) return null;
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  if ([startH, startM, endH, endM].some(Number.isNaN)) return null;

  const startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  return endMinutes - startMinutes;
}
