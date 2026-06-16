import { useTransition } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Frown } from 'lucide-react';
import { GameCard } from './GameCard';
import { useGames } from '@/hooks/useGames';
import { Button } from '@/components/ui/Button';
import { PaginationControls } from '@/components/ui/PaginationControls';
import { GridLoadingOverlay } from '@/components/ui/loading/GridLoadingOverlay';
import { useGameStore } from '@/store/gameStore';
import { useTranslation } from 'react-i18next';
import { useAnimations } from '@/components/animation-context';
import {
    catalogCardReveal,
    catalogGridExit,
    staggerContainerFast,
} from '@/lib/animations';
import { cn } from '@/lib/cn';

export function GameGrid() {
    const { t } = useTranslation();
    const { animationsEnabled } = useAnimations();
    const {
        games,
        filteredCount,
        currentPage,
        totalPages,
        startRange,
        endRange,
        isFilteringPending,
        gridRevisionKey,
    } = useGames();
    const { resetFilters, setCurrentPage } = useGameStore();
    const [isPagePending, startPageTransition] = useTransition();
    const isBusy = isFilteringPending || isPagePending;

    const handlePageChange = (page: number) => {
        startPageTransition(() => {
            setCurrentPage(page);
        });
        window.scrollTo({ top: 0, behavior: 'auto' });
    };

    const gridContent = (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {games.map((game) => (
                <GameCard key={game.id} game={game} />
            ))}
        </div>
    );

    return (
        <div>
            <div className="mb-6 flex items-center justify-between">
                <p className="text-sm text-stone-400">
                    <span className="font-bold inline-block text-amber-500">
                        {t('catalog.resultCount', {
                            range: filteredCount > 0 ? `${startRange}-${endRange}` : '0',
                            total: filteredCount,
                        })}
                    </span>
                </p>
            </div>

            {games.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="p-4 rounded-full bg-stone-800 mb-4">
                        <Frown className="h-12 w-12 text-stone-500" />
                    </div>
                    <h3 className="text-xl font-bold text-stone-300 mb-2">
                        {t('catalog.noneFound')}
                    </h3>
                    <p className="text-stone-500 mb-6 max-w-md">
                        {t('catalog.adjustFilters')}
                    </p>
                    <Button variant="secondary" onClick={resetFilters}>
                        {t('catalog.clearFilters')}
                    </Button>
                </div>
            ) : (
                <>
                    <div className="relative min-h-[12rem]">
                        <GridLoadingOverlay visible={isBusy} tone="amber" />

                        <motion.div
                            className={cn(isBusy && 'pointer-events-none')}
                            animate={{
                                opacity: isBusy ? 0.55 : 1,
                                filter: isBusy ? 'blur(6px) saturate(0.85)' : 'blur(0px) saturate(1)',
                            }}
                            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                        >
                            {animationsEnabled ? (
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.div
                                        key={gridRevisionKey}
                                        variants={catalogGridExit}
                                        initial="hidden"
                                        animate="visible"
                                        exit="exit"
                                    >
                                        <motion.div
                                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                                            variants={staggerContainerFast}
                                            initial="hidden"
                                            animate="visible"
                                        >
                                            {games.map((game) => (
                                                <motion.div key={game.id} variants={catalogCardReveal}>
                                                    <GameCard game={game} />
                                                </motion.div>
                                            ))}
                                        </motion.div>
                                    </motion.div>
                                </AnimatePresence>
                            ) : (
                                gridContent
                            )}
                        </motion.div>
                    </div>

                    <PaginationControls
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                    />
                </>
            )}
        </div>
    );
}
