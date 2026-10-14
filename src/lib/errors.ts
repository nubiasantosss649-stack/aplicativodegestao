/** Traduz erros do Supabase/PostgREST em mensagens claras para o comerciante. */

interface MaybePgError {
  message?: string;
  code?: string;
  hint?: string | null;
  details?: string | null;
  status?: number;
  name?: string;
}

const AUTH_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.',
  'User already registered': 'Este e-mail já está cadastrado.',
  'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres.',
  'For security purposes, you can only request this after': 'Aguarde alguns segundos antes de tentar novamente.',
  'Email rate limit exceeded': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
};

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly hint?: string | null,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const e = (error ?? {}) as MaybePgError;
  const message = e.message ?? 'Erro inesperado';

  for (const [key, friendly] of Object.entries(AUTH_MESSAGES)) {
    if (message.includes(key)) return new AppError(friendly, e.code);
  }

  if (message.includes('Network request failed') || message.includes('Failed to fetch')) {
    return new AppError('Sem conexão com a internet. Verifique sua rede e tente novamente.', 'network');
  }

  switch (e.code) {
    // Mensagens de negócio lançadas pelas funções do banco já estão em português
    case 'P0001':
    case '22023':
    case 'P0002':
      return new AppError(message, e.code, e.hint);
    case '42501':
      return new AppError(
        message.startsWith('permission denied')
          ? 'Você não tem permissão para esta operação.'
          : message,
        e.code,
        e.hint,
      );
    case '23505':
      if (message.includes('barcode')) return new AppError('Já existe um produto com este código de barras.', e.code);
      if (message.includes('code')) return new AppError('Já existe um produto com este código interno.', e.code);
      return new AppError('Registro duplicado.', e.code);
    case '23503':
      return new AppError('Este registro está vinculado a outros dados e não pode ser removido.', e.code);
    case '23514':
      return new AppError('Algum valor informado é inválido. Revise os campos.', e.code);
    case 'PGRST301':
    case '28000':
      return new AppError('Sua sessão expirou. Entre novamente.', e.code);
  }
  return new AppError(message, e.code, e.hint);
}

export function errorMessage(error: unknown): string {
  return toAppError(error).message;
}
