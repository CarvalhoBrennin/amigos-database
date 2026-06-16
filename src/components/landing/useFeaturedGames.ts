import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getGamesForLanguage } from '@/data/games';
import type { Game } from '@/types/game';

export function selectFeaturedGames(games: Game[], limit = 6): Game[] {
    return [...games]
        .sort((a, b) => {
            const ratingDiff = b.rating - a.rating;
            if (ratingDiff !== 0) {
                return ratingDiff;
            }

            const titleDiff = a.title.localeCompare(b.title);
            if (titleDiff !== 0) {
                return titleDiff;
            }

            return a.id - b.id;
        })
        .slice(0, limit);
}

export function useFeaturedGames(limit = 6): Game[] {
    const { i18n } = useTranslation();
    const language = i18n.resolvedLanguage || i18n.language;

    return useMemo(() => {
        return selectFeaturedGames(getGamesForLanguage(language), limit);
    }, [language, limit]);
}
