import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

interface ChipsProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  scroll?: boolean;
}

/** Seletor em pílulas (segmentado). */
export function Chips<T extends string>({ options, value, onChange, scroll = true }: ChipsProps<T>) {
  const { colors } = useTheme();
  const chips = options.map((o) => {
    const active = o.value === value;
    return (
      <Pressable
        key={o.value}
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        accessibilityLabel={o.label}
        onPress={() => onChange(o.value)}
        style={[
          styles.chip,
          {
            backgroundColor: active ? colors.primary : colors.surface,
            borderColor: active ? colors.primary : colors.border,
          },
        ]}
      >
        <Text variant="label" style={{ color: active ? colors.onPrimary : colors.text }}>
          {o.label}
        </Text>
      </Pressable>
    );
  });
  if (!scroll) return <>{chips}</>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    paddingHorizontal: spacing.lg,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
  },
});
