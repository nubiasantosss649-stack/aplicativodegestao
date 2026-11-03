import { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export interface BarDatum {
  label: string;
  value: number;
  detail?: string;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  formatValue: (value: number) => string;
  emptyMessage?: string;
}

/** Gráfico de barras interativo: toque em uma barra para ver o valor. */
export function BarChart({ data, height = 160, formatValue, emptyMessage = 'Sem dados no período' }: BarChartProps) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [selected, setSelected] = useState<number | null>(null);
  const width = Math.min(screenWidth, 760) - spacing.lg * 4;
  const max = Math.max(...data.map((d) => d.value), 0);

  if (data.length === 0 || max === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text tone="muted">{emptyMessage}</Text>
      </View>
    );
  }

  const gap = data.length > 20 ? 2 : 6;
  const barWidth = Math.max(4, (width - gap * (data.length - 1)) / data.length);
  const current = selected != null ? data[selected] : null;
  const labelEvery = Math.ceil(data.length / 7);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.tooltip}>
        {current ? (
          <Text variant="label">
            {current.label}: <Text variant="label" tone="primary">{formatValue(current.value)}</Text>
            {current.detail ? <Text variant="caption" tone="muted">{`  ${current.detail}`}</Text> : null}
          </Text>
        ) : (
          <Text variant="caption" tone="muted">
            Toque em uma barra para ver o valor
          </Text>
        )}
      </View>
      <Svg width={width} height={height} accessibilityLabel="Gráfico de vendas">
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * (height - 4));
          return (
            <Rect
              key={`${d.label}-${i}`}
              x={i * (barWidth + gap)}
              y={height - h}
              width={barWidth}
              height={h}
              rx={Math.min(6, barWidth / 2)}
              fill={selected === i ? colors.success : colors.primary}
              opacity={selected == null || selected === i ? 1 : 0.45}
              onPress={() => setSelected(selected === i ? null : i)}
            />
          );
        })}
      </Svg>
      <View style={[styles.labels, { width }]}>
        {data.map((d, i) => (
          <Text
            key={`l-${d.label}-${i}`}
            variant="caption"
            tone="muted"
            numberOfLines={1}
            style={{ width: barWidth + gap, textAlign: 'center', opacity: i % labelEvery === 0 ? 1 : 0 }}
          >
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  tooltip: { minHeight: 22 },
  labels: { flexDirection: 'row', overflow: 'hidden' },
});
