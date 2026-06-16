interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circular' | 'rectangular' | 'card';
    shimmer?: boolean;
}

const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
    card: 'rounded-xl h-64',
} as const;

export function Skeleton({ className = '', variant = 'rectangular', shimmer = true }: SkeletonProps) {
    const baseClasses = shimmer
        ? 'skeleton-shimmer loading-motion'
        : 'bg-stone-800 animate-pulse loading-motion';

    return (
        <div
            aria-hidden="true"
            className={`${baseClasses} ${variantClasses[variant]} ${className}`}
        />
    );
}
