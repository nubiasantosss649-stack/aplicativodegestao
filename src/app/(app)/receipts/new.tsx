import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { DocumentField } from '@/components/MaskedFields';
import { Button, Chips, FormField, Screen, Text, useToast } from '@/components/ui';
import { registerDocument } from '@/features/documents/api';
import { buildReceiptHtml } from '@/features/documents/templates';
import { METHOD_OPTIONS } from '@/features/finance/api';
import { shareHtmlAsPdf } from '@/features/sales/share';
import { formatDate, parseBRDate, toISODate } from '@/lib/dates';
import { isValidCNPJ, isValidCPF, onlyDigits } from '@/lib/documents';
import { errorMessage } from '@/lib/errors';
import { parseBRL } from '@/lib/money';
import { useCurrentBusiness } from '@/providers/BusinessProvider';

const schema = z.object({
  payerName: z.string().trim().min(2, 'Informe quem pagou').max(120),
  payerDocument: z.string().refine((v) => {
    const d = onlyDigits(v);
    return !d || (d.length === 11 && isValidCPF(d)) || (d.length === 14 && isValidCNPJ(d));
  }, 'CPF ou CNPJ inválido'),
  amount: z.string().refine((v) => (parseBRL(v) ?? 0) > 0, 'Informe o valor'),
  description: z.string().trim().min(3, 'Descreva o que foi pago').max(200),
  date: z.string().refine((v) => parseBRDate(v) != null, 'Data inválida'),
  method: z.enum(['cash', 'pix', 'card']),
  city: z.string().max(80),
});
type Form = z.infer<typeof schema>;

/** Recibo avulso (serviço prestado ou valor recebido), não fiscal. */
export default function NewReceipt() {
  const business = useCurrentBusiness();
  const toast = useToast();
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      payerName: '',
      payerDocument: '',
      amount: '',
      description: '',
      date: formatDate(toISODate(new Date())),
      method: 'pix',
      city: '',
    },
  });

  return (
    <Screen>
      <Text tone="muted">Gere um recibo em PDF com valor por extenso para serviços prestados ou valores recebidos. Documento não fiscal.</Text>
      <FormField control={control} name="payerName" label="Recebido de" placeholder="Nome de quem pagou" />
      <DocumentField control={control} name="payerDocument" label="CPF ou CNPJ de quem pagou (opcional)" hint=" " />
      <FormField control={control} name="amount" label="Valor" mask="money" placeholder="0,00" />
      <FormField control={control} name="description" label="Referente a" placeholder="Ex.: corte e escova, conserto do portão" />
      <Controller control={control} name="method" render={({ field }) => <Chips options={METHOD_OPTIONS} value={field.value} onChange={field.onChange} />} />
      <FormField control={control} name="date" label="Data" mask="date" />
      <FormField control={control} name="city" label="Cidade (opcional)" />
      <Button
        title="Gerar e compartilhar recibo"
        icon="receipt"
        loading={formState.isSubmitting}
        onPress={handleSubmit(async (v) => {
          try {
            const amountCents = parseBRL(v.amount) ?? 0;
            const doc = await registerDocument(business.id, 'service_receipt', null, v.description.trim(), amountCents, {
              payer: v.payerName.trim(),
              method: v.method,
            });
            await shareHtmlAsPdf(
              buildReceiptHtml(business, {
                number: doc.number,
                date: parseBRDate(v.date)!,
                payerName: v.payerName.trim(),
                payerDocument: onlyDigits(v.payerDocument) || null,
                amountCents,
                description: v.description.trim(),
                method: v.method,
                city: v.city.trim() || null,
              }),
              `Recibo nº ${doc.number}`,
            );
            toast.show(`Recibo nº ${doc.number} gerado.`);
            router.back();
          } catch (e) {
            toast.show(errorMessage(e), 'error');
          }
        })}
      />
    </Screen>
  );
}
