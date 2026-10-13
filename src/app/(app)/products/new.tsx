import { router, useLocalSearchParams } from 'expo-router';

import { ProductForm } from '@/components/ProductForm';
import { EmptyState, Screen, useToast } from '@/components/ui';
import { useCreateProduct } from '@/features/products/api';
import { emptyProductForm, formToCreateInput } from '@/features/products/form';
import { errorMessage } from '@/lib/errors';
import { useCurrentBusiness } from '@/providers/BusinessProvider';

export default function NewProduct() {
  const business = useCurrentBusiness();
  const { barcode } = useLocalSearchParams<{ barcode?: string }>();
  const toast = useToast();
  const create = useCreateProduct(business.id);

  if (!business.isManager) {
    return (
      <Screen>
        <EmptyState icon="lock-closed" title="Sem permissão" message="Apenas o dono ou gerente pode cadastrar produtos." />
      </Screen>
    );
  }

  return (
    <Screen>
      <ProductForm
        businessId={business.id}
        defaultValues={emptyProductForm(barcode ?? '')}
        submitLabel="Salvar produto"
        onSubmit={async (values) => {
          try {
            const product = await create.mutateAsync(formToCreateInput(values));
            toast.show('Produto cadastrado!');
            router.replace(`/products/${product.id}`);
          } catch (e) {
            toast.show(errorMessage(e), 'error');
          }
        }}
      />
    </Screen>
  );
}
