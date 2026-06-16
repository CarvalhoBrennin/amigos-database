import { QueryClient } from '@tanstack/react-query';
import { CheapSharkError } from '@/services/cheapshark';

export function createAppQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 5 * 60 * 1000,
                gcTime: 15 * 60 * 1000,
                refetchOnWindowFocus: false,
                retry: (failureCount, error) => {
                    if (error instanceof CheapSharkError) {
                        if (
                            error.code === 'invalid_response' ||
                            error.code === 'aborted' ||
                            error.code === 'timeout' ||
                            (error.status !== null && error.status >= 400 && error.status < 500)
                        ) {
                            return false;
                        }
                    }

                    return failureCount < 2;
                },
                retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
            },
        },
    });
}
