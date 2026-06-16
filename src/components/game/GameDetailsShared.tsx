import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    AlertCircle,
    AlertTriangle,
    Calendar,
    Clock,
    DollarSign,
    ExternalLink,
    Star,
    TrendingDown,
    Users,
    Youtube,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Game } from '@/types/game';
import {
    getDifficultyStyle,
    getHighQualitySteamImage,
    getPlaceholderImage,
    getSteamStoreUrl,
    getTypeBadgeStyle,
    getYoutubeSearchUrl,
} from '@/utils/helpers';
import { useFormatPlayers } from '@/hooks/useFormatPlayers';
import {
    EXTERNAL_USD_TO_BRL_RATE,
    convertExternalUsdPrice,
} from '@/utils/price';
import {
    getStoreName,
    type CheapSharkDeal,
    type CheapSharkErrorCode,
} from '@/services/cheapshark';
import { toSafeTrustedExternalUrl } from '@/utils/url';
import { RadarChart } from '@/components/game/RadarChart';
import { DealPanelSkeleton } from '@/components/ui/loading/DealPanelSkeleton';
import { BlurUpImage } from '@/components/ui/loading/BlurUpImage';

const statKeys = ['communication', 'skill', 'chaos', 'strategy', 'story'] as const;

interface GameHeroProps {
    game: Game;
    variant?: 'page' | 'modal';
    children?: React.ReactNode;
}

interface GameMetadataGridProps {
    game: Game;
    deal: CheapSharkDeal | null;
    isDealPending?: boolean;
    variant?: 'page' | 'modal';
}

interface GameEditorialPanelProps {
    game: Game;
}

interface GameTagsPanelProps {
    game: Game;
    compact?: boolean;
}

interface GameProfilePanelProps {
    game: Game;
    compact?: boolean;
}

interface GameDealPanelProps {
    deal: CheapSharkDeal | null;
    isLoading: boolean;
    status: 'idle' | 'loading' | 'success' | 'error';
    errorCode: CheapSharkErrorCode | null;
    refetch: () => void;
    compact?: boolean;
}

interface GameExternalLinksProps {
    game: Game;
    compact?: boolean;
}

function getPrimaryPrice(catalogPrice: string, deal: CheapSharkDeal | null) {
    const convertedSalePrice = deal ? convertExternalUsdPrice(deal.salePrice) : null;
    const convertedNormalPrice = deal ? convertExternalUsdPrice(deal.normalPrice) : null;

    return {
        primaryPrice: convertedSalePrice?.formattedBrl ?? catalogPrice,
        secondaryPrice: deal?.isOnSale === '1' ? convertedNormalPrice?.formattedBrl : null,
        convertedSalePrice,
        discountPercent: deal?.isOnSale === '1' ? Math.round(Number.parseFloat(deal.savings)) : null,
    };
}

export function GameHero({ game, variant = 'page', children }: GameHeroProps) {
    const { t } = useTranslation();
    const formatPlayers = useFormatPlayers();
    const titleClassName =
        variant === 'page'
            ? 'text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4'
            : 'text-3xl sm:text-4xl font-bold text-white mb-2';
    const wrapperClassName = variant === 'page' ? 'relative h-[50vh] min-h-[400px] overflow-hidden' : 'relative h-64 sm:h-80 overflow-hidden';

    const cardImage = game.imgUrl || getPlaceholderImage(game.imgQ);
    const heroImage = getHighQualitySteamImage(game.imgUrl) || cardImage;
    const heroFallbackSrc = useMemo(
        () => [game.imgUrl, getPlaceholderImage(game.imgQ)],
        [game.imgQ, game.imgUrl]
    );

    return (
        <div className={wrapperClassName}>
            <BlurUpImage
                src={heroImage}
                placeholderSrc={cardImage !== heroImage ? cardImage : undefined}
                fallbackSrc={heroFallbackSrc}
                alt={game.title}
                className="object-cover"
                containerClassName="absolute inset-0 size-full"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-stone-900/60 to-transparent" />
            {children}

            <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                <div className={variant === 'page' ? 'container mx-auto' : ''}>
                    <span className={`inline-block text-xs font-bold uppercase px-3 py-1 rounded border ${getTypeBadgeStyle(game.type)} mb-4`}>
                        {t(`gameTypes.${game.type}`)}
                    </span>
                    <h1 className={titleClassName}>{game.title}</h1>
                    <div className="flex flex-wrap items-center gap-4 text-sm sm:text-base text-stone-300">
                        <span className="flex items-center gap-2">
                            <Star className="h-5 w-5 text-amber-500 fill-current" />
                            <span className="text-xl sm:text-2xl font-bold text-amber-500">{game.rating}</span>
                        </span>
                        <span className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            {formatPlayers(game.players)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function GameMetadataGrid({ game, deal, isDealPending = false, variant = 'page' }: GameMetadataGridProps) {
    const { t } = useTranslation();
    const effectiveDeal = isDealPending ? null : deal;
    const primaryPrice = getPrimaryPrice(game.catalogPrice, effectiveDeal);
    const cardClassName = variant === 'page' ? 'glass-panel p-4 text-center' : 'bg-stone-800/50 rounded-lg p-3 text-center';

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
                { icon: Clock, label: t('game.session'), value: game.session },
                {
                    icon: DollarSign,
                    label: t('game.price'),
                    value: primaryPrice.primaryPrice,
                    detail: primaryPrice.secondaryPrice,
                    style: effectiveDeal ? 'text-emerald-400' : 'text-stone-100',
                },
                {
                    icon: AlertTriangle,
                    label: t('game.difficulty'),
                    value: t(`difficulty.${game.diff}`, game.diff),
                    style: getDifficultyStyle(game.diff),
                },
                { icon: Calendar, label: t('game.year'), value: game.year },
            ].map((stat) => (
                <div key={stat.label} className={cardClassName}>
                    <stat.icon className={`h-5 w-5 mx-auto mb-2 ${stat.style || 'text-stone-400'}`} />
                    <div className="text-xs text-stone-500 uppercase tracking-wider">{stat.label}</div>
                    <div className={`text-lg sm:text-xl font-bold ${stat.style || 'text-stone-100'}`}>{stat.value}</div>
                    {stat.detail ? <div className="mt-1 text-xs text-stone-500 line-through">{stat.detail}</div> : null}
                </div>
            ))}
        </div>
    );
}

