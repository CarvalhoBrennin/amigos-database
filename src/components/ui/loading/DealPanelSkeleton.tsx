import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

interface DealPanelSkeletonProps {
    compact?: boolean;
}

export function DealPanelSkeleton({ compact = false }: DealPanelSkeletonProps) {
    return (
        <div
            className={cn(
                compact
                    ? 'p-4 rounded-xl bg-stone-900/70 border border-stone-800'
                    : 'glass-panel p-6',
                'space-y-4'
            )}
            aria-hidden="true"
        >
            <div className="flex items-center gap-2">
                <Skeleton variant="circular" className="h-5 w-5" />
                <Skeleton variant="text" className="h-5 w-44" />
            </div>
            <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton variant="text" className="h-8 w-32" />
                        <Skeleton variant="text" className="h-3 w-48 max-w-full" />
                    </div>
                    <Skeleton variant="text" className="h-6 w-14" />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <Skeleton variant="rectangular" className="h-14 rounded-lg" />
                <Skeleton variant="rectangular" className="h-14 rounded-lg" />
            </div>
        </div>
    );
}
