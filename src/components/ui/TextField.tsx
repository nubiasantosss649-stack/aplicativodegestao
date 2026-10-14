import { forwardRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { maskDateInput } from '@/lib/dates';
import { maskMoneyDigits } from '@/lib/money';
import { radius, spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  left?: ReactNode;
  right?: ReactNode;
  mask?: 'money' | 'date';
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, left, right, mask, style, onChangeText, onFocus, onBlur, multiline, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  const handleChange = (text: string) => {
    if (mask === 'money') onChangeText?.(maskMoneyDigits(text));
    else if (mask === 'date') onChangeText?.(maskDateInput(text));
    else onChangeText?.(text);
  };

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text variant="label" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
            minHeight: multiline ? 96 : 52,
          },
        ]}
      >
        {left ?? (mask === 'money' ? <Text tone="muted">R$</Text> : null)}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          keyboardType={mask === 'money' || mask === 'date' ? 'number-pad' : rest.keyboardType}
          style={[styles.input, { color: colors.text, textAlignVertical: multiline ? 'top' : 'center' }, style]}
          onChangeText={handleChange}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { marginBottom: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: spacing.md },
});
