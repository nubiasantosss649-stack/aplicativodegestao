import { useState } from 'react';
import { View } from 'react-native';

import { Button, Chips, Text, TextField } from '@/components/ui';
import { formatDate, parseBRDate, rangeFor, type DateRange, type PeriodKey } from '@/lib/dates';
import { spacing } from '@/theme/colors';

const OPTIONS = [
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: '7 dias' },
  { value: 'month', label: 'Mês' },
  { value: 'custom', label: 'Período' },
] as const;

interface Props {
  value: { key: PeriodKey; range: DateRange };
  onChange: (v: { key: PeriodKey; range: DateRange }) => void;
}

/** Filtro de período: dia, semana, mês ou personalizado (até 1 ano). */
export function PeriodFilter({ value, onChange }: Props) {
  const [from, setFrom] = useState(formatDate(value.range.from));
  const [to, setTo] = useState(formatDate(value.range.to));
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  return (
    <View style={{ gap: spacing.sm }}>
      <Chips
        options={OPTIONS}
        value={editing ? 'custom' : value.key}
        onChange={(k) => {
          if (k === 'custom') {
            setEditing(true);
            return;
          }
          setEditing(false);
          onChange({ key: k, range: rangeFor(k) });
        }}
      />
      {editing ? (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <TextField label="De" mask="date" value={from} onChangeText={setFrom} placeholder="DD/MM/AAAA" />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="Até" mask="date" value={to} onChangeText={setTo} placeholder="DD/MM/AAAA" />
            </View>
          </View>
          {error ? <Text tone="danger" variant="caption">{error}</Text> : null}
          <Button
            title="Aplicar período"
            size="md"
            onPress={() => {
              const f = parseBRDate(from);
              const t = parseBRDate(to);
              if (!f || !t || t < f) return setError('Informe datas válidas (início antes do fim).');
              const days = (new Date(t).getTime() - new Date(f).getTime()) / 86_400_000;
              if (days > 366) return setError('O período máximo é de 1 ano.');
              setError(null);
              setEditing(false);
              onChange({ key: 'custom', range: { from: f, to: t } });
            }}
          />
        </View>
      ) : value.key === 'custom' ? (
        <Text variant="caption" tone="muted">
          {formatDate(value.range.from)} a {formatDate(value.range.to)}
        </Text>
      ) : null}
    </View>
  );
}

export function usePeriod(initial: Exclude<PeriodKey, 'custom'> = 'month') {
  return useState<{ key: PeriodKey; range: DateRange }>({ key: initial, range: rangeFor(initial) });
}
