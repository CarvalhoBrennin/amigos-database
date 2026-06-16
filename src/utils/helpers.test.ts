import { describe, expect, it } from 'vitest';
import type { Game } from '@/types/game';
import {
    applyFilters,
    formatPlayers,
    getInitialsPlaceholder,
    getPlaceholderImage,
    getSteamStoreUrl,
    getYoutubeSearchUrl,
    sortGames,
} from '@/utils/helpers';

const sampleGames: Game[] = [
    {
        id: 1,
        title: 'Alpha Squad',
        type: 'party',
        players: [2, 4],
        diff: 'Fácil',
        rating: 7.5,
        year: 2020,
        catalogPrice: '$19.99',
        price: '$19.99',
        session: '30min',
        desc: 'desc',
        mechanic: 'mech',
        verdict: 'good',
        tags: ['party', 'casual'],
        stats: [4, 5, 8, 3, 2],
        imgQ: 'party game',
    },
    {
        id: 2,
        title: 'Bravo Strategy',
        type: 'puzzle',
        players: [1, 2],
        diff: 'Difícil',
        rating: 9.1,
        year: 2023,
        catalogPrice: '$29.99',
        price: '$29.99',
        session: '60min',
        desc: 'desc',
        mechanic: 'mech',
        verdict: 'great',
        tags: ['strategy', 'coop'],
        stats: [7, 8, 3, 9, 6],
        imgQ: 'strategy game',
    },
];

describe('helpers', () => {
    it('formats player ranges', () => {
        expect(formatPlayers([1, 1])).toBe('1 jogador');
        expect(formatPlayers([2, 4])).toBe('2-4 jogadores');
    });

    it('sorts by rating descending', () => {
        const sorted = sortGames(sampleGames, 'rating');
        expect(sorted[0]?.title).toBe('Bravo Strategy');
    });

    it('applies filter/search/sort together', () => {
        const filtered = applyFilters(sampleGames, 'puzzle', 'bravo', 'rating', 1);
        expect(filtered).toHaveLength(1);
        expect(filtered[0]?.id).toBe(2);
    });

    it('extracts valid steam URL from image path', () => {
        expect(getSteamStoreUrl('https://cdn.cloudflare.steamstatic.com/steam/apps/12345/header.jpg')).toBe(
            'https://store.steampowered.com/app/12345'
        );
        expect(getSteamStoreUrl('https://example.com/image.jpg')).toBeUndefined();
    });

    it('creates youtube search URL with query params', () => {
        const url = getYoutubeSearchUrl('Lethal Company');
        expect(url).toContain('youtube.com/results');
        expect(url).toContain('search_query=');
    });

    it('builds a local inline-SVG placeholder (no external service)', () => {
        const placeholder = getPlaceholderImage('space dwarves');
        expect(placeholder.startsWith('data:image/svg+xml,')).toBe(true);
        expect(placeholder).not.toContain('placehold.co');
        const decoded = decodeURIComponent(placeholder);
        expect(decoded).toContain('space dwarves');
    });

    it('escapes XML-sensitive characters in placeholders', () => {
        const decoded = decodeURIComponent(getPlaceholderImage('Tom & Jerry <co-op>'));
        expect(decoded).toContain('&amp;');
        expect(decoded).toContain('&lt;');
        expect(decoded).not.toContain('<co-op>');
    });

    it('builds a local initials avatar from a title', () => {
        const avatar = getInitialsPlaceholder('Little Big Planet');
        expect(avatar.startsWith('data:image/svg+xml,')).toBe(true);
        expect(decodeURIComponent(avatar)).toContain('>LB<');
    });

    it('filters games by minimum supported players', () => {
        const filtered = applyFilters(sampleGames, 'all', '', 'rating', 5);
        expect(filtered).toHaveLength(0);

        const inRange = applyFilters(sampleGames, 'all', '', 'rating', 4);
        expect(inRange).toHaveLength(1);

        const partyGame = { ...sampleGames[0], players: [2, 8] as [number, number] };
        const filteredParty = applyFilters([partyGame], 'all', '', 'rating', 4);
        expect(filteredParty).toHaveLength(1);
    });
});
