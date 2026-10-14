import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, EmptyState, ListItem, LoadingState, SearchBar, Text } from '@/components/ui';
import { useCustomers } from '@/features/customers/api';
import { formatPhone } from '@/lib/documents';
import type { Customer } from '@/types/database';
import { spacing } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';

interface Props {
  businessId: string;
  visible: boolean;
  onClose: () => void;
  onSelect: (customer: Customer) => void;
}

export function CustomerPicker({ businessId, visible, onClose, onSelect }: Props) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const { data, isPending } = useCustomers(businessId, search);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: spacing.lg, gap: spacing.md, flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="title">Selecionar cliente</Text>
            <Button title="Fechar" variant="ghost" size="sm" fullWidth={false} onPress={onClose} />
          </View>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Nome ou telefone" />
          {isPending ? (
            <LoadingState />
          ) : (
            <FlatList
              data={data ?? []}
              keyExtractor={(c) => c.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
              ListEmptyComponent={
                <EmptyState
                  icon="person-add"
                  title="Nenhum cliente encontrado"
                  message="Cadastre o cliente para vender fiado e acompanhar o histórico."
                  actionLabel="Cadastrar cliente"
                  onAction={() => {
                    onClose();
                    router.push('/customers/new');
                  }}
                />
              }
              renderItem={({ item }) => (
                <ListItem
                  icon="person"
                  title={item.name}
                  subtitle={item.phone ? formatPhone(item.phone) : 'Sem telefone'}
                  onPress={() => onSelect(item)}
                />
              )}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
