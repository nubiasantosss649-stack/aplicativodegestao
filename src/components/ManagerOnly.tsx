import type { ReactNode } from 'react';

import { EmptyState, Screen } from '@/components/ui';
import { useBusiness } from '@/providers/BusinessProvider';

export function ManagerOnly({ children }: { children: ReactNode }) {
  const { isManager } = useBusiness();
  if (isManager) return <>{children}</>;
  return (
    <Screen>
      <EmptyState icon="lock-closed" title="Acesso restrito" message="Somente o dono ou gerente do negócio pode acessar o financeiro." />
    </Screen>
  );
}
