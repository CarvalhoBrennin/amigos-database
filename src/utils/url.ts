import { browserGames } from '@/data/browserGames';

const SAFE_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

export const TRUSTED_EXTERNAL_HOST_GROUPS = {
    steam: ['store.steampowered.com'] as const,
    youtube: ['www.youtube.com', 'youtube.com', 'youtu.be'] as const,
    github: ['github.com', 'www.github.com'] as const,
} as const;

export const BROWSER_GAME_ALLOWED_HOSTS = [
    ...new Set(
        browserGames.map((game) => {
            try {
                return new URL(game.url).hostname;
            } catch {
                return null;
            }
        }).filter((hostname): hostname is string => Boolean(hostname))
    ),
] as const;

interface SafeUrlOptions {
    allowedHosts?: readonly string[];
}

function isAllowedHost(hostname: string, allowedHosts?: readonly string[]) {
    if (!allowedHosts || allowedHosts.length === 0) {
        return true;
    }

    return allowedHosts.some((allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`));
}

export function toSafeExternalUrl(url: string | null | undefined, options: SafeUrlOptions = {}): string | null {
    if (!url || !url.trim()) {
        return null;
    }

    try {
        const parsed = new URL(url);
        if (!SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
            return null;
        }

        if (!isAllowedHost(parsed.hostname, options.allowedHosts)) {
            return null;
        }

        return parsed.toString();
    } catch {
        return null;
    }
}

export function toSafeTrustedExternalUrl(
    url: string | null | undefined,
    trustedGroup: keyof typeof TRUSTED_EXTERNAL_HOST_GROUPS
): string | null {
    return toSafeExternalUrl(url, {
        allowedHosts: TRUSTED_EXTERNAL_HOST_GROUPS[trustedGroup],
    });
}

export function openExternalLink(url: string, options: SafeUrlOptions = {}): boolean {
    const safeUrl = toSafeExternalUrl(url, options);
    if (!safeUrl) {
        return false;
    }

    window.open(safeUrl, '_blank', 'noopener,noreferrer');
    return true;
}

export function openBrowserGameLink(url: string): boolean {
    return openExternalLink(url, { allowedHosts: BROWSER_GAME_ALLOWED_HOSTS });
}
