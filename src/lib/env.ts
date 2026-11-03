/**
 * Variáveis públicas do app. Apenas chaves públicas (anon/publishable) podem
 * estar aqui — segredos ficam no backend (Edge Functions).
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** development | staging | production — staging/dev usam compras de teste (sandbox) */
  appEnv: (process.env.EXPO_PUBLIC_APP_ENV ?? 'development') as 'development' | 'staging' | 'production',
  /** Chaves PÚBLICAS do SDK RevenueCat (podem ficar no app; a chave secreta fica no backend) */
  revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