export function GameEditorialPanel({ game }: GameEditorialPanelProps) {
    const { t } = useTranslation();

    return (
        <div className="glass-panel p-6">
            <h2 className="text-lg font-bold text-stone-100 mb-4">{t('game.aboutGame')}</h2>
            <p className="text-stone-300 leading-relaxed mb-6">{game.desc}</p>

            <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-2">{t('game.mainMechanic')}</h3>
            <p className="text-stone-300 leading-relaxed mb-6">{game.mechanic}</p>

            <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-2">{t('game.verdict')}</h3>
            <p className="text-xl text-amber-400 font-medium italic">"{game.verdict}"</p>
        </div>
    );
}

export function GameTagsPanel({ game, compact = false }: GameTagsPanelProps) {
    const { t } = useTranslation();

    return (
        <div className={compact ? '' : 'glass-panel p-6'}>
            <h2 className="text-lg font-bold text-stone-100 mb-4">{t('game.tags')}</h2>
            <div className="flex flex-wrap gap-2">
                {game.tags.map((tag) => (
                    <Badge key={tag} className={compact ? 'bg-stone-800 text-stone-300' : 'text-sm px-3 py-1'}>
                        {t(`tags.${tag}`, tag)}
                    </Badge>
                ))}
            </div>
        </div>
    );
}

