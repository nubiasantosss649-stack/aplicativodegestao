import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';

import { Button, ErrorState, LoadingState, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Retorno dos links de e-mail (confirmação de cadastro e recuperação de senha).
 * Troca o código PKCE (ou tokens) por uma sessão.
 */
export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; next?: string; error_description?: string }>();
  const url = Linking.useLinkingURL();
  const { setRecoveringPassword } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (params.error_description) throw new Error(params.error_description);
        const hash = url?.split('#')[1] ?? '';
        const hashParams = new URLSearchParams(hash);
        if (params.code) {
          const { error: e } = await supabase.auth.exchangeCodeForSession(params.code);
          if (e) throw e;
        } else if (hashParams.get('access_token') && hashParams.get('refresh_token')) {
          const { error: e } = await supabase.auth.setSession({
            access_token: hashParams.get('access_token')!,
            refresh_token: hashParams.get('refresh_token')!,
          });
          if (e) throw e;
        } else if (hashParams.get('error_description')) {
          throw new Error(hashParams.get('error_description')!);
        }
        if (cancelled) return;
        if (params.next === '/reset-password' || hashParams.get('type') === 'recovery') {
          setRecoveringPassword(true);
        }
        router.replace('/');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Link inválido ou expirado.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.code, params.next, params.error_description, url, setRecoveringPassword]);

  if (error) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ErrorState error={new Error(`${error} Solicite um novo link.`)} />
        <Button title="Voltar ao início" variant="outline" onPress={() => router.replace('/')} />
      </Screen>
    );
  }
  return <LoadingState message="Validando seu acesso..." />;
}
