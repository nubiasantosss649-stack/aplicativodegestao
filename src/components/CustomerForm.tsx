import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import { PhoneField } from '@/components/MaskedFields';
import { Button, FormField, Text } from '@/components/ui';
import { customerSchema, type CustomerForm as CustomerFormValues } from '@/features/schemas';
import { spacing } from '@/theme/colors';

interface Props {
  defaultValues: CustomerFormValues;
  submitLabel: string;
  onSubmit: (v: CustomerFormValues) => Promise<void>;
}

export function CustomerForm({ defaultValues, submitLabel, onSubmit }: Props) {
  const { control, handleSubmit, formState } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues,
  });
  return (
    <View style={{ gap: spacing.lg }}>
      <FormField control={control} name="name" label="Nome" autoComplete="name" placeholder="Nome do cliente" />
      <PhoneField control={control} name="phone" label="Telefone / WhatsApp" hint="Usado para enviar cobranças pelo WhatsApp" />
      <FormField control={control} name="email" label="E-mail (opcional)" keyboardType="email-address" autoCapitalize="none" />
      <FormField control={control} name="address" label="Endereço (opcional)" multiline maxLength={300} />
      <FormField control={control} name="notes" label="Observações internas (opcional)" multiline maxLength={1000} hint="Visível apenas para a equipe do negócio" />
      <Text variant="caption" tone="muted">
        Cadastre apenas os dados necessários. Os dados pessoais dos clientes são protegidos conforme a LGPD.
      </Text>
      <Button title={submitLabel} icon="save" onPress={handleSubmit(onSubmit)} loading={formState.isSubmitting} />
    </View>
  );
}
