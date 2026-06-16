import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowRight, Gamepad2, Globe, Info } from 'lucide-react';
import { games } from '@/data/games';
import { browserGames } from '@/data/browserGames';
import { LandingSection } from '@/components/landing/LandingLayout';
import { landingCabinetReveal, landingStaggerContainer } from '@/components/landing/landingAnimations';

const cabinets = [
    {
        key: 'catalog',
        to: '/catalog',
        icon: Gamepad2,
        titleKey: 'landing.catalogTitle',
        descKey: 'landing.catalogDesc',
        count: games.length,
        tone: 'amber' as const,
        ctaKey: 'landing.explore',
    },
    {
        key: 'browser',
        to: '/browser-games',
        icon: Globe,
        titleKey: 'landing.browserTitle',
        descKey: 'landing.browserDesc',
        count: browserGames.length,
        tone: 'cyan' as const,
        ctaKey: 'landing.playNow',
    },
    {
        key: 'about',
        to: '/about',
        icon: Info,
        titleKey: 'landing.aboutTitle',
        descKey: 'landing.aboutDesc',
        count: null,
        tone: 'magenta' as const,
        ctaKey: 'landing.learnMore',
    },
] as const;

export function LandingPortalCards() {
    const { t } = useTranslation();

    return (
        <LandingSection className="pb-14">
            <div className="mb-8 text-center">
                <h2 className="landing-display text-2xl font-bold text-white sm:text-3xl">
                    {t('landing.portalsSectionTitle')}
                </h2>
            </div>

            <motion.div
                className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3"
                variants={landingStaggerContainer}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
            >
                {cabinets.map((cabinet) => {
                    const Icon = cabinet.icon;

                    return (
                        <motion.div key={cabinet.key} variants={landingCabinetReveal}>
                            <Link to={cabinet.to} className="group block h-full">
                                <article
                                    className={`landing-cabinet landing-cabinet--${cabinet.tone} flex h-full flex-col p-6 transition-transform duration-200 group-hover:-translate-y-1`}
                                >
                                    <Icon className="mb-4 h-11 w-11" aria-hidden="true" />
                                    <h3 className="landing-display mb-2 text-xl font-bold text-white">
                                        {t(cabinet.titleKey)}
                                    </h3>
                                    <p className="mb-5 flex-grow text-sm text-stone-300/90">
                                        {cabinet.count !== null
                                            ? t(cabinet.descKey, { count: cabinet.count })
                                            : t(cabinet.descKey)}
                                    </p>
                                    <span className="inline-flex items-center gap-2 text-sm font-semibold">
                                        {t(cabinet.ctaKey)}
                                        <ArrowRight
                                            className="h-4 w-4 transition-transform group-hover:translate-x-1"
                                            aria-hidden="true"
                                        />
                                    </span>
                                </article>
                            </Link>
                        </motion.div>
                    );
                })}
            </motion.div>
        </LandingSection>
    );
}
