import { describe, expect, it } from 'vitest';
import { isImageCached, markImageCached } from '@/utils/imageCache';

describe('imageCache', () => {
    it('tracks loaded urls', () => {
        expect(isImageCached('https://example.com/a.jpg')).toBe(false);
        markImageCached('https://example.com/a.jpg');
        expect(isImageCached('https://example.com/a.jpg')).toBe(true);
    });
});
