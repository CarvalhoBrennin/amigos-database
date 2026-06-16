const loadedImageUrls = new Set<string>();

export function isImageCached(url: string | undefined): boolean {
    return typeof url === 'string' && url.length > 0 && loadedImageUrls.has(url);
}

export function markImageCached(url: string | undefined): void {
    if (typeof url === 'string' && url.length > 0) {
        loadedImageUrls.add(url);
    }
}

/** URL em cache (sessão ou cache HTTP do browser). */
export function probeImageInBrowserCache(url: string): boolean {
    if (loadedImageUrls.has(url)) {
        return true;
    }

    if (typeof window === 'undefined') {
        return false;
    }

    const probe = new window.Image();
    probe.src = url;

    if (probe.complete && probe.naturalWidth > 0) {
        loadedImageUrls.add(url);
        return true;
    }

    return false;
}
