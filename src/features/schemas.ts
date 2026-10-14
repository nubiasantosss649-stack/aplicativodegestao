import { z } from 'zod';

import { isValidCNPJ, isValidCPF, isValidPhone, onlyDigits } from '@/lib/documents';
import { parseBRDate } from '@/lib/dates';
import { parseBRL, parseQuantity } from '@/lib/money';

/**
 * Schemas de formulário. Os campos são strings (como digitados) e são
 * convertidos para centavos/números no envio.
 */

const money = (label: string, opts: { min?: number; required?: boolean } = {}) =>
  z.string().refine(
    (v) => {
      if (!v.trim()) return !opts.required;
      const cents = parseBRL(v);
      return cents != null && cents >= (opts.min ?? 0);
    },
    { message: opts.required ? `Informe ${label} válido` : `${label} inválido` },
  );

const quantity = (label: string, opts: { positive?: boolean } = {}) =>
  z.string().refine(
    (v) => {
      if (!v.trim()) return !opts.positive;
      const q = parseQuantity(v);
      return q != null && (!opts.positive || q > 0);
    },
    { message: `${label} inválida` },
  );

const optionalPhone = z
  .string()
  .refine((v) => !v.trim() || isValidPhone(v), { message: 'Telefone inválido (inclua o DDD)' });

const optionalDate = z
  .string()
  .refine((v) => !v.trim() || parseBRDate(v) != null, { message: 'Data inválida (use DD/MM/AAAA)' });

export const signInSchema = z.object({
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});

export const passwordRule = z
  .string()
  .min(8, 'A senha deve ter pelo menos 8 caracteres')
  .regex(/[A-Za-z]/, 'Inclua pelo menos uma letra')
  .regex(/\d/, 'Inclua pelo menos um número');

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Informe seu nome'),
    email: z.string().trim().email('E-mail inválido'),
    password: passwordRule,
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((v) => v, { message: 'É necessário aceitar os termos' }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('E-mail inválido'),
});

export const resetPasswordSchema = z
  .object({ password: passwordRule, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  });

export const businessSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do negócio').max(120),
  businessType: z.string().min(1, 'Selecione o tipo de negócio'),
  document: z.string().refine(
    (v) => {
      const d = onlyDigits(v);
      if (!d) return true;
      return (d.length === 11 && isValidCPF(d)) || (d.length === 14 && isValidCNPJ(d));
    },
    { message: 'CPF ou CNPJ inválido' },
  ),
  phone: optionalPhone,
});

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do produto').max(120),
  categoryId: z.string().nullable(),
  description: z.string().max(500),
  internalCode: z.string().max(40),
  barcode: z
    .string()
    .refine((v) => !v.trim() || /^[0-9A-Za-z-]{4,32}$/.test(v.trim()), { message: 'Código de barras inválido' }),
  unit: z.string(),
  cost: money('o custo'),
  price: money('o preço de venda', { required: true }),
  initialStock: quantity('Quantidade'),
  minStock: quantity('Quantidade mínima'),
  trackStock: z.boolean(),
});

export const stockMovementSchema = z
  .object({
    type: z.enum(['purchase', 'adjustment']),
    direction: z.enum(['in', 'out']),
    quantity: quantity('Quantidade', { positive: true }),
    unitCost: money('o custo'),
    reason: z.string().max(300),
    updateCost: z.boolean(),
  })
  .refine((d) => d.type !== 'adjustment' || d.reason.trim().length >= 3, {
    message: 'Explique o motivo do ajuste',
    path: ['reason'],
  });

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do cliente').max(120),
  phone: optionalPhone,
  email: z.string().refine((v) => !v.trim() || z.string().email().safeParse(v.trim()).success, {
    message: 'E-mail inválido',
  }),
  address: z.string().max(300),
  notes: z.string().max(1000),
});

export const receivePaymentSchema = z.object({
  amount: money('o valor', { required: true, min: 1 }),
  method: z.enum(['cash', 'pix', 'card']),
  notes: z.string().max(300),
});

export const manualReceivableSchema = z.object({
  description: z.string().trim().min(1, 'Descreva o fiado').max(200),
  amount: money('o valor', { required: true, min: 1 }),
  dueDate: optionalDate,
});

export const financialEntrySchema = z
  .object({
    kind: z.enum(['income', 'expense']),
    description: z.string().trim().min(1, 'Informe a descrição').max(200),
    amount: money('o valor', { required: true, min: 1 }),
    categoryId: z.string().nullable(),
    competenceDate: optionalDate,
    dueDate: optionalDate,
    paid: z.boolean(),
    method: z.enum(['cash', 'pix', 'card']).nullable(),
    notes: z.string().max(500),
  })
  .refine((d) => d.paid || d.dueDate.trim().length > 0, {
    message: 'Informe o vencimento da conta',
    path: ['dueDate'],
  });

export type SignInForm = z.infer<typeof signInSchema>;
export type SignUpForm = z.infer<typeof signUpSchema>;
export type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;
export type BusinessForm = z.infer<typeof businessSchema>;
export type ProductForm = z.infer<typeof productSchema>;
export type StockMovementForm = z.infer<typeof stockMovementSchema>;
export type CustomerForm = z.infer<typeof customerSchema>;
export type ReceivePaymentForm = z.infer<typeof receivePaymentSchema>;
export type ManualReceivableForm = z.infer<typeof manualReceivableSchema>;
export type FinancialEntryForm = z.infer<typeof financialEntrySchema>;

export const BUSINESS_TYPES = [
  { value: 'grocery', label: 'Mercadinho / mercearia' },
  { value: 'clothing', label: 'Loja de roupas' },
  { value: 'beauty', label: 'Salão de beleza' },
  { value: 'services', label: 'Prestação de serviços' },
  { value: 'food', label: 'Alimentação / lanchonete' },
  { value: 'retail', label: 'Comércio em geral' },
  { value: 'other', label: 'Outro' },
] as const;

export const PRODUCT_UNITS = ['un', 'kg', 'g', 'l', 'ml', 'm', 'cx', 'pct', 'serv'] as const;
