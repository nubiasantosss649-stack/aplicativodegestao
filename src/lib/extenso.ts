/** Valor por extenso em reais (para recibos): 15050 -> "cento e cinquenta reais e cinquenta centavos". */

const UNITS = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze',
  'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos',
  'oitocentos', 'novecentos'];

function below1000(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS[h]!);
  if (rest < 20) {
    if (rest) parts.push(UNITS[rest]!);
  } else {
    const t = Math.floor(rest / 10);
    const u = rest % 10;
    parts.push(u ? `${TENS[t]} e ${UNITS[u]}` : TENS[t]!);
  }
  return parts.join(' e ');
}

const SCALES: [number, string, string][] = [
  [1_000_000_000, 'bilhão', 'bilhões'],
  [1_000_000, 'milhão', 'milhões'],
  [1_000, 'mil', 'mil'],
];

function integerToWords(n: number): string {
  if (n === 0) return 'zero';
  const groups: { value: number; text: string }[] = [];
  let rest = n;
  for (const [size, singular, plural] of SCALES) {
    const q = Math.floor(rest / size);
    if (q > 0) {
      const text = size === 1000 && q === 1 ? 'mil' : `${below1000(q)} ${q === 1 ? singular : plural}`;
      groups.push({ value: q * size, text });
      rest %= size;
    }
  }
  if (rest > 0) groups.push({ value: rest, text: below1000(rest) });
  // Regra do "e": antes do último grupo quando ele é < 100 ou centena exata
  return groups
    .map((g, i) => {
      if (i === 0) return g.text;
      const last = i === groups.length - 1;
      const useE = last && (g.value < 100 || g.value % 100 === 0);
      return `${useE ? 'e ' : ''}${g.text}`;
    })
    .join(groups.length > 1 ? ' ' : '')
    .replace(/ +/g, ' ')
    .trim();
}

export function valorPorExtenso(cents: number): string {
  const total = Math.round(Math.abs(cents));
  const reais = Math.floor(total / 100);
  const centavos = total % 100;
  const parts: string[] = [];
  if (reais > 0) {
    const words = integerToWords(reais);
    // "um milhão de reais", "dois milhões de reais"
    const de = reais % 1_000_000 === 0 ? ' de' : '';
    parts.push(`${words}${de} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) parts.push(`${integerToWords(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  if (parts.length === 0) return 'zero real';
  return parts.join(' e ');
}
