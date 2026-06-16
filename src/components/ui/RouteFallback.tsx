import { LoadingState } from '@/components/ui/loading/LoadingState';

interface RouteFallbackProps {
    variant?: 'fullscreen' | 'content';
}

export function RouteFallback({ variant = 'fullscreen' }: RouteFallbackProps) {
    if (variant === 'content') {
        return <LoadingState layout="centered" size="lg" className="min-h-[60vh]" />;
    }

    return <LoadingState layout="fullscreen" size="lg" />;
}
