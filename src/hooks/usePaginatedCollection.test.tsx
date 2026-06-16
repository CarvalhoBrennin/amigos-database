import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePaginatedCollection } from '@/hooks/usePaginatedCollection';

describe('usePaginatedCollection', () => {
    it('returns paginated items with range metadata', () => {
        const { result } = renderHook(() => usePaginatedCollection([1, 2, 3, 4, 5], 2, 2));

        expect(result.current).toEqual({
            items: [3, 4],
            currentPage: 2,
            totalPages: 3,
            startRange: 3,
            endRange: 4,
        });
    });

    it('returns an empty state for empty collections', () => {
        const { result } = renderHook(() => usePaginatedCollection<string>([], 4, 20));

        expect(result.current).toEqual({
            items: [],
            currentPage: 1,
            totalPages: 0,
            startRange: 0,
            endRange: 0,
        });
    });
});