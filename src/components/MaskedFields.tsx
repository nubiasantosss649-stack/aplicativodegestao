import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';

import { TextField } from '@/components/ui';
import { formatDocument, formatPhone, onlyDigits } from '@/lib/documents';

interface Props<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  hint?: string;
}

export function DocumentField<T extends FieldValues>({ control, name, label = 'CPF ou CNPJ (opcional)', hint }: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          label={label}
          hint={hint ?? 'Não é obrigatório ter empresa aberta. Usado apenas nos comprovantes.'}
          keyboardType="number-pad"
          value={field.value as string}
          onBlur={field.onBlur}
          onChangeText={(t) => field.onChange(formatDocument(onlyDigits(t).slice(0, 14)))}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}

export function PhoneField<T extends FieldValues>({ control, name, label = 'Telefone / WhatsApp (opcional)', hint }: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          label={label}
          hint={hint}
          keyboardType="phone-pad"
          autoComplete="tel"
          value={field.value as string}
          onBlur={field.onBlur}
          onChangeText={(t) => field.onChange(formatPhone(onlyDigits(t).slice(0, 11)))}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}
