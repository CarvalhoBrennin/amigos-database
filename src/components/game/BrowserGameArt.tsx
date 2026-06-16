import { useMemo } from 'react';
import type { GameCategory } from '@/data/browserGames';
import { LazyImage } from '@/components/ui/loading/LazyImage';
import { getBrowserGameArtUrl } from '@/utils/browserGameArt';
import { cn } from '@/lib/cn';

interface BrowserGameArtProps {
    title: string;
    category: GameCategory;
    faviconUrl?: string;
    className?: string;
}

export function BrowserGameArt({ title, category, faviconUrl, className }: BrowserGameArtProps) {
    const artUrl = useMemo(() => getBrowserGameArtUrl(category, title), [category, title]);

    return (
        <div className={cn('relative h-full w-full overflow-hidden bg-stone-950', className)}>
            <img
                src={artUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover"
                decoding="async"
            />

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-stone-900/90 via-stone-900/10 to-stone-900/25" />

            {faviconUrl ? (
                <div
                    className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-stone-950/75 p-1.5 shadow-lg backdrop-blur-sm"
                    aria-hidden
                >
                    <LazyImage
                        src={faviconUrl}
                        alt=""
                        className="h-full w-full object-contain"
                        containerClassName="h-full w-full"
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                    />
                </div>
            ) : null}
        </div>
    );
}
