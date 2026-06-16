import { useTranslation } from 'react-i18next';
import { LuckyGameModal } from '@/components/game/LuckyGameModal';
import { SEO } from '@/components/SEO';
import { LandingFeaturedGames } from '@/components/landing/LandingFeaturedGames';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingLayout } from '@/components/landing/LandingLayout';
import { LandingLuckyCta } from '@/components/landing/LandingLuckyCta';
import { LandingPortalCards } from '@/components/landing/LandingPortalCards';
import { LandingStatsStrip } from '@/components/landing/LandingStatsStrip';
import { useGameStore } from '@/store/gameStore';

interface LandingExperienceProps {
    canonicalPath?: string;
    noIndex?: boolean;
}

export function LandingExperience({ canonicalPath = '/', noIndex = false }: LandingExperienceProps) {
    const { i18n } = useTranslation();
    const openLuckyModal = useGameStore((state) => state.openLuckyModal);

    const handleLuckyClick = () => {
        openLuckyModal(i18n.resolvedLanguage || i18n.language);
    };

    return (
        <LandingLayout>
            <SEO canonicalPath={canonicalPath} noIndex={noIndex} />
            <LandingHeader />

            <main id="landing-main">
                <LandingHero onLuckyClick={handleLuckyClick} />
                <LandingFeaturedGames />
                <LandingPortalCards />
                <LandingLuckyCta onLuckyClick={handleLuckyClick} />
                <LandingStatsStrip />
            </main>

            <LandingFooter />
            <LuckyGameModal />
        </LandingLayout>
    );
}
