import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { formatQuantity } from '@/lib/money';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

export function QuantityStepper({
  value,
  unit,
  onChange,
}: {
  value: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const { colors } = useTheme();
  const step = unit === 'kg' || unit === 'l' || unit === 'm' ? 0.1 : 1;
  const btn = (icon: 'remove' | 'add', delta: number, label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => onChange(Math.round((value + delta) * 1000) / 1000)}
      style={[styles.btn, { backgroundColor: colors.primarySoft }]}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
    </Pressable>
  );
  return (
    <View style={styles.row}>
      {btn('remove', -step, 'Diminuir quantidade')}
      <Text bold style={styles.value}>
        {formatQuantity(value, unit === 'un' ? '' : unit).trim()}
      </Text>
      {btn('add', step, 'Aumentar quantidade')}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 44, textAlign: 'center' },
});
