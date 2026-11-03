import { formatDate } from '@/lib/dates';
import { onlyDigits } from '@/lib/documents';
import { formatBRL } from '@/lib/money';

export interface ChargeMessageInput {
  customerName: string;
  businessName: string;
  balanceCents: number;
  oldestDueDate?: string | null;
  overdueDays?: number;
  pixKey?: string | null;
}

/** Mensagem de cobrança educada e personalizável. */
export function buildChargeMessage(input: ChargeMessageInput): string {
  const firstName = input.customerName.trim().split(/\s+/)[0] ?? input.customerName;
  const lines = [
    `Olá, ${firstName}! Tudo bem?`,
    '',
    `Aqui é da ${input.businessName}. Passando para lembrar que há um saldo em aberto de ${formatBRL(input.balanceCents)}.`,
  ];
  if (input.oldestDueDate) {
    lines.push(
      input.overdueDays && input.overdueDays > 0
        ? `O vencimento foi em ${formatDate(input.oldestDueDate)} (${input.overdueDays} ${input.overdueDays === 1 ? 'dia' : 'dias'} de atraso).`
        : `O vencimento é em ${formatDate(input.oldestDueDate)}.`,
    );
  }
  if (input.pixKey) lines.push('', `Chave Pix para pagamento: ${input.pixKey}`);
  lines.push('', 'Qualquer dúvida, estou à disposição. Obrigado!');
  return lines.join('\n');
}

/** Normaliza telefone para o formato internacional usado pelo WhatsApp (55 + DDD + número). */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  const d = onlyDigits(phone);
  if (/^55\d{10,11}$/.test(d)) return d;
  if (/^\d{10,11}$/.test(d)) return `55${d}`;
  return null;
}

/**
 * Link de compartilhamento do WhatsApp. O envio só acontece quando o usuário
 * toca em "enviar" no próprio WhatsApp — nada é enviado automaticamente.
 */
export function whatsappUrl(phone: string | null | undefined, message: string): string {
  const number = toWhatsAppNumber(phone);
  const text = encodeURIComponent(message);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}
