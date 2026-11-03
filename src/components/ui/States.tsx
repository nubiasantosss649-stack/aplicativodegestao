import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { errorMessage } from '@/lib/errors';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

import { Button, type IconName } from './Button';
import { Text } from './Text';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Tela vazia com orientação clara do próximo passo. */
export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={36} color={colors.primary} />
      </View>
      <Text variant="subtitle" center>
        {title}
      </Text>
      <Text tone="muted" center>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} fullWidth={false} style={{ marginTop: spacing.sm }} />
      ) : null}
    </View>
  );
}

export function LoadingState({ message = 'Carregando...' }: { message?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text tone="muted">{message}</Text>
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.dangerSoft }]}>
        <Ionicons name="cloud-offline-outline" size={36} color={colors.danger} />
      </View>
      <Text variant="subtitle" center>
        Não foi possível carregar
      </Text>
      <Text tone="muted" center>
        {errorMessage(error)}
      </Text>
      {onRetry ? <Button title="Tentar novamente" icon="refresh" variant="outline" onPress={onRetry} fullWidth={false} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    flexGrow: 1,
    minHeight: 280,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
