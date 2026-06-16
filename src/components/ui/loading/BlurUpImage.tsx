import { useCallback, useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { isImageCached, markImageCached } from '@/utils/imageCache';

interface BlurUpImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onLoad' | 'onError' | 'src'> {
    src?: string;
    placeholderSrc?: string;
    fallbackSrc?: string | Array<string | undefined | null>;
    containerClassName?: string;
    skeletonClassName?: string;
}

function buildCandidates(
    src: string | undefined,
    fallbackSrc: BlurUpImageProps['fallbackSrc']
): string[] {
    const fallbacks = Array.isArray(fallbackSrc) ? fallbackSrc : [fallbackSrc];
    const ordered = [src, ...fallbacks].filter(
        (value): value is string => typeof value === 'string' && value.length > 0
    );

    return Array.from(new Set(ordered));
}

export function BlurUpImage({
    src,
    placeholderSrc,
    alt,
    className,
    containerClassName,
    skeletonClassName,
    fallbackSrc,
    ...imgProps
}: BlurUpImageProps) {
    const candidates = useMemo(() => buildCandidates(src, fallbackSrc), [src, fallbackSrc]);
    const candidatesKey = candidates.join('|');

    const [activeIndex, setActiveIndex] = useState(0);
    const [isPrimaryReady, setIsPrimaryReady] = useState(false);
    const [hasFailed, setHasFailed] = useState(false);
    const preloadRef = useRef<HTMLImageElement | null>(null);

    const resolvedSrc = candidates[activeIndex];
    const showSkeleton = !placeholderSrc && !isPrimaryReady && !hasFailed && Boolean(resolvedSrc);

    const tryNextCandidate = useCallback(
        (failedIndex: number) => {
            if (failedIndex < candidates.length - 1) {
                setActiveIndex(failedIndex + 1);
                setIsPrimaryReady(false);
                setHasFailed(false);
                return;
            }

            setHasFailed(true);
        },
        [candidates.length]
    );

    useEffect(() => {
        setActiveIndex(0);
        setHasFailed(false);
        setIsPrimaryReady(false);

        const targetSrc = candidatesKey.split('|').filter(Boolean)[0];
        if (!targetSrc) {
            return;
        }

        if (isImageCached(targetSrc)) {
            setIsPrimaryReady(true);
            return;
        }

        const preloader = new window.Image();
        preloadRef.current = preloader;

        preloader.onload = () => {
            if (preloadRef.current !== preloader) {
                return;
            }
            markImageCached(targetSrc);
            setIsPrimaryReady(true);
        };

        preloader.onerror = () => {
            if (preloadRef.current !== preloader) {
                return;
            }
            tryNextCandidate(0);
        };

        preloader.src = targetSrc;

        return () => {
            preloader.onload = null;
            preloader.onerror = null;
            if (preloadRef.current === preloader) {
                preloadRef.current = null;
            }
        };
    }, [candidatesKey, tryNextCandidate]);

    useEffect(() => {
        if (activeIndex === 0 || isPrimaryReady || hasFailed) {
            return;
        }

        const targetSrc = candidatesKey.split('|').filter(Boolean)[activeIndex];
        if (!targetSrc) {
            setHasFailed(true);
            return;
        }

        if (isImageCached(targetSrc)) {
            setIsPrimaryReady(true);
            return;
        }

        const preloader = new window.Image();
        preloadRef.current = preloader;

        preloader.onload = () => {
            if (preloadRef.current !== preloader) {
                return;
            }
            markImageCached(targetSrc);
            setIsPrimaryReady(true);
        };

        preloader.onerror = () => {
            if (preloadRef.current !== preloader) {
                return;
            }
            tryNextCandidate(activeIndex);
        };

        preloader.src = targetSrc;

        return () => {
            preloader.onload = null;
            preloader.onerror = null;
            if (preloadRef.current === preloader) {
                preloadRef.current = null;
            }
        };
    }, [activeIndex, candidatesKey, hasFailed, isPrimaryReady, tryNextCandidate]);

    if (hasFailed || !resolvedSrc) {
        return (
            <div className={cn('relative size-full overflow-hidden', containerClassName)}>
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
            </div>
        );
    }

    return (
        <div className={cn('relative size-full overflow-hidden', containerClassName)}>
            {showSkeleton ? (
                <Skeleton
                    variant="rectangular"
                    className={cn('absolute inset-0 size-full', skeletonClassName)}
                />
            ) : null}

            {placeholderSrc ? (
                <img
                    src={placeholderSrc}
                    alt=""
                    aria-hidden
                    className={cn(
                        'absolute inset-0 size-full object-cover transition-opacity duration-500',
                        isPrimaryReady ? 'opacity-0' : 'scale-105 blur-sm opacity-100',
                        className
                    )}
                    decoding="async"
                    onLoad={() => markImageCached(placeholderSrc)}
                />
            ) : null}

            {isPrimaryReady ? (
                <img
                    {...imgProps}
                    src={resolvedSrc}
                    alt={alt}
                    className={cn(
                        'absolute inset-0 size-full object-cover transition-opacity duration-500 opacity-100',
                        className
                    )}
                />
            ) : null}
        </div>
    );
}
