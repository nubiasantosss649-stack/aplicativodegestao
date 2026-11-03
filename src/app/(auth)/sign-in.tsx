import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { View } from 'react-native';

import { AuthHeader } from '@/components/AuthHeader';
import { Button, FormField, Screen, Text, useToast } from '@/components/ui';
import { signInSchema, type SignInForm } from '@/features/schemas';
import { isSupabaseConfigured } from '@/lib/env';
import { errorMessage, toAppError } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';
import { spacing } from '@/theme/colors';

export default function SignIn() {
  const { signIn, resendConfirmation } = useAuth();
  const toast = useToast();
  const [notConfirmed, setNotConfirmed] = useState(false);
  const { control, handleSubmit, getValues, formState } = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      setNotConfirmed(false);
      await signIn(values.email, values.password);
      router.replace('/');
    } catch (e) {
      const err = toAppError(e);
      if (err.message.startsWith('Confirme seu e-mail')) setNotConfirmed(true);
      toast.show(err.message, 'error');
    }
  });

  return (
    <Screen edges={['bottom']}>
      <AuthHeader title="Entrar" subtitle="Acesse a gestão do seu negócio." />
      {!isSupabaseConfigured ? (
        <Text tone="danger">
          Backend não configurado: defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no arquivo .env.
        </Text>
      ) : null}
      <FormField control={control} name="email" label="E-mail" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="voce@email.com" />
      <FormField control={control} name="password" label="Senha" secureTextEntry autoComplete="password" textContentType="password" placeholder="Sua senha" onSubmitEditing={onSubmit} />
      <Link href="/forgot-password" style={{ alignSelf: 'flex-end' }}>
        <Text variant="label" tone="primary">
          Esqueci minha senha
        </Text>
      </Link>
      <Button title="Entrar" icon="log-in" onPress={onSubmit} loading={formState.isSubmitting} />
      {notConfirmed ? (
        <Button
          title="Reenviar e-mail de confirmação"
          variant="outline"
          onPress={async () => {
            try {
              await resendConfirmation(getValues('email'));
              toast.show('E-mail de confirmação reenviado.');
            } catch (e) {
              toast.show(errorMessage(e), 'error');
            }
          }}
        />
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.md }}>
        <Text tone="muted">Ainda não tem conta?</Text>
        <Link href="/sign-up">
          <Text tone="primary" bold>
            Criar conta grátis
          </Text>
        </Link>
      </View>
    </Screen>
  );
}
