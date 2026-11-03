import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { prefs } from '@/lib/storage';
import { useAuth } from '@/providers/AuthProvider';
import { useBusiness } from '@/providers/BusinessProvider';

/** Ponto de entrada: direciona para a tela certa conforme o estado do usuário. */
export default function Index() {
  const { session, recoveringPassword } = useAuth();
  const { business } = useBusiness();
  const [seenWelcome, setSeenWelcome] = useState<boolean | null>(null);

  useEffect(() => {
    prefs.get('welcome-seen').then((v) => setSeenWelcome(v === '1'));
  }, []);

  if (!session) {
    if (seenWelcome === null) return null;
    return <Redirect href={seenWelcome ? '/sign-in' : '/welcome'} />;
  }
  if (recoveringPassword) return <Redirect href="/reset-password" />;
  if (!business) return <Redirect href="/business-setup" />;
  return <Redirect href="/(app)/(tabs)" />;
}
