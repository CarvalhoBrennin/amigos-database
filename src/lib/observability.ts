interface ErrorContext {
    scope: string;
    metadata?: Record<string, unknown>;
}

declare global {
    interface Window {
        Sentry?: {
            captureException: (error: unknown, context?: Record<string, unknown>) => void;
        };
    }
}

export function reportError(error: unknown, context: ErrorContext) {
    if (import.meta.env.DEV) {
        console.error(`[${context.scope}]`, error, context.metadata ?? {});
    }

    if (typeof window !== 'undefined' && window.Sentry?.captureException) {
        window.Sentry.captureException(error, {
            tags: { scope: context.scope },
            extra: context.metadata,
        });
    }
}