import { describe, expect, it, vi } from 'vitest';
import {
    YouTubeGameplayProvider,
    extractVideoInstallment,
    isRelevantToGame,
    parseGameIdentity,
    parseIsoDurationToSeconds,
    selectBestGameplayVideo,
    type YouTubeVideo,
} from './youtube-gameplay-provider.js';

const GAME_TITLE = 'It Takes Two';

function makeVideo(overrides: Partial<YouTubeVideo>): YouTubeVideo {
    return {
        id: overrides.id ?? 'id',
        title: overrides.title ?? 'It Takes Two Gameplay',
        channelTitle: overrides.channelTitle ?? 'Channel',
        durationSeconds: overrides.durationSeconds ?? 600,
        viewCount: overrides.viewCount ?? 1_000,
        commentCount: overrides.commentCount ?? 10,
        noCommentary: overrides.noCommentary ?? false,
    };
}

describe('YouTubeGameplayProvider', () => {
    it('returns a safe empty response without a server key', async () => {
        const fetchFn = vi.fn<typeof fetch>();
        const provider = new YouTubeGameplayProvider(null, 720, 72, fetchFn);

        await expect(provider.getGameplay('1', GAME_TITLE)).resolves.toEqual({
            video: null,
            source: 'YOUTUBE',
            cached: false,
        });
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('selects a video and serves subsequent requests from its cache', async () => {
        const fetchFn = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(new Response(JSON.stringify({
                items: [{ id: { videoId: 'video-1' } }],
            }), { status: 200, headers: { 'content-type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                items: [{
                    id: 'video-1',
                    snippet: { title: 'It Takes Two Gameplay No Commentary', channelTitle: 'Channel' },
                    contentDetails: { duration: 'PT10M' },
                    statistics: { viewCount: '1200', commentCount: '3' },
                    status: { embeddable: true, privacyStatus: 'public' },
                }],
            }), { status: 200, headers: { 'content-type': 'application/json' } }));
        const provider = new YouTubeGameplayProvider('server-secret', 720, 72, fetchFn);

        const first = await provider.getGameplay('1', GAME_TITLE);
        const second = await provider.getGameplay('1', GAME_TITLE);

        expect(first).toEqual({
            video: {
                videoId: 'video-1',
                title: 'It Takes Two Gameplay No Commentary',
                durationSeconds: 600,
                viewCount: 1_200,
            },
            source: 'YOUTUBE',
            cached: false,
        });
        expect(second).toEqual({ ...first, cached: true });
        expect(JSON.stringify(first)).not.toContain('server-secret');
        expect(fetchFn).toHaveBeenCalledTimes(2);
    });
});

describe('parseIsoDurationToSeconds', () => {
    it.each([
        ['PT1H2M30S', 3_750],
        ['PT10M', 600],
        ['PT45S', 45],
        ['not-a-duration', 0],
    ])('parses %s', (value, expected) => {
        expect(parseIsoDurationToSeconds(value)).toBe(expected);
    });
});

describe('game title relevance', () => {
    it('matches direct titles while rejecting unrelated videos', () => {
        expect(isRelevantToGame('It Takes Two Full Gameplay No Commentary', GAME_TITLE)).toBe(true);
        expect(isRelevantToGame('Little Nightmares 2 Gameplay No Commentary', GAME_TITLE)).toBe(false);
        expect(isRelevantToGame("DON'T STARVE TOGETHER - co-op", "Don't Starve Together")).toBe(true);
    });

    it('distinguishes originals and sequels', () => {
        expect(isRelevantToGame('Spelunky 2 Co-op Gameplay', 'Spelunky 2')).toBe(true);
        expect(isRelevantToGame('Spelunky Gameplay', 'Spelunky 2')).toBe(false);
        expect(isRelevantToGame('Spelunky 2 Gameplay', 'Spelunky')).toBe(false);
        expect(isRelevantToGame('Borderlands 3 Gameplay', 'Borderlands 2')).toBe(false);
    });

    it('extracts game and video installment identities', () => {
        expect(parseGameIdentity('spelunky 2')).toEqual({ baseTitle: 'spelunky', installment: '2' });
        expect(parseGameIdentity('left 4 dead 2')).toEqual({ baseTitle: 'left 4 dead', installment: '2' });
        expect(parseGameIdentity('it takes two')).toEqual({ baseTitle: 'it takes two', installment: null });
        expect(extractVideoInstallment('spelunky 2 gameplay', 'spelunky')).toBe('2');
        expect(extractVideoInstallment('spelunky gameplay', 'spelunky')).toBeNull();
    });
});

describe('selectBestGameplayVideo', () => {
    it('returns null without a relevant video', () => {
        expect(selectBestGameplayVideo([], GAME_TITLE)).toBeNull();
        expect(selectBestGameplayVideo([
            makeVideo({ title: 'A Way Out Walkthrough' }),
        ], GAME_TITLE)).toBeNull();
    });

    it('discards popular off-topic videos', () => {
        expect(selectBestGameplayVideo([
            makeVideo({ id: 'off-topic', title: 'Little Nightmares 2 Gameplay', viewCount: 9_000_000 }),
            makeVideo({ id: 'on-topic', viewCount: 5_000 }),
        ], GAME_TITLE)?.id).toBe('on-topic');
    });

    it('prioritizes long no-commentary footage and then view count', () => {
        expect(selectBestGameplayVideo([
            makeVideo({ id: 'commentary', viewCount: 1_000_000 }),
            makeVideo({ id: 'no-commentary', viewCount: 50_000, noCommentary: true }),
        ], GAME_TITLE)?.id).toBe('no-commentary');
        expect(selectBestGameplayVideo([
            makeVideo({ id: 'short', viewCount: 5_000_000, durationSeconds: 30, noCommentary: true }),
            makeVideo({ id: 'full', viewCount: 100_000, durationSeconds: 600, noCommentary: true }),
        ], GAME_TITLE)?.id).toBe('full');
        expect(selectBestGameplayVideo([
            makeVideo({ id: 'low', viewCount: 10_000 }),
            makeVideo({ id: 'high', viewCount: 900_000 }),
        ], GAME_TITLE)?.id).toBe('high');
    });

    it('prefers the correct numbered installment', () => {
        expect(selectBestGameplayVideo([
            makeVideo({ id: 'original', title: 'Spelunky Gameplay No Commentary', viewCount: 2_000_000, noCommentary: true }),
            makeVideo({ id: 'sequel', title: 'Spelunky 2 Gameplay No Commentary', viewCount: 50_000, noCommentary: true }),
        ], 'Spelunky 2')?.id).toBe('sequel');
    });
});
