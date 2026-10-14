import { FunctionsHttpError } from '@supabase/supabase-js';

import { AppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

/** Exclui definitivamente a conta e todos os dados do usuário (via backend). */
export async function deleteAccount(confirmation: string, acknowledgeSubscription: boolean): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', {
    body: { confirmation, acknowledge_subscription: acknowledgeSubscription },
  });
  if (!error) return;
  if (error instanceof FunctionsHttpError) {
    let body: { error?: string; message?: string } = {};
    try {
      body = await (error.context as Response).json();
    } catch {
      // sem corpo JSON
    }
    throw new AppError(body.message ?? 'Não foi possível excluir a conta.', body.error);
  }
  throw new AppError('Sem conexão com o servidor. Tente novamente.', 'network');
}
