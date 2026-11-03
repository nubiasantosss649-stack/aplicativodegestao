import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { TextField } from './TextField';

interface SearchBarProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  onScan?: () => void;
}

export function SearchBar({ value, onChangeText, placeholder = 'Buscar...', onScan }: SearchBarProps) {
  const { colors } = useTheme();
  return (
    <TextField
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      accessibilityLabel={placeholder}
      autoCorrect={false}
      returnKeyType="search"
      left={<Ionicons name="search" size={20} color={colors.textMuted} />}
      right={
        <>
          {value ? (
            <Pressable accessibilityLabel="Limpar busca" hitSlop={10} onPress={() => onChangeText('')}>
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          ) : null}
          {onScan ? (
            <Pressable accessibilityLabel="Ler código de barras" hitSlop={10} onPress={onScan}>
              <Ionicons name="barcode-outline" size={26} color={colors.primary} />
            </Pressable>
          ) : null}
        </>
      }
    />
  );
}
