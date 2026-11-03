import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';

import { AuthHeader } from '@/components/AuthHeader';
import { DocumentField, PhoneField } from '@/components/MaskedFields';
import { Button, Chips, FormField, Screen, Text, useToast } from '@/components/ui';
import { useCreateBusiness } from '@/features/business/api';
import { BUSINESS_TYPES, businessSchema, type BusinessForm } from '@/features/schemas';
import { errorMessage } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';
import { useBusiness } from '@/providers/BusinessProvider';

export default function BusinessSetup() {
  const toast = useToast();
  const { signOut } = useAuth();
  const { refetch, selectBusiness } = useBusiness();
  const create = useCreateBusiness();
  const { control, handleSubmit, formState } = useForm<BusinessForm>({
    resolver: zodResolver(businessSchema),
    defaultValues: { name: '', businessType: 'retail', document: '', phone: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const business = await create.mutateAsync(values);
      selectBusiness(business.id);
      await refetch();
      toast.show('Negócio cadastrado! Vamos começar.');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <AuthHeader title="Seu negócio" subtitle="Conte um pouco sobre o seu negócio. Você pode alterar depois." />
      <FormField control={control} name="name" label="Nome do negócio" placeholder="Ex.: Mercadinho da Maria" />
      <Text variant="label">Tipo de negócio</Text>
      <Controller
        control={control}
        name="businessType"
        render={({ field }) => <Chips options={BUSINESS_TYPES} value={field.value} onChange={field.onChange} />}
      />
      <DocumentField control={control} name="document" />
      <PhoneField control={control} name="phone" />
      <Button title="Começar a usar" icon="checkmark-circle" onPress={onSubmit} loading={formState.isSubmitting} />
      <Button title="Sair" variant="ghost" onPress={signOut} />
    </Screen>
  );
}
