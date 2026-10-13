import { router, useLocalSearchParams } from 'expo-router';

import { ProductForm } from '@/components/ProductForm';
import { ErrorState, LoadingState, Screen, useToast } from '@/components/ui';
import { useProduct, useUpdateProduct } from '@/features/products/api';
import { formToPatch, productToForm } from '@/features/products/form';
import { errorMessage } from '@/lib/errors';
import { useCurrentBusiness } from '@/providers/BusinessProvider';

export default function EditProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useCurrentBusiness();
  const toast = useToast();
  const { data, isPending, error, refetch } = useProduct(id);
  const update = useUpdateProduct(business.id, id);

  if (isPending) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <Screen>
      <ProductForm
        businessId={business.id}
        defaultValues={productToForm(data)}
        isEdit
        submitLabel="Salvar alterações"
        onSubmit={async (values) => {
          try {
            await update.mutateAsync(formToPatch(values));
            toast.show('Produto atualizado!');
            router.back();
          } catch (e) {
            toast.show(errorMessage(e), 'error');
          }
        }}
      />
    </Screen>
  );
}
