const STEAM_APP_ID_PATTERN = /\/apps\/(\d+)\//;
const STEAM_CDN_BASE = 'https://cdn.cloudflare.steamstatic.com/steam/apps';

export function extractSteamAppIdFromUrl(url?: string | null): string | null {
    if (!url) {
        return null;
    }

    const match = url.match(STEAM_APP_ID_PATTERN);
    return match?.[1] ?? null;
}

export function getSteamStoreUrl(imgUrl?: string): string | undefined {
    const appId = extractSteamAppIdFromUrl(imgUrl);
    return appId ? `https://store.steampowered.com/app/${appId}` : undefined;
}

/** library_hero para banners; fallback em getSteamHeaderImage. */
export function getHighQualitySteamImage(imgUrl?: string): string | undefined {
    const appId = extractSteamAppIdFromUrl(imgUrl);
    if (!appId) {
        return imgUrl ?? undefined;
    }

    return `${STEAM_CDN_BASE}/${appId}/library_hero.jpg`;
}

/** Header 460x215 — fallback seguro quando não há hero. */
export function getSteamHeaderImage(imgUrl?: string): string | undefined {
    const appId = extractSteamAppIdFromUrl(imgUrl);
    if (!appId) {
        return imgUrl ?? undefined;
    }

    return `${STEAM_CDN_BASE}/${appId}/header.jpg`;
}
