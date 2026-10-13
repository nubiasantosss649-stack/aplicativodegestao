import { daysOverdue, formatDate, maskDateInput, parseBRDate, rangeFor, toISODate } from '@/lib/dates';

describe('datas', () => {
  const now = new Date(2026, 9, 13, 15, 30); // 13/10/2026

  it('gera períodos de filtro', () => {
    expect(rangeFor('today', now)).toEqual({ from: '2026-10-13', to: '2026-10-13' });
    expect(rangeFor('week', now)).toEqual({ from: '2026-10-07', to: '2026-10-13' });
    expect(rangeFor('month', now)).toEqual({ from: '2026-10-01', to: '2026-10-13' });
  });

  it('converte datas brasileiras', () => {
    expect(parseBRDate('13/10/2026')).toBe('2026-10-13');
    expect(parseBRDate('31/02/2026')).toBeNull();
    expect(parseBRDate('2026-10-13')).toBeNull();
    expect(formatDate('2026-10-13')).toBe('13/10/2026');
    expect(maskDateInput('13102026')).toBe('13/10/2026');
    expect(maskDateInput('131')).toBe('13/1');
  });

  it('calcula dias de atraso', () => {
    expect(daysOverdue('2026-10-10', now)).toBe(3);
    expect(daysOverdue('2026-10-13', now)).toBe(0);
    expect(daysOverdue('2026-10-20', now)).toBe(0);
    expect(toISODate(now)).toBe('2026-10-13');
  });
});
