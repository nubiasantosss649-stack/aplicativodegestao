import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Switch, View } from 'react-native';
import { z } from 'zod';

import { ManagerOnly } from '@/components/ManagerOnly';
import { DocumentField, PhoneField } from '@/components/MaskedFields';
import { Button, Card, Chips, FormField, Screen, Text, useToast } from '@/components/ui';
import { useUpdateBusiness } from '@/features/business/api';
import { BUSINESS_TYPES, businessSchema } from '@/features/schemas';
import { detectDocumentType, formatDocument, formatPhone, onlyDigits } from '@/lib/documents';
import { errorMessage } from '@/lib/errors';
import { useCurrentBusiness } from '@/providers/BusinessProvider';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

const schema = businessSchema.extend({
  allowNegativeStock: z.boolean(),
  sellerMaxDiscount: z.string().refine((v) => /^\d{1,3}$/.test(v) && Number(v) <= 100, { message: 'Informe de 0 a 100' }),
  creditDays: z.string().refine((v) => /^\d{1,3}$/.test(v) && Number(v) <= 365, { message: 'Informe de 0 a 365' }),
  receiptFooter: z.string().max(300),
});
type Form = z.infer<typeof schema>;

function BusinessSettings() {
  const business = useCurrentBusiness();
  const { colors } = useTheme();
  const toast = useToast();
  const update = useUpdateBusiness(business.id);
  const { control, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: business.name,
      businessType: business.business_type,
      document: formatDocument(business.document),
      phone: formatPhone(business.phone),
      allowNegativeStock: business.allow_negative_stock,
      sellerMaxDiscount: String(Math.round(Number(business.seller_max_discount_percent))),
      creditDays: String(business.default_credit_days),
      receiptFooter: business.receipt_footer ?? '',
    },
  });

  return (
    <Screen>
      <FormField control={control} name="name" label="Nome do negócio" />
      <Controller
        control={control}
        name="businessType"
        render={({ field }) => <Chips options={BUSINESS_TYPES} value={field.value} onChange={field.onChange} />}
      />
      <DocumentField control={control} name="document" />
      <PhoneField control={control} name="phone" />

      <Card style={{ gap: spacing.md }}>
        <Text variant="subtitle">Regras de venda</Text>
        <FormField control={control} name="sellerMaxDiscount" label="Desconto máximo para vendedores (%)" keyboardType="number-pad" />
        <FormField control={control} name="creditDays" label="Prazo padrão do fiado (dias)" keyboardType="number-pad" />
        <Controller
          control={control}
          name="allowNegativeStock"
          render={({ field }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text>Permitir vender sem estoque</Text>
                <Text variant="caption" tone="muted">O estoque poderá ficar negativo. Recomendado manter desativado.</Text>
              </View>
              <Switch value={field.value} onValueChange={field.onChange} trackColor={{ true: colors.danger }} />
            </View>
          )}
        />
      </Card>

      <FormField control={control} name="receiptFooter" label="Mensagem no comprovante (opcional)" placeholder="Obrigado pela preferência!" multiline maxLength={300} />

      <Button
        title="Salvar"
        icon="save"
        loading={formState.isSubmitting}
        onPress={handleSubmit(async (v) => {
          const doc = onlyDigits(v.document);
          try {
            await update.mutateAsync({
              name: v.name.trim(),
              business_type: v.businessType,
              document: doc || null,
              document_type: doc ? detectDocumentType(doc) : null,
              phone: onlyDigits(v.phone) || null,
              allow_negative_stock: v.allowNegativeStock,
              seller_max_discount_percent: Number(v.sellerMaxDiscount),
              default_credit_days: Number(v.creditDays),
              receipt_footer: v.receiptFooter.trim() || null,
            });
            toast.show('Dados do negócio salvos!');
            router.back();
          } catch (e) {
            toast.show(errorMessage(e), 'error');
          }
        })}
      />
    </Screen>
  );
}

export default function BusinessSettingsScreen() {
  return (
    <ManagerOnly>
      <BusinessSettings />
    </ManagerOnly>
  );
}
