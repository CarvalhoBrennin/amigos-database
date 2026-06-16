import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/Skeleton';
import { LoadingState } from '@/components/ui/loading/LoadingState';
import { cn } from '@/lib/cn';

interface MediaFrameSkeletonProps {
    className?: string;
    showSpinner?: boolean;
}

export function MediaFrameSkeleton({ className, showSpinner = true }: MediaFrameSkeletonProps) {
    const { t } = useTranslation();

    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-xl border border-stone-800 bg-stone-900/80',
                className
            )}
            role="status"
            aria-live="polite"
            aria-label={t('common.loading')}
        >
            <Skeleton variant="rectangular" className="absolute inset-0 h-full w-full" />
            {showSpinner ? (
                <div className="relative z-10 flex h-full min-h-[inherit] items-center justify-center">
                    <LoadingState layout="inline" size="md" showLabel={false} />
                </div>
            ) : null}
        </div>
    );
}
