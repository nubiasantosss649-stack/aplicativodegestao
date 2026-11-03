import { router, useLocalSearchParams } from 'expo-router';

import { CustomerForm } from '@/components/CustomerForm';
import { ErrorState, LoadingState, Screen, useToast } from '@/components/ui';
import { useCustomer, useUpdateCustomer } from '@/features/customers/api';
import { formatPhone } from '@/lib/documents';
import { errorMessage } from '@/lib/errors';
import { useCurrentBusiness } from '@/providers/BusinessProvider';

export default function EditCustomer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useCurrentBusiness();
  const toast = useToast();
  const { data: c, isPending, error, refetch } = useCustomer(id);
  const update = useUpdateCustomer(business.id, id);
  if (isPending) return <LoadingState />;
  if (error || !c) return <ErrorState error={error} onRetry={refetch} />;
  return (
    <Screen>
      <CustomerForm
        defaultValues={{
          name: c.name,
          phone: formatPhone(c.phone),
          email: c.email ?? '',
          address: c.address ?? '',
          notes: c.notes ?? '',
        }}
        submitLabel="Salvar alterações"
        onSubmit={async (v) => {
          try {
            await update.mutateAsync(v);
            toast.show('Cliente atualizado!');
            router.back();
          } catch (e) {
            toast.show(errorMessage(e), 'error');
          }
        }}
      />
    </Screen>
  );
}
