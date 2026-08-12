import { describe, expect, it } from 'vitest';
import { classifyMatch, compareMatches } from './match-classifier.js';

describe('match classifier', () => {
    it('classifies unanimous YES as PERFECT', () => {
        expect(classifyMatch(['YES', 'YES', 'YES'], 3, 80)).toMatchObject({ kind: 'PERFECT', yesCount: 3, maybeCount: 0 });
    });

    it.each([
        [['YES', 'YES', 'MAYBE']],
        [['YES', 'MAYBE', 'MAYBE']],
    ] as const)('classifies %j as STRONG', (votes) => {
        expect(classifyMatch([...votes], 3, 80)?.kind).toBe('STRONG');
    });

    it('does not match unanimous MAYBE', () => {
        expect(classifyMatch(['MAYBE', 'MAYBE', 'MAYBE'], 3, 80)).toBeNull();
    });

    it('does not match any vote set containing NO', () => {
        expect(classifyMatch(['YES', 'NO', 'YES'], 3, 80)).toBeNull();
    });

    it('does not classify before every frozen participant voted', () => {
        expect(classifyMatch(['YES', 'YES'], 3, 80)).toBeNull();
    });

    it('keeps the weighted match score in 0..100', () => {
        expect(classifyMatch(['YES'], 1, 500)?.matchScore).toBe(100);
        expect(classifyMatch(['YES', 'MAYBE'], 2, -20)?.matchScore).toBeGreaterThanOrEqual(0);
    });

    it('sorts PERFECT before a higher-scoring STRONG match', () => {
        const matches = [
            { gameId: 'strong', kind: 'STRONG' as const, matchScore: 99, baseScore: 99 },
            { gameId: 'perfect', kind: 'PERFECT' as const, matchScore: 70, baseScore: 70 },
        ].sort(compareMatches);
        expect(matches[0]?.kind).toBe('PERFECT');
    });

    it('uses game id as a stable tie-breaker for equal matches', () => {
        const matches = [
            { gameId: 'game-z', kind: 'STRONG' as const, matchScore: 80, baseScore: 70 },
            { gameId: 'game-a', kind: 'STRONG' as const, matchScore: 80, baseScore: 70 },
        ].sort(compareMatches);

        expect(matches.map((match) => match.gameId)).toEqual(['game-a', 'game-z']);
    });
});
