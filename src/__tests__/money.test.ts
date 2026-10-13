import {
  formatBRL,
  formatPercent,
  formatQuantity,
  lineTotal,
  marginPercent,
  maskMoneyDigits,
  parseBRL,
  parseQuantity,
  suggestPrice,
} from '@/lib/money';

describe('formatBRL', () => {
  it('formata centavos no padrão brasileiro', () => {
    expect(formatBRL(0)).toBe('R$ 0,00');
    expect(formatBRL(5)).toBe('R$ 0,05');
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(100000000)).toBe('R$ 1.000.000,00');
    expect(formatBRL(-2550)).toBe('-R$ 25,50');
    expect(formatBRL(null)).toBe('R$ 0,00');
  });
});

describe('parseBRL', () => {
  it.each([
    ['12,50', 1250],
    ['1.234,56', 123456],
    ['R$ 10', 1000],
    ['12.5', 1250],
    ['12.50', 1250],
    ['1.234', 123400],
    ['0,99', 99],
    [',5', 50],
    ['-3,00', -300],
  ])('converte %s em %d centavos', (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,2,3', '12,345', '1..2,a'])('rejeita %p', (input) => {
    expect(parseBRL(input)).toBeNull();
  });
});

describe('maskMoneyDigits', () => {
  it('trata os dígitos como centavos', () => {
    expect(maskMoneyDigits('1')).toBe('0,01');
    expect(maskMoneyDigits('1250')).toBe('12,50');
    expect(maskMoneyDigits('R$ 1.234,56')).toBe('1.234,56');
    expect(maskMoneyDigits('')).toBe('0,00');
  });
});

describe('margem e precificação', () => {
  it('calcula margem sobre o preço', () => {
    expect(marginPercent(600, 1000)).toBeCloseTo(40);
    expect(marginPercent(100, 0)).toBeNull();
  });
  it('sugere preço para margem desejada arredondando para 10 centavos', () => {
    // 600 / (1 - 0.4) = 1000
    expect(suggestPrice(600, 40)).toBe(1000);
    // 777 / 0.7 = 1110 => 1110
    expect(suggestPrice(777, 30)).toBe(1110);
    expect(suggestPrice(0, 30)).toBeNull();
    expect(suggestPrice(100, 100)).toBeNull();
  });
  it('arredonda total de linha como o banco', () => {
    expect(lineTotal(999, 1.5)).toBe(1499); // 1498.5 -> 1499 (half up)
    expect(lineTotal(2500, 2)).toBe(5000);
  });
});

describe('quantidades e percentuais', () => {
  it('converte e formata quantidades', () => {
    expect(parseQuantity('1,5')).toBe(1.5);
    expect(parseQuantity('2')).toBe(2);
    expect(parseQuantity('1,2345')).toBeNull();
    expect(parseQuantity('-1')).toBeNull();
    expect(formatQuantity(2, 'un')).toBe('2 un');
    expect(formatQuantity(1.25, 'kg')).toBe('1,25 kg');
  });
  it('formata percentuais', () => {
    expect(formatPercent(12.345)).toBe('12,3%');
    expect(formatPercent(null)).toBe('—');
  });
});
