const DEFAULT_SITE_URL = 'https://amigos-database.vercel.app';

export function getSiteUrl(): string {
    const configured = import.meta.env.VITE_SITE_URL?.trim();
    if (configured) {
        return configured.replace(/\/$/, '');
    }

    if (typeof window !== 'undefined') {
        return window.location.origin;
    }

    return DEFAULT_SITE_URL;
}

export function buildCanonicalPath(pathname: string): string {
    const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    return `${getSiteUrl()}${normalizedPath}`;
}
