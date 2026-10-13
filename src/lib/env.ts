/**
 * Variáveis públicas do app. Apenas chaves públicas (anon/publishable) podem
 * estar aqui — segredos ficam no backend (Edge Functions).
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
