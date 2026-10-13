import { router } from 'expo-router';

import { CustomerForm } from '@/components/CustomerForm';
import { Screen, useToast } from '@/components/ui';
import { useCreateCustomer } from '@/features/customers/api';
import { errorMessage } from '@/lib/errors';
import { useCurrentBusiness } from '@/providers/BusinessProvider';

export default function NewCustomer() {
  const business = useCurrentBusiness();
  const toast = useToast();
  const create = useCreateCustomer(business.id);
  return (
    <Screen>
      <CustomerForm
        defaultValues={{ name: '', phone: '', email: '', address: '', notes: '' }}
        submitLabel="Salvar cliente"
        onSubmit={async (v) => {
          try {
            await create.mutateAsync(v);
            toast.show('Cliente cadastrado!');
            router.back();
          } catch (e) {
            toast.show(errorMessage(e), 'error');
          }
        }}
      />
    </Screen>
  );
}
