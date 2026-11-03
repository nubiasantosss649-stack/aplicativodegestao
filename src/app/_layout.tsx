import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { BusinessProvider, useBusiness } from '@/providers/BusinessProvider';
import { PurchasesIdentity } from '@/providers/PurchasesIdentity';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  const { session, initializing, recoveringPassword } = useAuth();
  const { business, loading } = useBusiness();
  const { colors, isDark } = useTheme();

  const ready = !initializing && !(session && loading);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  if (!ready) return null; // splash nativa permanece visível

  const signedIn = !!session;
  const hasBusiness = !!business;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {/* Primeira tela: ao sair de uma área protegida o router volta para cá e o index decide o destino */}
        <Stack.Screen name="index" />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && recoveringPassword}>
          <Stack.Screen name="reset-password" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && !recoveringPassword && !hasBusiness}>
          <Stack.Screen name="business-setup" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && !recoveringPassword && hasBusiness}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>

        <Stack.Screen name="auth/callback" />
        <Stack.Screen
          name="terms"
          options={{ headerShown: true, title: 'Termos de Uso', headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.surface }, headerTitleStyle: { color: colors.text } }}
        />
        <Stack.Screen
          name="privacy"
          options={{ headerShown: true, title: 'Privacidade', headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.surface }, headerTitleStyle: { color: colors.text } }}
        />
        <Stack.Screen name="index" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ToastProvider>
              <AuthProvider>
                <BusinessProvider>
                  <PurchasesIdentity />
                  <RootNavigator />
                </BusinessProvider>
              </AuthProvider>
            </ToastProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
