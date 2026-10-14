import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        const code = (error as { code?: string } | null)?.code;
        if (code === '42501' || code === '28000' || code === 'PGRST301') return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});