export function GameProfilePanel({ game, compact = false }: GameProfilePanelProps) {
    const { t } = useTranslation();

    return (
        <div className={compact ? '' : 'glass-panel p-6'}>
            <h2 className="text-lg font-bold text-stone-100 mb-4 text-center">{t('game.operationalProfile')}</h2>
            <RadarChart stats={game.stats} />

            {!compact ? (
                <div className="mt-4 grid grid-cols-1 gap-2">
                    {statKeys.map((key, index) => (
                        <div key={key} className="flex items-center justify-between text-sm">
                            <span className="text-stone-400">{t(`stats.${key}`)}</span>
                            <div className="flex items-center gap-2">
                                <div className="w-20 h-2 bg-stone-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-amber-500 rounded-full"
                                    style={{ width: `${game.stats[index] * 10}%` }}
                                    role="progressbar"
                                    aria-valuemin={0}
                                    aria-valuemax={10}
                                    aria-valuenow={game.stats[index]}
                                    aria-label={t(`stats.${key}`)}
                                />
                                </div>
                                <span className="text-stone-300 font-mono text-xs w-4">{game.stats[index]}</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export function GameDealPanel({ deal, isLoading, status, errorCode, refetch, compact = false }: GameDealPanelProps) {
    const { t } = useTranslation();

    if (isLoading) {
        return (
            <div
                role="status"
                aria-live="polite"
                aria-label={t('common.loading')}
            >
                <DealPanelSkeleton compact={compact} />
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className={compact ? 'p-4 rounded-xl border border-red-500/30 bg-red-500/5' : 'glass-panel p-6 border border-red-500/30'}>
                <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
                    <div className="flex-1">
                        <h3 className="text-sm font-semibold text-red-300">{t('game.dealUnavailable')}</h3>
                        <p className="text-sm text-stone-400 mt-1">{t(`game.dealErrors.${errorCode ?? 'network'}`)}</p>
                    </div>
                </div>
                <Button type="button" variant="secondary" className="mt-4 w-full" onClick={refetch}>
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    if (status === 'success' && !deal) {
        return (
            <div className={compact ? 'p-4 rounded-xl border border-stone-800' : 'glass-panel p-6'}>
                <h3 className="text-sm font-semibold text-stone-200">{t('game.dealNoOffers')}</h3>
                <p className="mt-2 text-sm text-stone-400">{t('game.dealNoOffersHint')}</p>
            </div>
        );
    }

    if (!deal) {
        return null;
    }

    const price = getPrimaryPrice('', deal);
    const wrapperClassName = compact
        ? 'p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20'
        : 'glass-panel p-6';

    return (
        <div className={wrapperClassName}>
            <h2 className="text-lg font-bold text-stone-100 mb-4 flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-emerald-400" />
                {t('game.dealTitle')}
            </h2>
            <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20">
                <div className="flex items-baseline justify-between mb-2">
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-emerald-400">{price.primaryPrice}</span>
                        {price.secondaryPrice ? <span className="text-sm text-stone-500 line-through">{price.secondaryPrice}</span> : null}
                    </div>
                    {price.discountPercent ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">-{price.discountPercent}%</Badge>
                    ) : null}
                </div>
                <div className="text-xs text-stone-500">{t('game.bestPriceVia', { store: getStoreName(deal.storeID) })}</div>
                {price.convertedSalePrice ? (
                    <div className="mt-2 text-xs text-stone-500">
                        {t('game.convertedPriceNote', {
                            rate: EXTERNAL_USD_TO_BRL_RATE.toFixed(2).replace('.', ','),
                            original: price.convertedSalePrice.formattedUsd,
                        })}
                    </div>
                ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
                {deal.metacriticScore && deal.metacriticScore !== '0' ? (
                    <div className="p-3 rounded-lg bg-stone-800/50 text-center">
                        <div className="text-2xl font-bold text-amber-400">{deal.metacriticScore}</div>
                        <div className="text-xs text-stone-500">Metacritic</div>
                    </div>
                ) : null}
                {deal.steamRatingPercent ? (
                    <div className="p-3 rounded-lg bg-stone-800/50 text-center">
                        <div className="text-2xl font-bold text-blue-400">{deal.steamRatingPercent}%</div>
                        <div className="text-xs text-stone-500">Steam</div>
                    </div>
                ) : null}
            </div>
            {deal.steamRatingText ? (
                <div className="mt-3 text-xs text-center text-stone-400">
                    {deal.steamRatingText} ({t('game.reviews', { count: Number.parseInt(deal.steamRatingCount, 10) || 0 })})
                </div>
            ) : null}
        </div>
    );
}

export function GameExternalLinks({ game, compact = false }: GameExternalLinksProps) {
    const { t } = useTranslation();
    const steamStoreUrl = toSafeTrustedExternalUrl(getSteamStoreUrl(game.imgUrl), 'steam');
    const youtubeSearchUrl = toSafeTrustedExternalUrl(getYoutubeSearchUrl(game.title), 'youtube');
    const wrapperClassName = compact ? '' : 'glass-panel p-6';

    return (
        <div className={wrapperClassName}>
            <h2 className="text-lg font-bold text-stone-100 mb-4">{t('lucky.whereToPlay')}</h2>
            <div className={compact ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
                {steamStoreUrl ? (
                    <a
                        href={steamStoreUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 w-full p-3 rounded-xl bg-gradient-to-r from-[#1b2838] to-[#2a475e] hover:from-[#2a475e] hover:to-[#3d6a8a] text-white transition-all group"
                    >
                        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.5 7.5l-1 5.5-4.5-2-4.5 2-1-5.5 4.5-2h2l4.5 2zm-10 9l3.5-1.5 1 2.5-4.5-1zm9 0l-4.5 1 1-2.5 3.5 1.5z" />
                            </svg>
                        </div>
                        <div className="flex-1">
                            <div className="font-bold text-sm">{t('lucky.steam')}</div>
                            <div className="text-xs text-stone-300">{t('common.viewDetails')}</div>
                        </div>
                        <ExternalLink className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                    </a>
                ) : null}

                {youtubeSearchUrl ? (
                    <a
                        href={youtubeSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 w-full p-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white transition-all group"
                    >
                        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                            <Youtube className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                            <div className="font-bold text-sm">{t('lucky.watchGameplay')}</div>
                            <div className="text-xs text-red-200 group-hover:text-white transition-colors">YouTube</div>
                        </div>
                        <ExternalLink className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                    </a>
                ) : null}
            </div>
        </div>
    );
}
