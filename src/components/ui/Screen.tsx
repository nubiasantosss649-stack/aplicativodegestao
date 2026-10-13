import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  contentStyle?: ViewStyle;
}

/**
 * Container padrão das telas: área segura, rolagem, teclado, pull-to-refresh
 * e largura máxima para tablets/web.
 */
export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['bottom'],
  refreshing,
  onRefresh,
  footer,
  contentStyle,
}: ScreenProps) {
  const { colors } = useTheme();
  const inner = [styles.content, padded && styles.padded, contentStyle];
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={edges}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={inner}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              onRefresh ? (
                <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
              ) : undefined
            }
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, ...inner]}>{children}</View>
        )}
        {footer ? (
          <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={styles.maxWidth}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.lg, width: '100%', maxWidth: 760, alignSelf: 'center', flexGrow: 1 },
  padded: { padding: spacing.lg, paddingBottom: spacing.xxl },
  footer: { padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  maxWidth: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: spacing.sm },
});
