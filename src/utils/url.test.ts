import { describe, expect, it, vi } from 'vitest';
import {
    BROWSER_GAME_ALLOWED_HOSTS,
    openBrowserGameLink,
    openExternalLink,
    toSafeExternalUrl,
    toSafeTrustedExternalUrl,
} from '@/utils/url';

describe('url utilities', () => {
    it('blocks unsafe protocols', () => {
        expect(toSafeExternalUrl('javascript:alert(1)')).toBeNull();
        expect(toSafeExternalUrl('data:text/html,hello')).toBeNull();
    });

    it('allows http and https URLs', () => {
        expect(toSafeExternalUrl('https://example.com/game')).toBe('https://example.com/game');
    });

    it('enforces host allowlists', () => {
        expect(
            toSafeExternalUrl('https://evil.example.com/phish', {
                allowedHosts: ['store.steampowered.com'],
            })
        ).toBeNull();

        expect(
            toSafeExternalUrl('https://store.steampowered.com/app/123', {
                allowedHosts: ['store.steampowered.com'],
            })
        ).toBe('https://store.steampowered.com/app/123');
    });

    it('supports trusted host groups', () => {
        expect(toSafeTrustedExternalUrl('https://youtu.be/abc123', 'youtube')).toBe('https://youtu.be/abc123');
        expect(toSafeTrustedExternalUrl('https://malicious.test/', 'youtube')).toBeNull();
    });

    it('opens only validated external links', () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

        expect(openExternalLink('https://example.com')).toBe(true);
        expect(openExternalLink('javascript:alert(1)')).toBe(false);
        expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('https://example.com'), '_blank', 'noopener,noreferrer');

        openSpy.mockRestore();
    });

    it('restricts browser game links to known hosts', () => {
        expect(BROWSER_GAME_ALLOWED_HOSTS.length).toBeGreaterThan(0);
        expect(openBrowserGameLink('https://unknown-host.test/')).toBe(false);
        expect(openBrowserGameLink(`https://${BROWSER_GAME_ALLOWED_HOSTS[0]}/`)).toBe(true);
    });
});
