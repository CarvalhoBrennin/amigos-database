import { type CSSProperties } from 'react';
import { useAnimations } from '@/components/animation-context';
import { cn } from '@/lib/cn';

export const WALLPAPER_FRAMES = [
    '/wallpaper/frame-1.png',
    '/wallpaper/frame-2.png',
    '/wallpaper/frame-3.png',
    '/wallpaper/frame-4.png',
] as const;

/** Ciclo do wallpaper: ~12s por frame, ~2.4s de crossfade. */
export const WALLPAPER_CYCLE_SECONDS = 48;

const overlayClasses = {
    light: 'bg-stone-950/35',
    medium: 'bg-stone-950/55',
    strong: 'bg-stone-950/72',
} as const;

interface WallpaperBackgroundProps {
    overlay?: keyof typeof overlayClasses;
    className?: string;
}

export function WallpaperBackground({ overlay = 'medium', className }: WallpaperBackgroundProps) {
    const { animationsEnabled } = useAnimations();
    const frameDuration = WALLPAPER_CYCLE_SECONDS / WALLPAPER_FRAMES.length;

    return (
        <div
            aria-hidden="true"
            className={cn(
                'wallpaper-background wallpaper-motion pointer-events-none fixed inset-0 -z-10 overflow-hidden',
                className
            )}
            style={{ '--wallpaper-cycle': `${WALLPAPER_CYCLE_SECONDS}s` } as CSSProperties}
        >
            <div className="wallpaper-background__slides absolute inset-0">
                {/* frame base fixo */}
                <img
                    src={WALLPAPER_FRAMES[0]}
                    alt=""
                    className="wallpaper-background__image wallpaper-background__image--base"
                    loading="eager"
                    decoding="async"
                />

                {animationsEnabled
                    ? WALLPAPER_FRAMES.map((src, index) => (
                          <img
                              key={src}
                              src={src}
                              alt=""
                              className="wallpaper-background__image wallpaper-background__image--animated"
                              style={{ animationDelay: `${frameDuration * index}s` }}
                              loading={index === 0 ? 'eager' : 'lazy'}
                              decoding="async"
                          />
                      ))
                    : null}
            </div>

            <div
                className={cn(
                    'wallpaper-background__overlay absolute inset-0',
                    overlayClasses[overlay]
                )}
            />
        </div>
    );
}
