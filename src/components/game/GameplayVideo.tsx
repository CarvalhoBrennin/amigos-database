import type { Game } from '@/types/game';
import { MediaFrameSkeleton } from '@/components/ui/loading/MediaFrameSkeleton';
import { YouTubePlayer } from '@/components/game/YouTubePlayer';
import { useGameplayVideo } from '@/hooks/useGameplayVideo';

interface GameplayVideoProps {
    game: Game;
}

export function GameplayVideo({ game }: GameplayVideoProps) {
    const { videoId, startSeconds, isLoading } = useGameplayVideo(game);

    if (isLoading) {
        return (
            <div className="container mx-auto px-4 pt-8">
                <MediaFrameSkeleton className="h-56" />
            </div>
        );
    }

    if (!videoId) {
        return null;
    }

    return (
        <div className="container mx-auto px-4 pt-8">
            <YouTubePlayer videoId={videoId} title={game.title} startSeconds={startSeconds} />
        </div>
    );
}
