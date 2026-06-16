import { describe, expect, it } from 'vitest';
import { getBrowserGameArtUrl, getBrowserGameFavicon } from '@/utils/browserGameArt';

describe('browserGameArt', () => {
    it('builds sharp SVG art per category', () => {
        const art = getBrowserGameArtUrl('drawing', 'Gartic Phone');

        expect(art.startsWith('data:image/svg+xml,')).toBe(true);
        expect(decodeURIComponent(art)).toContain('Gartic Phone');
    });

    it('builds favicon URL from page origin', () => {
        expect(getBrowserGameFavicon('https://garticphone.com/play')).toContain(
            'https://t1.gstatic.com/faviconV2'
        );
        expect(getBrowserGameFavicon('https://garticphone.com/play')).toContain(
            encodeURIComponent('https://garticphone.com')
        );
    });

    it('returns empty favicon URL for invalid input', () => {
        expect(getBrowserGameFavicon('not-a-url')).toBe('');
    });
});
