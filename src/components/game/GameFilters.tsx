import { startTransition, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowUpDown, Users, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useGameStore } from '@/store/gameStore';
import { gameTypeFilters } from '@/data/games';
import type { SortOption } from '@/types/game';
import { debounce } from '@/utils/helpers';
import { LoadingSpinner } from '@/components/ui/loading/LoadingSpinner';

const playerOptions = [1, 2, 3, 4, 6, 8];

const filterVariants = {
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0 },
};

export function GameFilters() {
    const { t } = useTranslation();
    const filter = useGameStore((state) => state.filter);
    const search = useGameStore((state) => state.search);
    const sort = useGameStore((state) => state.sort);
    const playerMin = useGameStore((state) => state.playerMin);
    const setFilter = useGameStore((state) => state.setFilter);
    const setSearch = useGameStore((state) => state.setSearch);
    const setSort = useGameStore((state) => state.setSort);
    const setPlayerMin = useGameStore((state) => state.setPlayerMin);
    const [localSearch, setLocalSearch] = useState('');
    const isSearchPending = localSearch.trim() !== search.trim();

    const debouncedSetSearch = useMemo(
        () => debounce((value: string) => setSearch(value), 300),
        [setSearch]
    );

    useEffect(() => {
        setLocalSearch(search);
    }, [search]);

    useEffect(() => {
        debouncedSetSearch(localSearch);
    }, [debouncedSetSearch, localSearch]);

    const sortOptions: { value: SortOption; label: string }[] = [
        { value: 'rating', label: t('filters.sortRating') },
        { value: 'title', label: t('filters.sortTitle') },
        { value: 'year', label: t('filters.sortYear') },
        { value: 'players', label: t('filters.sortPlayers') },
    ];

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalSearch(e.target.value);
    };

    const handleSearchBlur = () => {
        setSearch(localSearch.trim());
    };

    const handleClearSearch = () => {
        setLocalSearch('');
        setSearch('');
    };

    return (
        <motion.div
            className="space-y-6 mb-8"
            initial="hidden"
            animate="visible"
            variants={filterVariants}
            transition={{ duration: 0.5 }}
        >
            <div className="relative max-w-md">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <Search className="h-4 w-4 text-stone-500" aria-hidden="true" />
                </div>
                <input
                    type="text"
                    placeholder={t('filters.searchPlaceholder')}
                    aria-label={t('filters.searchPlaceholder')}
                    value={localSearch}
                    onChange={handleSearchChange}
                    onBlur={handleSearchBlur}
                    className="w-full pl-10 pr-10 py-2.5 bg-stone-900 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                />
                {isSearchPending ? (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
                        <LoadingSpinner size="sm" tone="amber" />
                    </div>
                ) : null}
                {localSearch && !isSearchPending ? (
                    <button
                        type="button"
                        onClick={handleClearSearch}
                        aria-label={t('filters.clearSearch')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-stone-700 text-stone-400 hover:text-stone-200"
                    >
                        <X className="h-4 w-4" />
                    </button>
                ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
                {gameTypeFilters.map((type) => {
                    const isActive = filter === type;
                    return (
                        <div key={type}>
                            <Button
                                variant={isActive ? 'primary' : 'secondary'}
                                size="sm"
                                onClick={() => startTransition(() => setFilter(type))}
                                className={isActive ? 'shadow-lg shadow-amber-500/25' : ''}
                            >
                                {t(`gameTypes.${type}`)}
                            </Button>
                        </div>
                    );
                })}
            </div>

            <motion.div
                className="flex flex-wrap items-center gap-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.3 }}
            >
                <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4 text-stone-500" aria-hidden="true" />
                    <select
                        aria-label={t('filters.sortBy')}
                        value={sort}
                        onChange={(e) => startTransition(() => setSort(e.target.value as SortOption))}
                        className="bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 hover:border-amber-500/30"
                    >
                        {sortOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-stone-500" aria-hidden="true" />
                    <select
                        aria-label={t('filters.minimumPlayers')}
                        value={playerMin}
                        onChange={(e) => startTransition(() => setPlayerMin(Number(e.target.value)))}
                        className="bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 hover:border-amber-500/30"
                    >
                        {playerOptions.map((num) => (
                            <option key={num} value={num}>
                                {t('filters.playersFilter', { count: num })}
                            </option>
                        ))}
                    </select>
                </div>
            </motion.div>
        </motion.div>
    );
}
