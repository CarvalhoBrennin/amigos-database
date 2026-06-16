import { useMemo } from 'react';

interface PaginatedCollectionResult<T> {
    items: T[];
    currentPage: number;
    totalPages: number;
    startRange: number;
    endRange: number;
}

export function usePaginatedCollection<T>(
    sourceItems: T[],
    currentPage: number,
    itemsPerPage: number
): PaginatedCollectionResult<T> {
    return useMemo(() => {
        if (sourceItems.length === 0 || itemsPerPage <= 0) {
            return {
                items: [],
                currentPage: 1,
                totalPages: 0,
                startRange: 0,
                endRange: 0,
            };
        }

        const totalPages = Math.ceil(sourceItems.length / itemsPerPage);
        const normalizedPage = Math.min(Math.max(currentPage, 1), totalPages);
        const startIndex = (normalizedPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, sourceItems.length);

        return {
            items: sourceItems.slice(startIndex, endIndex),
            currentPage: normalizedPage,
            totalPages,
            startRange: startIndex + 1,
            endRange: endIndex,
        };
    }, [currentPage, itemsPerPage, sourceItems]);
}
