import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import type { IconName } from '@/components/ui';
import { useCart } from '@/providers/CartProvider';
import { useTheme } from '@/theme/ThemeProvider';

function icon(name: IconName, focusedName: IconName) {
  function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    return <Ionicons name={focused ? focusedName : name} size={size} color={color as string} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const { totals } = useCart();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.border, minHeight: 60 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen
        name="sell"
        options={{
          title: 'Vender',
          tabBarIcon: icon('cart-outline', 'cart'),
          tabBarBadge: totals.itemCount > 0 ? totals.itemCount : undefined,
        }}
      />
      <Tabs.Screen name="products" options={{ title: 'Produtos', tabBarIcon: icon('cube-outline', 'cube') }} />
      <Tabs.Screen name="customers" options={{ title: 'Clientes', tabBarIcon: icon('people-outline', 'people') }} />
      <Tabs.Screen name="more" options={{ title: 'Mais', tabBarIcon: icon('grid-outline', 'grid') }} />
    </Tabs>
  );
}
