import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { AuthHeader } from '@/components/AuthHeader';
import { Button, EmptyState, FormField, Screen, useToast } from '@/components/ui';
import { forgotPasswordSchema, type ForgotPasswordForm } from '@/features/schemas';
import { errorMessage } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const toast = useToast();
  const [sent, setSent] = useState(false);
  const { control, handleSubmit, formState } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  });

  if (sent) {
    return (
      <Screen>
        <EmptyState
          icon="mail-open"
          title="Verifique seu e-mail"
          message="Se houver uma conta com este e-mail, você receberá um link para criar uma nova senha. Abra o link neste aparelho."
          actionLabel="Voltar ao login"
          onAction={() => router.replace('/sign-in')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <AuthHeader title="Recuperar senha" subtitle="Informe seu e-mail e enviaremos um link para redefinir a senha." />
      <FormField control={control} name="email" label="E-mail" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Button title="Enviar link" icon="send" onPress={onSubmit} loading={formState.isSubmitting} />
    </Screen>
  );
}
