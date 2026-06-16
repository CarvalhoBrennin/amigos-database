import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import {
    GameDealPanel,
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
import { useGameDeal } from '@/hooks/useGameDeal';
import { useContentSwapMask } from '@/hooks/useContentSwapMask';
import { fadeInUp } from '@/lib/animations';
import { cn } from '@/lib/cn';

export function GameModal() {
    const { t } = useTranslation();
    const { selectedGameId, isModalOpen, modalOriginRect, closeModal, finishCloseModal } = useGameStore();
    const game = useGameById(selectedGameId);
    const showSwapMask = useContentSwapMask(selectedGameId, isModalOpen);
    const {
        deal,
        isLoading: isDealLoading,
        status: dealStatus,
        errorCode: dealErrorCode,
        refetch: refetchDeal,
    } = useGameDeal(game?.imgUrl);

    const handleViewFullPage = () => {
        closeModal();
        finishCloseModal();
    };

    if (!game) {
        return null;
    }

    return (
        <Modal
            isOpen={isModalOpen}
            onClose={closeModal}
            ariaLabel={game.title}
            animationMode="card-zoom"
            originRect={modalOriginRect}
            onExitComplete={finishCloseModal}
            size="wide"
        >
            <div className="relative bg-stone-900 border border-stone-800 rounded-xl overflow-hidden max-h-[90vh] overflow-y-auto">
                <ContentLoadingOverlay visible={showSwapMask} tone="amber" className="rounded-xl" />

                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={selectedGameId}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: showSwapMask ? 0.55 : 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                        className={cn(showSwapMask && 'pointer-events-none')}
                    >
                        <GameHero game={game} variant="modal" />
                        <motion.div
                            className="p-6 lg:p-8"
                            variants={fadeInUp}
                            initial="hidden"
                            animate="visible"
                        >
                            <div className="mb-6">
                                <GameMetadataGrid
                                    game={game}
                                    deal={deal}
                                    isDealPending={isDealLoading}
                                    variant="modal"
                                />
                            </div>

                            <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)] gap-6 mb-6">
                                <div className="space-y-6 min-w-0">
                                    <GameEditorialPanel game={game} />
                                    <GameTagsPanel game={game} compact />
                                </div>

                                <div className="space-y-6 min-w-0">
                                    <GameProfilePanel game={game} compact />
                                    <GameDealPanel
                                        deal={deal}
                                        isLoading={isDealLoading}
                                        status={dealStatus}
                                        errorCode={dealErrorCode}
                                        refetch={refetchDeal}
                                        compact
                                    />
                                    <GameExternalLinks game={game} compact />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-stone-800">
                                <Button to={`/game/${game.id}`} className="flex-1 w-full" onClick={handleViewFullPage}>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    {t('common.viewFullPage')}
                                </Button>
                                <Button variant="secondary" onClick={closeModal}>
                                    {t('common.close')}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </Modal>
    );
}
