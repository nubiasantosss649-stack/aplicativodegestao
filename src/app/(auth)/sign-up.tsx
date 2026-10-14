import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AuthHeader } from '@/components/AuthHeader';
import { Button, EmptyState, FormField, Screen, Text, useToast } from '@/components/ui';
import { signUpSchema, type SignUpForm } from '@/features/schemas';
import { errorMessage } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

export default function SignUp() {
  const { signUp } = useAuth();
  const toast = useToast();
  const { colors } = useTheme();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignUpForm>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '', acceptTerms: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { needsConfirmation } = await signUp(values.fullName, values.email, values.password);
      if (needsConfirmation) setSentTo(values.email);
      else router.replace('/');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  });

  if (sentTo) {
    return (
      <Screen>
        <EmptyState
          icon="mail-unread"
          title="Confirme seu e-mail"
          message={`Enviamos um link de confirmação para ${sentTo}. Abra o e-mail neste aparelho para ativar sua conta.`}
          actionLabel="Ir para o login"
          onAction={() => router.replace('/sign-in')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <AuthHeader title="Criar conta" subtitle="Grátis. Não precisa ter empresa aberta." />
      <FormField control={control} name="fullName" label="Seu nome" autoComplete="name" placeholder="Maria da Silva" />
      <FormField control={control} name="email" label="E-mail" keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="voce@email.com" />
      <FormField control={control} name="password" label="Senha" secureTextEntry autoComplete="new-password" hint="Mínimo de 8 caracteres, com letras e números" />
      <FormField control={control} name="confirmPassword" label="Confirme a senha" secureTextEntry autoComplete="new-password" />
      <Controller
        control={control}
        name="acceptTerms"
        render={({ field, fieldState }) => (
          <View style={{ gap: spacing.xs }}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: field.value }}
              onPress={() => field.onChange(!field.value)}
              style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}
            >
              <Ionicons name={field.value ? 'checkbox' : 'square-outline'} size={26} color={colors.primary} />
              <Text style={{ flex: 1 }}>
                Li e aceito os <Text tone="primary" bold onPress={() => router.push('/terms')}>Termos de Uso</Text> e a{' '}
                <Text tone="primary" bold onPress={() => router.push('/privacy')}>Política de Privacidade</Text>.
              </Text>
            </Pressable>
            {fieldState.error ? (
              <Text variant="caption" tone="danger">
                {fieldState.error.message}
              </Text>
            ) : null}
          </View>
        )}
      />
      <Button title="Criar conta" icon="person-add" onPress={onSubmit} loading={formState.isSubmitting} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs }}>
        <Text tone="muted">Já tem conta?</Text>
        <Link href="/sign-in">
          <Text tone="primary" bold>
            Entrar
          </Text>
        </Link>
      </View>
    </Screen>
  );
}
