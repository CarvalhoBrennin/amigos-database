import { describe, expect, it } from 'vitest';
import {
    extractVideoInstallment,
    isRelevantToGame,
    parseGameIdentity,
    parseIsoDurationToSeconds,
    selectBestGameplayVideo,
    type YouTubeVideo,
} from '@/services/youtube';

const GAME_TITLE = 'It Takes Two';

function makeVideo(overrides: Partial<YouTubeVideo>): YouTubeVideo {
    return {
        id: overrides.id ?? 'id',
        title: overrides.title ?? 'It Takes Two Gameplay',
        channelTitle: overrides.channelTitle ?? 'Channel',
        durationSeconds: overrides.durationSeconds ?? 600,
        viewCount: overrides.viewCount ?? 1000,
        commentCount: overrides.commentCount ?? 10,
        noCommentary: overrides.noCommentary ?? false,
    };
}

describe('parseIsoDurationToSeconds', () => {
    it('parses hours, minutes and seconds', () => {
        expect(parseIsoDurationToSeconds('PT1H2M30S')).toBe(3750);
    });

    it('parses minutes-only durations', () => {
        expect(parseIsoDurationToSeconds('PT10M')).toBe(600);
    });

    it('parses seconds-only durations', () => {
        expect(parseIsoDurationToSeconds('PT45S')).toBe(45);
    });

    it('returns 0 for invalid input', () => {
        expect(parseIsoDurationToSeconds('not-a-duration')).toBe(0);
    });
});

describe('isRelevantToGame', () => {
    it('matches a direct title mention', () => {
        expect(isRelevantToGame('It Takes Two Full Gameplay No Commentary', 'It Takes Two')).toBe(true);
    });

    it('rejects unrelated popular videos', () => {
        expect(isRelevantToGame('Little Nightmares 2 Gameplay No Commentary', 'It Takes Two')).toBe(false);
    });

    it('ignores accents and punctuation', () => {
        expect(isRelevantToGame("DON'T STARVE TOGETHER - co-op", "Don't Starve Together")).toBe(true);
    });

    it('requires the sequel number for numbered titles (Spelunky 2)', () => {
        expect(isRelevantToGame('Spelunky 2 Co-op Gameplay No Commentary', 'Spelunky 2')).toBe(true);
        expect(isRelevantToGame('Spelunky Full Gameplay No Commentary', 'Spelunky 2')).toBe(false);
        expect(isRelevantToGame('Spelunky (2013) Gameplay', 'Spelunky 2')).toBe(false);
    });

    it('rejects sequel footage for the original game (Spelunky)', () => {
        expect(isRelevantToGame('Spelunky Gameplay No Commentary', 'Spelunky')).toBe(true);
        expect(isRelevantToGame('Spelunky 2 Gameplay No Commentary', 'Spelunky')).toBe(false);
    });

    it('distinguishes different installments in the same franchise', () => {
        expect(isRelevantToGame('Borderlands 2 Gameplay', 'Borderlands 2')).toBe(true);
        expect(isRelevantToGame('Borderlands 3 Gameplay', 'Borderlands 2')).toBe(false);
    });
});

describe('parseGameIdentity', () => {
    it('extracts trailing arabic sequel numbers', () => {
        expect(parseGameIdentity('spelunky 2')).toEqual({ baseTitle: 'spelunky', installment: '2' });
        expect(parseGameIdentity('left 4 dead 2')).toEqual({ baseTitle: 'left 4 dead', installment: '2' });
    });

    it('leaves non-sequel titles intact', () => {
        expect(parseGameIdentity('it takes two')).toEqual({ baseTitle: 'it takes two', installment: null });
    });
});

describe('extractVideoInstallment', () => {
    it('reads installment markers after the franchise name', () => {
        expect(extractVideoInstallment('spelunky 2 gameplay no commentary', 'spelunky')).toBe('2');
        expect(extractVideoInstallment('spelunky gameplay no commentary', 'spelunky')).toBeNull();
    });
});

describe('selectBestGameplayVideo', () => {
    it('returns null for an empty list', () => {
        expect(selectBestGameplayVideo([], GAME_TITLE)).toBeNull();
    });

    it('discards off-topic videos even if extremely popular', () => {
        const selected = selectBestGameplayVideo(
            [
                makeVideo({ id: 'off-topic', title: 'Little Nightmares 2 Gameplay', viewCount: 9_000_000 }),
                makeVideo({ id: 'on-topic', title: 'It Takes Two Gameplay', viewCount: 5_000 }),
            ],
            GAME_TITLE
        );

        expect(selected?.id).toBe('on-topic');
    });

    it('returns null when nothing matches the game', () => {
        const selected = selectBestGameplayVideo(
            [makeVideo({ id: 'off-topic', title: 'A Way Out Walkthrough', viewCount: 100_000 })],
            GAME_TITLE
        );

        expect(selected).toBeNull();
    });

    it('prioritizes no-commentary footage over more popular commentary footage', () => {
        const selected = selectBestGameplayVideo(
            [
                makeVideo({ id: 'commentary', viewCount: 1_000_000, noCommentary: false }),
                makeVideo({ id: 'no-commentary', viewCount: 50_000, noCommentary: true }),
            ],
            GAME_TITLE
        );

        expect(selected?.id).toBe('no-commentary');
    });

    it('falls back to the most viewed when no no-commentary clip exists', () => {
        const selected = selectBestGameplayVideo(
            [
                makeVideo({ id: 'low', viewCount: 10_000 }),
                makeVideo({ id: 'high', viewCount: 900_000 }),
            ],
            GAME_TITLE
        );

        expect(selected?.id).toBe('high');
    });

    it('skips clips that are too short (shorts/trailers)', () => {
        const selected = selectBestGameplayVideo(
            [
                makeVideo({ id: 'short', viewCount: 5_000_000, durationSeconds: 30 }),
                makeVideo({ id: 'full', viewCount: 100_000, durationSeconds: 600 }),
            ],
            GAME_TITLE
        );

        expect(selected?.id).toBe('full');
    });

    it('picks the most viewed no-commentary clip among several', () => {
        const selected = selectBestGameplayVideo(
            [
                makeVideo({ id: 'nc-low', viewCount: 20_000, noCommentary: true }),
                makeVideo({ id: 'nc-high', viewCount: 80_000, noCommentary: true }),
                makeVideo({ id: 'commentary', viewCount: 500_000, noCommentary: false }),
            ],
            GAME_TITLE
        );

        expect(selected?.id).toBe('nc-high');
    });

    it('prefers the correct sequel for numbered franchises', () => {
        const selected = selectBestGameplayVideo(
            [
                makeVideo({
                    id: 'spelunky-1',
                    title: 'Spelunky Full Gameplay No Commentary',
                    viewCount: 2_000_000,
                    noCommentary: true,
                }),
                makeVideo({
                    id: 'spelunky-2',
                    title: 'Spelunky 2 Co-op Gameplay No Commentary',
                    viewCount: 50_000,
                    noCommentary: true,
                }),
            ],
            'Spelunky 2'
        );

        expect(selected?.id).toBe('spelunky-2');
    });
});
