import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from './env';
import { authStorage } from './secureStorage';

export const supabase = createClient(
  env.supabaseUrl || 'http://localhost:54321',
  env.supabaseAnonKey || 'public-anon-key-not-configured',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
  },
);

// Renova o token apenas com o app em primeiro plano (recomendação do Supabase para RN)
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Lança o erro do Supabase (se houver) e retorna os dados tipados. */
export function unwrap<T>(result: { data: unknown; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}
