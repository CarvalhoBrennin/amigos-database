import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { LandingGameChip } from '@/components/landing/LandingGameChip';
import { LandingSection } from '@/components/landing/LandingLayout';
import { useFeaturedGames } from '@/components/landing/useFeaturedGames';
import { landingSectionReveal } from '@/components/landing/landingAnimations';

export function LandingFeaturedGames() {
    const { t } = useTranslation();
    const featuredGames = useFeaturedGames(6);

    return (
        <LandingSection className="landing-content-section pb-14">
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
                variants={landingSectionReveal}
            >
                <div className="landing-section-heading mb-6 flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-cyan-400/90">
                            {t('landing.featuredEyebrow')}
                        </p>
                        <h2 className="landing-display text-2xl font-bold text-white sm:text-3xl">
                            {t('landing.featuredTitle')}
                        </h2>
                    </div>
                    <Link
                        to="/catalog"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-400 transition-colors hover:text-amber-300"
                    >
                        {t('landing.featuredSeeAll')}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                </div>

                <div
                    className="landing-featured-rail flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory"
                    role="region"
                    aria-label={t('landing.featuredTitle')}
                >
                    {featuredGames.map((game, index) => (
                        <LandingGameChip key={game.id} game={game} priority={index === 0} />
                    ))}
                </div>
            </motion.div>
        </LandingSection>
    );
}
