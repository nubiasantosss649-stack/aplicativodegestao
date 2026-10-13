import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, View } from 'react-native';

import { useProductPhotoUrl } from '@/features/products/api';
import { radius } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

export function ProductPhoto({ path, size = 96 }: { path: string | null; size?: number }) {
  const { colors } = useTheme();
  const { data: url } = useProductPhotoUrl(path);
  return (
    <View style={[styles.box, { width: size, height: size, backgroundColor: colors.surfaceAlt }]}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size }} accessibilityLabel="Foto do produto" />
      ) : (
        <Ionicons name="image-outline" size={size / 2.5} color={colors.textMuted} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
