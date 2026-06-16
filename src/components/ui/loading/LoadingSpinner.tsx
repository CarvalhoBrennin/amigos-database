import { cn } from '@/lib/cn';

export type LoadingSpinnerSize = 'sm' | 'md' | 'lg';

const sizeClasses: Record<LoadingSpinnerSize, string> = {
    sm: 'h-4 w-4 border',
    md: 'h-8 w-8 border-2',
    lg: 'h-10 w-10 border-2',
};

interface LoadingSpinnerProps {
    size?: LoadingSpinnerSize;
    className?: string;
    tone?: 'amber' | 'blue' | 'neutral';
}

const toneClasses = {
    amber: 'border-amber-500 border-t-transparent',
    blue: 'border-blue-500 border-t-transparent',
    neutral: 'border-stone-400 border-t-transparent',
};

export function LoadingSpinner({ size = 'md', className, tone = 'amber' }: LoadingSpinnerProps) {
    return (
        <span
            className={cn(
                'loading-motion loading-spinner-ring inline-block rounded-full',
                sizeClasses[size],
                toneClasses[tone],
                className
            )}
            aria-hidden="true"
        />
    );
}
