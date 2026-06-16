import { describe, expect, it } from 'vitest';
import { parseRouteGameId } from '@/utils/gameId';

describe('parseRouteGameId', () => {
    it('accepts valid numeric ids', () => {
        expect(parseRouteGameId('1')).toBe(1);
        expect(parseRouteGameId('42')).toBe(42);
        expect(parseRouteGameId(7)).toBe(7);
    });

    it('rejects malformed route ids', () => {
        expect(parseRouteGameId('123abc')).toBeNull();
        expect(parseRouteGameId('12.34')).toBeNull();
        expect(parseRouteGameId('')).toBeNull();
        expect(parseRouteGameId('-1')).toBeNull();
        expect(parseRouteGameId(null)).toBeNull();
    });

    it('trims surrounding whitespace before validating', () => {
        expect(parseRouteGameId(' 12 ')).toBe(12);
    });
});
