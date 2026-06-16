import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Gamepad2, Sparkles, Dices } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { GameFilters } from '@/components/game/GameFilters';
import { GameGrid } from '@/components/game/GameGrid';
import { GameModal } from '@/components/game/GameModal';
import { LuckyGameModal } from '@/components/game/LuckyGameModal';
import { SEO } from '@/components/SEO';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { games, gameTypeIds, hasNativeEditorialForLanguage } from '@/data/games';
import { useCatalogUrlState } from '@/hooks/useCatalogUrlState';
import { useGameStore } from '@/store/gameStore';
import { preloadDetailChunks } from '@/utils/preloadDetailChunks';

export function HomePage() {
    const { t, i18n } = useTranslation();
    const openLuckyModal = useGameStore((state) => state.openLuckyModal);
    useCatalogUrlState();
    const totalGames = games.length;
    const categoriesCount = gameTypeIds.length;
    const showEditorialFallbackNote = !hasNativeEditorialForLanguage(i18n.resolvedLanguage || i18n.language);

    useEffect(() => {
        preloadDetailChunks();
    }, []);

    const handleOpenLuckyModal = () => {
        openLuckyModal(i18n.resolvedLanguage || i18n.language);
    };

    return (
        <PageContainer>
            <SEO
                title={t('nav.catalog')}
                description={t('home.subtitle')}
                canonicalPath="/catalog"
            />
            <div className="container mx-auto px-4 py-8 relative z-10 isolate">
                <Breadcrumbs />
                <motion.section
                    className="text-center mb-12"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <motion.div
                        className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-4 py-1 mb-4"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        whileHover={{ scale: 1.05 }}
                    >
                        <motion.div
                            animate={{ rotate: [0, 360] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        >
                            <Sparkles className="h-4 w-4 text-amber-500" aria-hidden="true" />
                        </motion.div>
                        <span className="text-xs font-medium">v1.0</span>
                    </motion.div>

                    <motion.h1
                        className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-stone-100 mb-4"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.3 }}
                    >
                        {t('home.title')}
                    </motion.h1>

                    <motion.p
                        className="text-lg text-stone-400 max-w-2xl mx-auto mb-6"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.5 }}
                    >
                        {t('home.subtitle')}
                    </motion.p>

                    {showEditorialFallbackNote ? (
                        <motion.p
                            className="text-sm text-amber-400/90 max-w-2xl mx-auto mb-4"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.6, delay: 0.55 }}
                        >
                            {t('catalog.editorialLocaleNote')}
                        </motion.p>
                    ) : null}

                    <motion.div
                        className="flex items-center justify-center gap-4 text-sm text-stone-500"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.7 }}
                    >
                        <motion.div
                            className="flex items-center gap-1 text-stone-500"
                            whileHover={{ scale: 1.1 }}
                            transition={{ type: 'spring' }}
                        >
                            <Gamepad2 className="h-4 w-4 text-amber-500" aria-hidden="true" />
                            <span>{totalGames} {t('common.games')}</span>
                        </motion.div>
                        <span className="text-stone-700" aria-hidden="true">•</span>
                        <motion.span whileHover={{ scale: 1.1, color: 'rgb(251 191 36)' }} transition={{ type: 'spring' }}>
                            {categoriesCount} {t('common.categories')}
                        </motion.span>
                        <span className="text-stone-700" aria-hidden="true">•</span>
                        <motion.span whileHover={{ scale: 1.1, color: 'rgb(251 191 36)' }} transition={{ type: 'spring' }}>
                            {t('home.operationalProfiles')}
                        </motion.span>
                    </motion.div>

                    <motion.div
                        className="mt-6"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.9 }}
                    >
                        <motion.button
                            type="button"
                            onClick={handleOpenLuckyModal}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-stone-900 font-bold shadow-lg"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            transition={{ type: 'spring' }}
                        >
                            <Dices className="h-5 w-5" aria-hidden="true" />
                            <span>{t('lucky.button')}</span>
                        </motion.button>
                    </motion.div>
                </motion.section>

                <GameFilters />
                <GameGrid />
                <GameModal />
                <LuckyGameModal />
            </div>
        </PageContainer>
    );
}
