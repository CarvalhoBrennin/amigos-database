import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Dices, Sparkles, Star, Trophy, Users, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LandingSection } from '@/components/landing/LandingLayout';
import { useAnimations } from '@/components/animation-context';
import { landingSectionReveal, landingStaggerContainer } from '@/components/landing/landingAnimations';

interface LandingHeroProps {
    onLuckyClick: () => void;
}

const badgeConfig = [
    { id: 'coop', icon: Users, labelKey: 'landing.featuresCoop', tone: 'text-cyan-400' },
    { id: 'rated', icon: Star, labelKey: 'landing.featuresRated', tone: 'text-amber-400' },
    { id: 'updated', icon: Zap, labelKey: 'landing.featuresUpdated', tone: 'text-emerald-400' },
    { id: 'curated', icon: Trophy, labelKey: 'landing.featuresCurated', tone: 'text-fuchsia-400' },
] as const;

export function LandingHero({ onLuckyClick }: LandingHeroProps) {
    const { t } = useTranslation();
    const { animationsEnabled } = useAnimations();

    const marqueeItems = [
        t('landing.marqueeCoop'),
        t('landing.marqueeProfiles'),
        t('landing.marqueeDeals'),
        t('landing.marqueeBrowser'),
        t('landing.marqueeLucky'),
    ];

    const duplicatedMarquee = [...marqueeItems, ...marqueeItems];

    return (
        <LandingSection className="pb-10 pt-12 sm:pt-16">
            <motion.div
                className="mx-auto max-w-5xl text-center"
                variants={landingStaggerContainer}
                initial="hidden"
                animate="visible"
            >
                <motion.div variants={landingSectionReveal} className="mb-6">
                    <span className="landing-coin-badge inline-flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-400" aria-hidden="true" />
                        {t('landing.badge')}
                    </span>
                </motion.div>

                <motion.h1
                    variants={landingSectionReveal}
                    className="landing-display mb-4 text-5xl font-bold leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl"
                >
                    <span className="block text-white drop-shadow-[0_0_24px_rgba(245,158,11,0.35)]">
                        {t('landing.heroTitleLine1')}
                    </span>
                    <span className="block bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
                        {t('landing.heroTitleLine2')}
                    </span>
                </motion.h1>

                <motion.p
                    variants={landingSectionReveal}
                    className="mx-auto mb-8 max-w-2xl text-lg text-stone-200/95 sm:text-xl"
                >
                    {t('landing.heroSubtitle')}
                </motion.p>

                <motion.div
                    variants={landingSectionReveal}
                    className="mb-10 flex flex-wrap items-center justify-center gap-3"
                >
                    <Button to="/catalog" size="lg" className="landing-cta-primary min-w-[11rem]">
                        {t('landing.heroPrimaryCta')}
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        className="landing-cta-secondary min-w-[11rem] border-2 border-fuchsia-500/40 bg-stone-950/60 text-fuchsia-200 hover:border-fuchsia-400/60 hover:bg-fuchsia-500/10"
                        onClick={onLuckyClick}
                    >
                        <Dices className="mr-2 h-5 w-5" aria-hidden="true" />
                        {t('landing.heroSecondaryCta')}
                    </Button>
                </motion.div>

                <motion.div
                    variants={landingSectionReveal}
                    className="mb-10 flex flex-wrap justify-center gap-3"
                >
                    {badgeConfig.map(({ id, icon: Icon, labelKey, tone }) => (
                        <span key={id} className="landing-coin-badge">
                            <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
                            {t(labelKey)}
                        </span>
                    ))}
                </motion.div>

                {animationsEnabled ? (
                    <motion.div
                        variants={landingSectionReveal}
                        className="landing-marquee-mask overflow-hidden"
                        aria-hidden="true"
                    >
                        <div className="landing-marquee-track flex w-max gap-8">
                            {duplicatedMarquee.map((item, index) => (
                                <span
                                    key={`${item}-${index}`}
                                    className="landing-display whitespace-nowrap text-sm uppercase tracking-[0.25em] text-amber-400/70"
                                >
                                    {item}
                                </span>
                            ))}
                        </div>
                    </motion.div>
                ) : (
                    <motion.p variants={landingSectionReveal} className="text-sm text-stone-400">
                        {marqueeItems.join(' • ')}
                    </motion.p>
                )}
            </motion.div>
        </LandingSection>
    );
}
