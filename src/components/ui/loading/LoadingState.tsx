import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner, type LoadingSpinnerSize } from '@/components/ui/loading/LoadingSpinner';
import { cn } from '@/lib/cn';

type LoadingStateLayout = 'inline' | 'centered' | 'overlay' | 'fullscreen';

interface LoadingStateProps {
    label?: string;
    showLabel?: boolean;
    size?: LoadingSpinnerSize;
    layout?: LoadingStateLayout;
    tone?: 'amber' | 'blue' | 'neutral';
    className?: string;
    children?: ReactNode;
}

export function LoadingState({
    label,
    showLabel = true,
    size = 'md',
    layout = 'centered',
    tone = 'amber',
    className,
    children,
}: LoadingStateProps) {
    const { t } = useTranslation();
    const resolvedLabel = label ?? t('common.loading');

    const layoutClasses: Record<LoadingStateLayout, string> = {
        inline: 'inline-flex items-center gap-2',
        centered: 'flex flex-col items-center justify-center gap-3 py-8',
        overlay: 'absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-stone-950/60 backdrop-blur-[1px]',
        fullscreen: 'min-h-screen flex flex-col items-center justify-center gap-3 bg-stone-950/70 backdrop-blur-sm',
    };

    return (
        <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className={cn('loading-motion', layoutClasses[layout], className)}
        >
            <LoadingSpinner size={size} tone={tone} />
            {showLabel ? (
                <span className="text-sm tracking-wide text-stone-400">{resolvedLabel}</span>
            ) : null}
            {children}
        </div>
    );
}
