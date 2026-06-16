import { motion } from 'framer-motion';
import { Play, Youtube, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toSafeTrustedExternalUrl } from '@/utils/url';

interface YouTubePlayerProps {
    videoId: string;
    title: string;
    startSeconds?: number;
}

export function YouTubePlayer({ videoId, title, startSeconds = 0 }: YouTubePlayerProps) {
    const { t } = useTranslation();
    const [isLoaded, setIsLoaded] = useState(false);
    const safeStart = Number.isFinite(startSeconds) && startSeconds > 0 ? Math.floor(startSeconds) : 0;
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const watchUrl = toSafeTrustedExternalUrl(
        `https://www.youtube.com/watch?v=${videoId}${safeStart > 0 ? `&t=${safeStart}s` : ''}`,
        'youtube'
    );
    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0${safeStart > 0 ? `&start=${safeStart}` : ''}`;

    const handlePlay = () => {
        setIsLoaded(true);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="w-full"
        >
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-stone-100 flex items-center gap-2">
                    <Youtube className="h-5 w-5 text-red-500" />
                    {t('game.gameplay')}
                </h2>
                {watchUrl ? (
                    <a
                        href={watchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-stone-500 hover:text-stone-300 flex items-center gap-1 transition-colors"
                    >
                        {t('game.watchOnYoutube')}
                        <ExternalLink className="h-3 w-3" />
                    </a>
                ) : null}
            </div>

            <div className="relative aspect-video rounded-xl overflow-hidden bg-stone-800 shadow-2xl">
                {!isLoaded ? (
                    <>
                        {/* thumbnail e botão play */}
                        <img
                            src={thumbnailUrl}
                            onError={(e) => {
                                const target = e.currentTarget;
                                if (target.src.includes('maxresdefault')) {
                                    target.src = target.src.replace('maxresdefault', 'hqdefault');
                                } else if (target.src.includes('hqdefault')) {
                                    target.src = target.src.replace('hqdefault', 'mqdefault');
                                }
                            }}
                            alt={`${title} gameplay`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <motion.button
                                onClick={handlePlay}
                                type="button"
                                aria-label={t('game.watchOnYoutube')}
                                className="w-20 h-20 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-2xl transition-colors group"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.95 }}
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.5, type: 'spring', stiffness: 300 }}
                            >
                                <Play className="h-10 w-10 text-white fill-white ml-1" />
                            </motion.button>
                        </div>
                        {/* título sobre o vídeo */}
                        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                            <p className="text-white text-sm font-medium truncate">{title} - {t('game.gameplayVideo')}</p>
                        </div>
                    </>
                ) : (
                    <iframe
                        src={embedUrl}
                        title={`${title} gameplay`}
                        className="w-full h-full"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                )}
            </div>
        </motion.div>
    );
}
