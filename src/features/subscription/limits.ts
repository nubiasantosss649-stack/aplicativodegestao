import { router } from 'expo-router';

import { toAppError } from '@/lib/errors';

import { planLimitKind } from './plans';

/**
 * Se o erro for de limite do Plano Grátis, mostra a mensagem e leva à tela Pro.
 * Retorna true quando o erro foi tratado.
 */
export function handlePlanLimitError(error: unknown, notify: (message: string, tone: 'error' | 'info') => void): boolean {
  const appError = toAppError(error);
  const kind = planLimitKind(appError);
  if (!kind) return false;
  notify(appError.message, 'info');
  router.push({ pathname: '/subscription', params: { reason: kind } });
  return true;
}
