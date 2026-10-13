import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';

import { TextField, type TextFieldProps } from './TextField';

interface FormFieldProps<T extends FieldValues> extends Omit<TextFieldProps, 'value' | 'onChangeText'> {
  control: Control<T>;
  name: Path<T>;
}

/** TextField conectado ao React Hook Form. */
export function FormField<T extends FieldValues>({ control, name, ...rest }: FormFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...rest}
          value={field.value as string}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}
