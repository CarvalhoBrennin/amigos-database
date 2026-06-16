import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '@/i18n';
import { reportError } from '@/lib/observability';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    errorId: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState = {
        hasError: false,
        errorId: null,
    };

    public static getDerivedStateFromError(): Pick<ErrorBoundaryState, 'hasError'> {
        return { hasError: true };
    }

    public componentDidCatch(error: Error, info: ErrorInfo): void {
        const errorId = crypto.randomUUID?.() ?? String(Date.now());
        this.setState({ errorId });

        reportError(error, {
            scope: 'error-boundary',
            metadata: {
                componentStack: info.componentStack,
                errorId,
            },
        });
    }

    private handleReset = () => {
        this.setState({ hasError: false, errorId: null });
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-6">
                    <div className="max-w-lg text-center space-y-4">
                        <h1 className="text-3xl font-bold text-amber-500">{i18n.t('common.unexpectedErrorTitle')}</h1>
                        <p className="text-stone-300">
                            {i18n.t('common.unexpectedErrorDescription')}
                        </p>
                        {this.state.errorId ? (
                            <p className="text-xs text-stone-500">{i18n.t('common.errorId', { id: this.state.errorId })}</p>
                        ) : null}
                        <div className="flex flex-wrap items-center justify-center gap-3">
                            <button
                                type="button"
                                onClick={this.handleReset}
                                className="inline-flex items-center justify-center rounded-lg bg-stone-800 px-4 py-2 text-stone-100 font-semibold hover:bg-stone-700 transition-colors"
                            >
                                {i18n.t('common.tryAgain')}
                            </button>
                            <button
                                type="button"
                                onClick={() => window.location.reload()}
                                className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-stone-950 font-semibold hover:bg-amber-400 transition-colors"
                            >
                                {i18n.t('common.reload')}
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
