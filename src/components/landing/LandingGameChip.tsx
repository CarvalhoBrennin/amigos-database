import { Link } from "react-router-dom";

import { useTranslation } from "react-i18next";

import { Star } from "lucide-react";

import type { Game } from "@/types/game";

import { LazyImage } from "@/components/ui/loading/LazyImage";

import { getPlaceholderImage } from "@/utils/helpers";

interface LandingGameChipProps {
  game: Game;

  priority?: boolean;
}

export function LandingGameChip({
  game,
  priority = false,
}: LandingGameChipProps) {
  const { t } = useTranslation();

  return (
    <Link
      to={`/game/${game.id}`}
      className="landing-game-chip group snap-start shrink-0"
    >
      <div className="relative h-36 overflow-hidden">
        <LazyImage
          src={game.imgUrl || getPlaceholderImage(game.imgQ)}
          fallbackSrc={getPlaceholderImage(game.imgQ)}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          containerClassName="h-full w-full"
          loading={priority ? "eager" : "lazy"}
          decoding="async"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-transparent to-transparent" />

        <div
          className="absolute bottom-2 right-2 flex items-center gap-1 border border-amber-500/40 bg-stone-950/80 px-2 py-0.5 text-xs font-bold text-amber-400"
          aria-label={t("landing.gameRating", { rating: game.rating })}
        >
          <Star className="h-3 w-3 fill-current" aria-hidden="true" />

          <span aria-hidden="true">{game.rating}</span>
        </div>
      </div>

      <div className="border-t border-amber-500/20 bg-stone-950/90 px-3 py-2.5">
        <h3 className="truncate text-sm font-bold text-stone-100 group-hover:text-amber-300">
          {game.title}
        </h3>
      </div>
    </Link>
  );
}
