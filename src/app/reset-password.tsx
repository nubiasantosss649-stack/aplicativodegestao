import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';

import { AuthHeader } from '@/components/AuthHeader';
import { Button, FormField, Screen, useToast } from '@/components/ui';
import { resetPasswordSchema, type ResetPasswordForm } from '@/features/schemas';
import { errorMessage } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';

export default function ResetPassword() {
  const { updatePassword, signOut } = useAuth();
  const toast = useToast();
  const { control, handleSubmit, formState } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await updatePassword(password);
      toast.show('Senha alterada com sucesso!');
      router.replace('/');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <AuthHeader title="Nova senha" subtitle="Crie uma nova senha para sua conta." />
      <FormField control={control} name="password" label="Nova senha" secureTextEntry autoComplete="new-password" hint="Mínimo de 8 caracteres, com letras e números" />
      <FormField control={control} name="confirmPassword" label="Confirme a nova senha" secureTextEntry autoComplete="new-password" />
      <Button title="Salvar nova senha" icon="lock-closed" onPress={onSubmit} loading={formState.isSubmitting} />
      <Button title="Cancelar e sair" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
