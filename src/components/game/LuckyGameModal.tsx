import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Clock, Dices, ExternalLink, Gamepad2, RefreshCw, Sparkles, Star, Users } from 'lucide-react';
import {
    GameEditorialPanel,
    GameExternalLinks,
    GameHero,
    GameMetadataGrid,
    GameProfilePanel,
    GameTagsPanel,
} from '@/components/game/GameDetailsShared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ContentLoadingOverlay } from '@/components/ui/loading/ContentLoadingOverlay';
import { useGameStore } from '@/store/gameStore';
import { useGameById } from '@/hooks/useGames';
import { useContentSwapMask } from '@/hooks/useContentSwapMask';
import { fadeInUp } from '@/lib/animations';
import { cn } from '@/lib/cn';
import { useFormatPlayers } from '@/hooks/useFormatPlayers';

const revealStepKeys = ['criteriaGroup', 'criteriaTime', 'criteriaProfile', 'criteriaVibe'] as const;

function LuckyRevealStage({ onComplete }: { onComplete: () => void }) {
    const { t } = useTranslation();
    const shouldReduceMotion = useReducedMotion();

    useEffect(() => {
        const timer = window.setTimeout(onComplete, shouldReduceMotion ? 650 : 1450);
        return () => window.clearTimeout(timer);
    }, [onComplete, shouldReduceMotion]);

    return (
        <motion.div
            key="reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="relative min-h-[28rem] overflow-hidden bg-stone-900"
        >
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(28,25,23,1),rgba(12,10,9,1)_55%,rgba(23,37,84,0.7))]" />
            <div className="absolute -left-20 top-10 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />
            <div className="absolute -right-16 bottom-12 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.20),transparent_34%)]" />
            <motion.div
                className="absolute left-0 right-0 top-0 h-px bg-amber-300/80 shadow-[0_0_34px_rgba(251,191,36,0.75)]"
                animate={shouldReduceMotion ? { opacity: [0.3, 0.75, 0.3] } : { y: [24, 430, 24] }}
                transition={{ duration: shouldReduceMotion ? 0.6 : 1.25, ease: [0.4, 0, 0.2, 1] }}
            />

            <div className="relative flex min-h-[28rem] flex-col items-center justify-center px-6 py-12 text-center">
                <div className="mb-7 flex w-full max-w-md items-center gap-4 rounded-2xl border border-stone-700/80 bg-stone-950/75 px-5 py-4 text-left shadow-2xl shadow-black/30">
                    <motion.div
                        className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10"
                        animate={shouldReduceMotion ? { scale: [1, 1.03, 1] } : { rotate: [0, 360], scale: [1, 1.05, 1] }}
                        transition={{
                            rotate: { duration: 1.1, repeat: shouldReduceMotion ? 0 : Infinity, ease: 'linear' },
                            scale: { duration: 0.72, repeat: shouldReduceMotion ? 1 : Infinity, ease: 'easeInOut' },
                        }}
                    >
                        <span className="absolute -right-1 top-2 h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_18px_rgba(96,165,250,0.8)]" />
                        <span className="absolute bottom-2 left-1 h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.8)]" />
                        <Dices className="h-7 w-7 text-amber-400" aria-hidden="true" />
                    </motion.div>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-stone-100">{t('lucky.loading')}</h2>
                        <p className="text-sm text-stone-500">{t('lucky.revealHint')}</p>
                    </div>
                </div>

                <motion.div
                    className="mb-7 grid w-full max-w-2xl gap-3"
                    initial={{ opacity: 0.45, filter: 'blur(8px)' }}
                    animate={shouldReduceMotion ? { opacity: 0.8, filter: 'blur(8px)' } : { opacity: [0.45, 0.85, 0.55], filter: ['blur(8px)', 'blur(5px)', 'blur(8px)'] }}
                    transition={{ duration: 1.1, repeat: shouldReduceMotion ? 0 : 1, ease: [0.4, 0, 0.2, 1] }}
                    aria-hidden="true"
                >
                    <div className="mx-auto h-8 w-3/4 rounded-full bg-stone-100/25" />
                    <div className="mx-auto h-8 w-1/2 rounded-full bg-amber-300/20" />
                </motion.div>

                <div className="grid w-full max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
                    {revealStepKeys.map((stepKey, index) => (
                        <motion.div
                            key={stepKey}
                            className="rounded-xl border border-stone-700/80 bg-stone-950/75 px-3 py-4 text-sm font-semibold text-stone-300"
                            initial={{ opacity: 0.35, y: 8 }}
                            animate={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: [0.35, 1, 0.55], y: [8, 0, 4] }}
                            transition={{
                                duration: 0.7,
                                delay: index * 0.08,
                                repeat: shouldReduceMotion ? 0 : 1,
                                ease: [0.4, 0, 0.2, 1],
                            }}
                        >
                            {t(`lucky.${stepKey}`)}
                        </motion.div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

export function LuckyGameModal() {
    const { t, i18n } = useTranslation();
    const formatPlayers = useFormatPlayers();
    const shouldReduceMotion = useReducedMotion();
    const { luckyGameId, isLuckyModalOpen, closeLuckyModal, rerollLuckyGame } = useGameStore();
    const game = useGameById(luckyGameId);
    const [revealedGameId, setRevealedGameId] = useState<number | null>(null);
    const [isRerolling, setIsRerolling] = useState(false);
    const shouldReveal = isLuckyModalOpen && luckyGameId !== null && revealedGameId !== luckyGameId;
    const showSwapMask = useContentSwapMask(luckyGameId, isLuckyModalOpen && !shouldReveal);

    const handleClose = () => {
        setRevealedGameId(null);
        setIsRerolling(false);
        closeLuckyModal();
    };

    const handleReroll = () => {
        setIsRerolling(true);
        setRevealedGameId(null);
        rerollLuckyGame(i18n.resolvedLanguage || i18n.language);
    };

    const handleRevealComplete = () => {
        setRevealedGameId(luckyGameId);
        setIsRerolling(false);
    };

    if (!isLuckyModalOpen) {
        return null;
    }

    return (
        <Modal isOpen={isLuckyModalOpen} onClose={handleClose} ariaLabel={t('lucky.title')} size="wide">
            <div className="relative max-h-[90vh] overflow-y-auto rounded-xl border border-stone-800 bg-stone-900">
                <ContentLoadingOverlay visible={showSwapMask || isRerolling} tone="amber" className="rounded-xl" />

                <AnimatePresence mode="wait">
                    {shouldReveal ? (
                        <LuckyRevealStage key={`reveal-${luckyGameId ?? 'empty'}`} onComplete={handleRevealComplete} />
                    ) : game ? (
                        <motion.div
                            key={luckyGameId ?? 'lucky'}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: showSwapMask ? 0.55 : 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                            className={cn(showSwapMask && 'pointer-events-none')}
                        >
                            <GameHero game={game} variant="modal">
                                <div className="absolute left-6 top-6 z-10 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-stone-950/70 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-300 backdrop-blur">
                                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                                    {t('lucky.title')}
                                </div>
                            </GameHero>

                            <motion.div
                                className="p-6 lg:p-8"
                                variants={fadeInUp}
                                initial="hidden"
                                animate="visible"
                            >
                                <div className="mb-6">
                                    <GameMetadataGrid game={game} deal={null} variant="modal" />
                                </div>

                                <motion.div
                                    className="mb-6 overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-r from-amber-500/10 via-stone-950/60 to-blue-500/10"
                                    initial={{ opacity: 0, y: 14 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1, duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                                >
                                    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                                        <div className="min-w-0">
                                            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                                                <Sparkles className="h-4 w-4" aria-hidden="true" />
                                                {t('lucky.recommended')}
                                            </div>
                                            <p className="max-w-2xl text-sm text-stone-400">
                                                {t('lucky.recommendedBody')}
                                            </p>
                                        </div>
                                        <motion.div
                                            className="hidden h-16 w-16 items-center justify-center rounded-2xl border border-amber-500/25 bg-stone-950/70 lg:flex"
                                            animate={
                                                shouldReduceMotion
                                                    ? { opacity: [0.85, 1, 0.85] }
                                                    : isRerolling
                                                        ? { rotate: 360 }
                                                        : { rotate: [0, -8, 8, 0] }
                                            }
                                            transition={{
                                                duration: shouldReduceMotion ? 1.4 : isRerolling ? 0.7 : 3,
                                                repeat: shouldReduceMotion ? 1 : Infinity,
                                                ease: isRerolling && !shouldReduceMotion ? 'linear' : 'easeInOut',
                                            }}
                                        >
                                            <Dices className="h-8 w-8 text-amber-300" aria-hidden="true" />
                                        </motion.div>
                                    </div>
                                    <div className="grid gap-3 border-t border-stone-800/80 p-5 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                                        {[
                                            { icon: Star, label: t('lucky.summaryRating'), value: game.rating },
                                            { icon: Users, label: t('lucky.summaryGroup'), value: formatPlayers(game.players) },
                                            { icon: Clock, label: t('lucky.summarySession'), value: game.session },
                                            { icon: Gamepad2, label: t('lucky.summaryType'), value: t(`gameTypes.${game.type}`) },
                                        ].map((item) => (
                                            <div key={item.label} className="min-w-0 rounded-xl border border-stone-800 bg-stone-950/60 p-3">
                                                <item.icon className="mb-2 h-4 w-4 text-amber-400" aria-hidden="true" />
                                                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{item.label}</div>
                                                <div className="mt-1 break-words text-sm font-semibold text-stone-100">{item.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>

                                <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)] gap-6 mb-6">
                                    <div className="space-y-6 min-w-0">
                                        <GameEditorialPanel game={game} />
                                        <GameTagsPanel game={game} compact />
                                    </div>

                                    <div className="space-y-6 min-w-0">
                                        <GameProfilePanel game={game} compact />
                                        <GameExternalLinks game={game} compact />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 border-t border-stone-800 pt-4 sm:flex-row">
                                    <Button to={`/game/${game.id}`} className="flex-1 w-full" onClick={handleClose}>
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        {t('common.viewFullPage')}
                                    </Button>
                                    <Button variant="secondary" onClick={handleReroll} disabled={isRerolling} className="w-full sm:w-auto">
                                        <RefreshCw className={cn('mr-2 h-4 w-4', isRerolling && 'animate-spin')} />
                                        {t('lucky.tryAnother')}
                                    </Button>
                                    <Button variant="secondary" onClick={handleClose} className="w-full sm:w-auto">
                                        {t('common.close')}
                                    </Button>
                                </div>
                            </motion.div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="px-6 py-12 text-center space-y-4"
                        >
                            <p className="text-stone-300">{t('lucky.unavailable')}</p>
                            <div className="flex flex-wrap items-center justify-center gap-3">
                                <Button variant="secondary" onClick={handleReroll} disabled={isRerolling}>
                                    {t('lucky.tryAnother')}
                                </Button>
                                <Button variant="ghost" onClick={handleClose}>
                                    {t('common.close')}
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </Modal>
    );
}
