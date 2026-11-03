import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { PhoneField } from '@/components/MaskedFields';
import { Button, ErrorState, FormField, LoadingState, Screen, Text, useToast } from '@/components/ui';
import { useProfile, useUpdateProfile } from '@/features/business/api';
import { formatPhone, isValidPhone, onlyDigits } from '@/lib/documents';
import { errorMessage } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Informe seu nome').max(120),
  phone: z.string().refine((v) => !v.trim() || isValidPhone(v), { message: 'Telefone inválido' }),
});
type Form = z.infer<typeof schema>;

function ProfileForm({ defaults }: { defaults: Form }) {
  const toast = useToast();
  const update = useUpdateProfile();
  const { control, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: defaults });
  return (
    <>
      <FormField control={control} name="fullName" label="Nome" autoComplete="name" />
      <PhoneField control={control} name="phone" label="Telefone (opcional)" />
      <Button
        title="Salvar"
        icon="save"
        loading={formState.isSubmitting}
        onPress={handleSubmit(async (v) => {
          try {
            await update.mutateAsync({ full_name: v.fullName.trim(), phone: onlyDigits(v.phone) || null });
            toast.show('Perfil atualizado!');
            router.back();
          } catch (e) {
            toast.show(errorMessage(e), 'error');
          }
        })}
      />
    </>
  );
}

export default function Profile() {
  const { user, sendPasswordReset } = useAuth();
  const toast = useToast();
  const { data, isPending, error, refetch } = useProfile();
  if (isPending) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  return (
    <Screen>
      <Text tone="muted">E-mail: {user?.email}</Text>
      <ProfileForm defaults={{ fullName: data.full_name, phone: formatPhone(data.phone) }} />
      <Button
        title="Alterar senha por e-mail"
        icon="key"
        variant="ghost"
        onPress={async () => {
          try {
            await sendPasswordReset(user?.email ?? '');
            toast.show('Enviamos um link para alterar a senha.');
          } catch (e) {
            toast.show(errorMessage(e), 'error');
          }
        }}
      />
    </Screen>
  );
}
