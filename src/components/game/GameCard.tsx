import { memo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, AlertTriangle, Star } from 'lucide-react';
import type { Game } from '@/types/game';
import { Badge } from '@/components/ui/Badge';
import { getPlaceholderImage, getTypeBadgeStyle, getDifficultyStyle } from '@/utils/helpers';
import { useFormatPlayers } from '@/hooks/useFormatPlayers';
import { useGameStore } from '@/store/gameStore';
import { LazyImage } from '@/components/ui/loading/LazyImage';

interface GameCardProps {
    game: Game;
}

function GameCardComponent({ game }: GameCardProps) {
    const { t } = useTranslation();
    const formatPlayers = useFormatPlayers();
    const openModal = useGameStore((state) => state.openModal);
    const cardRef = useRef<HTMLElement>(null);

    const handleOpenModal = () => {
        const rect = cardRef.current?.getBoundingClientRect();

        openModal(game.id, rect
            ? {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
            }
            : null);
    };

    return (
        <article
            ref={cardRef}
            className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden flex flex-col h-full group transition-colors hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/10"
        >
            <button
                type="button"
                className="relative h-44 w-full overflow-hidden cursor-pointer"
                onClick={handleOpenModal}
                aria-label={t('common.openDetailsFor', { title: game.title })}
            >
                <LazyImage
                    src={game.imgUrl || getPlaceholderImage(game.imgQ)}
                    fallbackSrc={getPlaceholderImage(game.imgQ)}
                    alt={game.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    containerClassName="h-full w-full"
                    loading="lazy"
                    decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-stone-900/20 to-transparent pointer-events-none" />

                <div className="absolute bottom-2 left-3 right-3 flex justify-between items-end">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border backdrop-blur-sm ${getTypeBadgeStyle(game.type)}`}>
                        {t(`gameTypes.${game.type}`)}
                    </span>
                    <div className="flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded border border-stone-700 backdrop-blur-sm">
                        <Star className="h-3 w-3 text-amber-500 fill-current" />
                        <span className="text-amber-500 font-bold text-xs">{game.rating}</span>
                    </div>
                </div>
            </button>

            <div className="p-4 flex flex-col flex-grow">
                <h3 className="text-lg font-bold text-stone-100 leading-tight group-hover:text-amber-500 mb-2 transition-colors">
                    {game.title}
                </h3>

                <div className="flex flex-wrap gap-1 mb-4">
                    {game.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">
                            {t(`tags.${tag}`, tag)}
                        </Badge>
                    ))}
                </div>

                <div className="mt-auto pt-3 border-t border-stone-800 grid grid-cols-2 gap-2 text-xs text-stone-400">
                    <div className="flex items-center gap-1" title={t('common.players')}>
                        <Users className="h-4 w-4" />
                        {formatPlayers(game.players)}
                    </div>
                    <div className={`flex items-center gap-1 justify-end ${getDifficultyStyle(game.diff)}`} title={t('game.difficulty')}>
                        <AlertTriangle className="h-4 w-4" />
                        {t(`difficulty.${game.diff}`, game.diff)}
                    </div>
                </div>

                <button
                    type="button"
                    className="mt-3 w-full uppercase tracking-wider text-xs px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-100 rounded-lg transition-colors"
                    onClick={handleOpenModal}
                >
                    {t('common.viewDetails')}
                </button>
            </div>
        </article>
    );
}

export const GameCard = memo(GameCardComponent);
