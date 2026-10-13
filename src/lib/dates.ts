/** Datas sempre tratadas como datas locais (YYYY-MM-DD) para filtros. */

export type PeriodKey = 'today' | 'week' | 'month' | 'custom';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

const pad = (n: number) => n.toString().padStart(2, '0');

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function rangeFor(period: Exclude<PeriodKey, 'custom'>, now: Date = new Date()): DateRange {
  const today = toISODate(now);
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'week':
      return { from: toISODate(addDays(now, -6)), to: today };
    case 'month':
      return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
}

/** Converte "DD/MM/AAAA" em "YYYY-MM-DD" (ou null se inválida). */
export function parseBRDate(input: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) {
    return null;
  }
  return toISODate(date);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseISODate(value) : new Date(value);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatShortDay(value: string): string {
  const date = parseISODate(value);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/** Dias de atraso em relação a hoje (0 se não vencido). */
export function daysOverdue(dueDate: string, now: Date = new Date()): number {
  const due = parseISODate(dueDate);
  const today = parseISODate(toISODate(now));
  const diff = Math.round((today.getTime() - due.getTime()) / 86_400_000);
  return diff > 0 ? diff : 0;
}

export function maskDateInput(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
