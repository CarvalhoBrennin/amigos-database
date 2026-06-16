import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ChevronRight, Home } from 'lucide-react';
import { useGameById } from '@/hooks/useGames';

interface BreadcrumbItem {
    label: string;
    path?: string;
    key: string;
}

const routeTranslations: Record<string, string> = {
    catalog: 'nav.catalog',
    'browser-games': 'nav.webGames',
    about: 'nav.about',
    game: 'game.aboutGame',
};

export function Breadcrumbs() {
    const { t } = useTranslation();
    const location = useLocation();
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const gameIdSegment = pathSegments[0] === 'game' ? pathSegments[1] : null;
    const game = useGameById(gameIdSegment);

    if (location.pathname === '/') {
        return null;
    }

    const breadcrumbs: BreadcrumbItem[] = [
        { label: t('nav.home'), path: '/', key: 'home' },
    ];

    let currentPath = '';
    pathSegments.forEach((segment, index) => {
        currentPath += `/${segment}`;
        const isGameId = pathSegments[index - 1] === 'game' && !Number.isNaN(Number(segment));

        if (isGameId) {
            breadcrumbs.push({
                label: game?.title ?? `#${segment}`,
                key: `game-${segment}`,
            });
        } else {
            const translationKey = routeTranslations[segment];
            breadcrumbs.push({
                label: translationKey ? t(translationKey) : segment,
                path: index < pathSegments.length - 1 ? currentPath : undefined,
                key: segment,
            });
        }
    });

    return (
        <motion.nav
            aria-label={t('breadcrumbs.label')}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1 text-sm text-stone-500 mb-6 flex-wrap"
        >
            {breadcrumbs.map((item, index) => (
                <span key={item.key} className="flex items-center gap-1">
                    {index > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
                    {item.path ? (
                        <Link
                            to={item.path}
                            className="hover:text-amber-500 transition-colors flex items-center gap-1"
                        >
                            {index === 0 && <Home className="h-3 w-3" aria-hidden="true" />}
                            {item.label}
                        </Link>
                    ) : (
                        <span className="text-stone-300" aria-current="page">
                            {item.label}
                        </span>
                    )}
                </span>
            ))}
        </motion.nav>
    );
}
