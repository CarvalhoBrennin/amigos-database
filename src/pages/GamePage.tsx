import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import {
    GameDealPanel,
    GameEditorialPanel,
    GameExternalLinks,
    GameHero,
    GameMetadataGrid,
    GameProfilePanel,
    GameTagsPanel,
} from '@/components/game/GameDetailsShared';
import { GameplayVideo } from '@/components/game/GameplayVideo';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/Button';
import { SEO } from '@/components/SEO';
import { useGameById } from '@/hooks/useGames';
import { useGameDeal } from '@/hooks/useGameDeal';
import { getSteamHeaderImage } from '@/utils/helpers';
import { buildCanonicalPath } from '@/lib/siteUrl';
import { preloadDetailChunks } from '@/utils/preloadDetailChunks';

export function GamePage() {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const game = useGameById(id || null);
    const {
        deal,
        isLoading: isDealLoading,
        status: dealStatus,
        errorCode: dealErrorCode,
        refetch: refetchDeal,
    } = useGameDeal(game?.imgUrl);

    useEffect(() => {
        preloadDetailChunks();
    }, []);

    if (!game) {
        return (
            <PageContainer>
                <SEO
                    title={t('game.notFound')}
                    description={t('game.notFoundDesc')}
                    canonicalPath="/catalog"
                    noIndex
                />
                <div className="container mx-auto px-4 py-20 text-center">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-3xl font-bold text-stone-300 mb-4"
                    >
                        {t('game.notFound')}
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-stone-500 mb-8"
                    >
                        {t('game.notFoundDesc')}
                    </motion.p>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                    >
                        <Button to="/catalog">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            {t('game.backToCatalog')}
                        </Button>
                    </motion.div>
                </div>
            </PageContainer>
        );
    }

    const gameJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'VideoGame',
        name: game.title,
        description: game.desc,
        image: getSteamHeaderImage(game.imgUrl) || game.imgUrl,
        url: buildCanonicalPath(`/game/${game.id}`),
        aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: game.rating,
            bestRating: 10,
            worstRating: 0,
        },
    };

    return (
        <PageContainer>
            <SEO
                title={game.title}
                description={game.desc}
                image={getSteamHeaderImage(game.imgUrl) || game.imgUrl}
                type="article"
                canonicalPath={`/game/${game.id}`}
                jsonLd={gameJsonLd}
            />
            <GameHero game={game}>
                <div className="absolute top-6 left-6">
                    <Button to="/catalog" variant="secondary" size="sm">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        {t('common.back')}
                    </Button>
                </div>
            </GameHero>

            <GameplayVideo game={game} />

            <div className="container mx-auto px-4 py-12">
                <div className="grid lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                        <GameMetadataGrid game={game} deal={deal} isDealPending={isDealLoading} />
                        <GameEditorialPanel game={game} />
                        <GameTagsPanel game={game} />
                    </div>

                    <div className="space-y-6">
                        <GameProfilePanel game={game} />
                        <GameDealPanel
                            deal={deal}
                            isLoading={isDealLoading}
                            status={dealStatus}
                            errorCode={dealErrorCode}
                            refetch={refetchDeal}
                        />
                        <GameExternalLinks game={game} />
                    </div>
                </div>
            </div>
        </PageContainer>
    );
}
