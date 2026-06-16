import { useCallback, useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { isImageCached, markImageCached } from '@/utils/imageCache';

interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onLoad' | 'onError' | 'src'> {
    src?: string;
    fallbackSrc?: string | Array<string | undefined | null>;
    containerClassName?: string;
    skeletonClassName?: string;
    onLoadComplete?: () => void;
    onImageError?: () => void;
}

function buildCandidates(
    src: string | undefined,
    fallbackSrc: LazyImageProps['fallbackSrc']
): string[] {
    const fallbacks = Array.isArray(fallbackSrc) ? fallbackSrc : [fallbackSrc];
    const ordered = [src, ...fallbacks].filter(
        (value): value is string => typeof value === 'string' && value.length > 0
    );

    return Array.from(new Set(ordered));
}

export function LazyImage({
    src,
    alt,
    className,
    containerClassName,
    skeletonClassName,
    fallbackSrc,
    onLoadComplete,
    onImageError,
    ...imgProps
}: LazyImageProps) {
    const candidates = useMemo(() => buildCandidates(src, fallbackSrc), [src, fallbackSrc]);
    const candidatesKey = candidates.join('|');

    const [activeIndex, setActiveIndex] = useState(0);
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasFailed, setHasFailed] = useState(false);
    const preloadRef = useRef<HTMLImageElement | null>(null);

    const currentSrc = candidates[activeIndex];

    const tryNextCandidate = useCallback(
        (failedIndex: number) => {
            if (failedIndex < candidates.length - 1) {
                setActiveIndex(failedIndex + 1);
                setIsLoaded(false);
                setHasFailed(false);
                return;
            }

            setHasFailed(true);
            onImageError?.();
        },
        [candidates.length, onImageError]
    );

    useEffect(() => {
        setActiveIndex(0);
        setHasFailed(false);
        setIsLoaded(false);
    }, [candidatesKey]);

    useEffect(() => {
        if (!currentSrc || hasFailed) {
            return;
        }

        if (isImageCached(currentSrc)) {
            setIsLoaded(true);
            onLoadComplete?.();
            return;
        }

        setIsLoaded(false);

        const preloader = new window.Image();
        preloadRef.current = preloader;

        preloader.onload = () => {
            if (preloadRef.current !== preloader) {
                return;
            }
            markImageCached(currentSrc);
            setIsLoaded(true);
            onLoadComplete?.();
        };

        preloader.onerror = () => {
            if (preloadRef.current !== preloader) {
                return;
            }
            tryNextCandidate(activeIndex);
        };

        preloader.src = currentSrc;

        return () => {
            preloader.onload = null;
            preloader.onerror = null;
            if (preloadRef.current === preloader) {
                preloadRef.current = null;
            }
        };
    }, [activeIndex, currentSrc, hasFailed, onLoadComplete, tryNextCandidate]);

    return (
        <div className={cn('relative overflow-hidden', containerClassName)}>
            {!isLoaded && !hasFailed && currentSrc ? (
                <Skeleton
                    variant="rectangular"
                    className={cn('absolute inset-0 size-full', skeletonClassName)}
                />
            ) : null}

            {hasFailed || !currentSrc ? (
                <div
                    role="img"
                    aria-label={alt}
                    className={cn(
                        'flex size-full items-center justify-center bg-stone-900 text-stone-600',
                        className
                    )}
                >
                    <ImageOff className="h-8 w-8" aria-hidden="true" />
                </div>
            ) : isLoaded ? (
                <img
                    {...imgProps}
                    src={currentSrc}
                    alt={alt}
                    className={cn('relative z-[1] size-full object-cover', className)}
                />
            ) : null}
        </div>
    );
}
