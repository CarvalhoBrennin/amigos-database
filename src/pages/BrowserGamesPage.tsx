import { useDeferredValue, useMemo, useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Globe, Users, ExternalLink, Filter, Search, X, Frown, DollarSign, Sparkles } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { browserGames, browserCategories, type BrowserCategoryFilter } from '@/data/browserGames';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SEO } from '@/components/SEO';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { PaginationControls } from '@/components/ui/PaginationControls';
import { useBrowserGamesUrlState } from '@/hooks/useBrowserGamesUrlState';
import { usePaginatedCollection } from '@/hooks/usePaginatedCollection';
import { useAnimations } from '@/components/animation-context';
import {
    catalogCardReveal,
    catalogGridExit,
    fadeInUp,
    staggerContainer,
    staggerContainerFast,
    transitions,
} from '@/lib/animations';
import { openBrowserGameLink } from '@/utils/url';
import { BrowserGameArt } from '@/components/game/BrowserGameArt';
import { GridLoadingOverlay, LoadingSpinner } from '@/components/ui/loading';
import { LazyImage } from '@/components/ui/loading/LazyImage';
import { cn } from '@/lib/cn';

export function BrowserGamesPage() {
    const { t } = useTranslation();
    const { animationsEnabled } = useAnimations();
    const {
        selectedCategory,
        setSelectedCategory,
        searchTerm,
        setSearchTerm,
        currentPage,
        setCurrentPage,
        itemsPerPage,
    } = useBrowserGamesUrlState();
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const isSearchPending = searchTerm.trim() !== deferredSearchTerm.trim();
    const [isGridPending, startGridTransition] = useTransition();
    const showGridLoading = isSearchPending || isGridPending;

    const filteredGames = useMemo(() => {
        let result = browserGames;

        if (selectedCategory !== 'all') {
            result = result.filter((game) => game.category === selectedCategory);
        }

        if (deferredSearchTerm.trim()) {
            const term = deferredSearchTerm.toLowerCase();
            result = result.filter(
                (game) =>
                    game.title.toLowerCase().includes(term) ||
                    game.description.toLowerCase().includes(term)
            );
        }

        return result;
    }, [deferredSearchTerm, selectedCategory]);

    const paginatedGames = usePaginatedCollection(filteredGames, currentPage, itemsPerPage);
    const gridRevisionKey = `${selectedCategory}|${deferredSearchTerm.trim()}|${currentPage}`;

    const handleCategoryChange = (category: BrowserCategoryFilter) => {
        startGridTransition(() => {
            setSelectedCategory(category);
            setCurrentPage(1);
        });
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        startGridTransition(() => {
            setCurrentPage(1);
        });
    };

    const handleClearSearch = () => {
        setSearchTerm('');
        startGridTransition(() => {
            setCurrentPage(1);
        });
    };

    const handlePageChange = (page: number) => {
        startGridTransition(() => {
            setCurrentPage(page);
        });
        window.scrollTo({ top: 0, behavior: 'auto' });
    };

    const renderBrowserCard = (game: (typeof paginatedGames.items)[number]) => (
        <article
            className={cn(
                'group relative border rounded-2xl overflow-hidden transition-colors flex flex-col h-full',
                game.isFeatured
                    ? 'md:col-span-2 bg-stone-900 border-amber-400/40 hover:border-amber-300/70 shadow-lg shadow-amber-500/10'
                    : 'bg-stone-900 border-stone-800 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/10'
            )}
        >
            {game.isFeatured ? (
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_34%),linear-gradient(135deg,rgba(59,130,246,0.12),transparent_42%)]" />
            ) : null}

            <div className={cn(
                'relative overflow-hidden bg-stone-950 transition-transform duration-300 group-hover:scale-[1.02]',
                game.isFeatured ? 'h-52 sm:h-full sm:min-h-64' : 'h-48'
            )}>
                {game.coverImageUrl ? (
                    <>
                        <LazyImage
                            src={game.coverImageUrl}
                            fallbackSrc={game.imageUrl}
                            alt={game.title}
                            className="h-full w-full object-cover"
                            containerClassName="h-full w-full"
                            loading={game.isFeatured ? 'eager' : 'lazy'}
                            decoding="async"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/20 to-transparent" />
                    </>
                ) : (
                    <BrowserGameArt
                        title={game.title}
                        category={game.category}
                        faviconUrl={game.faviconUrl}
                        className="h-full w-full"
                    />
                )}

                <div className="absolute top-3 right-3 z-10 flex flex-wrap justify-end gap-2">
                    {game.isFeatured ? (
                        <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-400/40 backdrop-blur-md">
                            <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
                            Destaque
                        </Badge>
                    ) : null}
                    {game.isFree && (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 backdrop-blur-md">
                            {t('common.free')}
                        </Badge>
                    )}
                </div>

                <div className="absolute bottom-3 left-3 z-10">
                    <Badge variant="outline" className="bg-black/60 border-stone-700 text-stone-300 backdrop-blur-md">
                        {t(`browserGameCategories.${game.category}`, game.category)}
                    </Badge>
                </div>
            </div>

            <div className={cn(
                'relative p-5 flex flex-col flex-grow',
                game.isFeatured && 'sm:p-6'
            )}>
                <h3 className={cn(
                    'font-bold text-stone-100 mb-2 transition-colors duration-300',
                    game.isFeatured ? 'text-2xl group-hover:text-amber-300' : 'text-xl group-hover:text-blue-400'
                )}>
                    {game.title}
                </h3>

                <p className={cn(
                    'text-sm text-stone-400 mb-4 flex-grow',
                    game.isFeatured ? 'line-clamp-3 sm:text-base' : 'line-clamp-2'
                )}>
                    {game.description}
                </p>

                <div className="flex items-center justify-between gap-2 text-xs text-stone-500 mb-5">
                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" aria-hidden="true" />
                        <span>
                            {game.minPlayers}
                            {game.maxPlayers === 'Unlimited' ? '+' : ` - ${game.maxPlayers}`} {t('common.players')}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4" aria-hidden="true" />
                        <span className="font-medium">{game.price}</span>
                    </div>
                </div>

                <Button
                    onClick={() => openBrowserGameLink(game.url)}
                    className={cn(
                        'w-full gap-2 border-0',
                        game.isFeatured
                            ? 'bg-gradient-to-r from-amber-500 to-blue-500 hover:from-amber-400 hover:to-blue-400 text-stone-950'
                            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'
                    )}
                >
                    {t('common.playNow')}
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </Button>
            </div>
        </article>
    );

    return (
        <PageContainer>
            <SEO
                title={t('nav.webGames')}
                description={t('browserGames.subtitle')}
                canonicalPath="/browser-games"
            />
            <div className="container mx-auto px-4 py-8 relative z-10 isolate">
                <Breadcrumbs />

                <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                    className="text-center mb-12"
                >
                    <motion.div
                        variants={fadeInUp}
                        className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-4 py-1 mb-4"
                    >
                        <Globe className="h-4 w-4 text-blue-400" aria-hidden="true" />
                        <span className="text-xs text-blue-400 font-medium">{t('browserGames.badge')}</span>
                    </motion.div>

                    <motion.h1 variants={fadeInUp} className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4">
                        <span className="text-stone-100">{t('browserGames.title')}</span>{' '}
                        <span className="bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
                            {t('browserGames.titleHighlight')}
                        </span>
                    </motion.h1>

                    <motion.p variants={fadeInUp} className="text-lg text-stone-400 max-w-2xl mx-auto mb-8">
                        {t('browserGames.subtitle')}
                    </motion.p>

                    <motion.div variants={fadeInUp} className="max-w-md mx-auto mb-6">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-500" aria-hidden="true" />
                            <input
                                type="text"
                                placeholder={t('filters.searchPlaceholder')}
                                aria-label={t('filters.searchPlaceholder')}
                                value={searchTerm}
                                onChange={handleSearchChange}
                                className="w-full pl-10 pr-10 py-2.5 bg-stone-900 border border-stone-700 rounded-lg text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                            />
                            {isSearchPending ? (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
                                    <LoadingSpinner size="sm" tone="blue" />
                                </div>
                            ) : null}
                            {searchTerm && !isSearchPending ? (
                                <button
                                    type="button"
                                    onClick={handleClearSearch}
                                    aria-label={t('filters.clearSearch')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            ) : null}
                        </div>
                    </motion.div>

                    <motion.div variants={fadeInUp} className="flex justify-center">
                        <div
                            className="flex items-center gap-2 overflow-x-auto p-2 bg-stone-900/50 backdrop-blur-sm border border-stone-800 rounded-2xl max-w-full"
                            role="tablist"
                            aria-label={t('browserGames.filterCategories')}
                        >
                            <Filter className="h-4 w-4 text-stone-500 ml-2" aria-hidden="true" />
                            {browserCategories.map((type) => (
                                <button
                                    key={type}
                                    type="button"
                                    role="tab"
                                    aria-selected={selectedCategory === type}
                                    onClick={() => handleCategoryChange(type)}
                                    className={`
                                        relative px-4 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all
                                        ${selectedCategory === type
                                            ? 'text-white'
                                            : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
                                        }
                                    `}
                                >
                                    {selectedCategory === type && (
                                        <motion.div
                                            layoutId="activeBrowserFilter"
                                            className="absolute inset-0 bg-blue-600 rounded-xl -z-10 shadow-lg shadow-blue-500/25"
                                            transition={transitions.springBouncy}
                                        />
                                    )}
                                    {t(`browserGameCategories.${type}`, type)}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                    <p className="text-sm text-stone-400">
                        <span className="font-bold inline-block text-blue-500">
                            {t('browserGames.resultCount', {
                                range: filteredGames.length > 0 ? `${paginatedGames.startRange}-${paginatedGames.endRange}` : '0',
                                total: filteredGames.length,
                            })}
                        </span>
                    </p>
                </motion.div>

                {paginatedGames.items.length === 0 ? (
                    <motion.div
                        variants={fadeInUp}
                        initial="hidden"
                        animate="visible"
                        className="flex flex-col items-center justify-center py-20 text-center"
                    >
                        <div className="p-4 rounded-full bg-stone-800 mb-4">
                            <Frown className="h-12 w-12 text-stone-500" aria-hidden="true" />
                        </div>
                        <h3 className="text-xl font-bold text-stone-300 mb-2">{t('browserGames.noneFound')}</h3>
                        <p className="text-stone-500 mb-6 max-w-md">{t('browserGames.adjustFilters')}</p>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                startGridTransition(() => {
                                    setSelectedCategory('all');
                                    setSearchTerm('');
                                    setCurrentPage(1);
                                });
                            }}
                        >
                            {t('browserGames.clearFilters')}
                        </Button>
                    </motion.div>
                ) : (
                    <>
                        <div className="relative min-h-[12rem]">
                            <GridLoadingOverlay visible={showGridLoading} tone="blue" />

                            <motion.div
                                className={cn(showGridLoading && 'pointer-events-none')}
                                animate={{
                                    opacity: showGridLoading ? 0.55 : 1,
                                    filter: showGridLoading ? 'blur(6px) saturate(0.85)' : 'blur(0px) saturate(1)',
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
                                                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                                                variants={staggerContainerFast}
                                                initial="hidden"
                                                animate="visible"
                                            >
                                                {paginatedGames.items.map((game) => (
                                                    <motion.div
                                                        key={game.id}
                                                        variants={catalogCardReveal}
                                                        className={cn(game.isFeatured && 'md:col-span-2')}
                                                    >
                                                        {renderBrowserCard(game)}
                                                    </motion.div>
                                                ))}
                                            </motion.div>
                                        </motion.div>
                                    </AnimatePresence>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        {paginatedGames.items.map((game) => renderBrowserCard(game))}
                                    </div>
                                )}
                            </motion.div>
                        </div>

                        <PaginationControls
                            currentPage={paginatedGames.currentPage}
                            totalPages={paginatedGames.totalPages}
                            onPageChange={handlePageChange}
                        />
                    </>
                )}
            </div>
        </PageContainer>
    );
}
