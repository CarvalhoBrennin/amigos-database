let preloaded = false;

/** Prefetch de chunks de detalhe após idle. */
export function preloadDetailChunks(): void {
    if (preloaded) {
        return;
    }

    preloaded = true;
    void import('@/components/game/GameModal');
    void import('@/components/game/LuckyGameModal');
    void import('@/components/game/RadarChart');
    void import('@/components/game/YouTubePlayer');
}
