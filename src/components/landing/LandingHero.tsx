import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowUpRight, Dices, Gamepad2, Radio, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LandingSection } from '@/components/landing/LandingLayout';
import { useAnimations } from '@/components/animation-context';
import { landingSectionReveal, landingStaggerContainer } from '@/components/landing/landingAnimations';

interface LandingHeroProps {
    onLuckyClick: () => void;
}

const signalConfig = [
    { id: 'coop', labelKey: 'landing.featuresCoop' },
    { id: 'rated', labelKey: 'landing.featuresRated' },
    { id: 'updated', labelKey: 'landing.featuresUpdated' },
    { id: 'curated', labelKey: 'landing.featuresCurated' },
] as const;

export function LandingHero({ onLuckyClick }: LandingHeroProps) {
    const { t } = useTranslation();
    const { animationsEnabled } = useAnimations();
    const mapLabels = [
        t('landing.marqueeCoop'),
        t('landing.marqueeProfiles'),
        t('landing.marqueeDeals'),
        t('landing.marqueeBrowser'),
    ];

    return (
        <LandingSection className="landing-hero-section">
            <motion.div
                className="landing-hero-grid"
                variants={landingStaggerContainer}
                initial="hidden"
                animate="visible"
            >
                <div className="landing-hero-copy">
                    <motion.div variants={landingSectionReveal} className="landing-hero-index">
                        <span>AMIGOS DATABASE</span>
                        <span>CO-OP / 001</span>
                    </motion.div>

                    <motion.h1 variants={landingSectionReveal} className="landing-hero-title">
                        <span>{t('landing.heroTitleLine1')}</span>
                        <span className="landing-hero-title__accent">{t('landing.heroTitleLine2')}</span>
                    </motion.h1>

                    <motion.p variants={landingSectionReveal} className="landing-hero-lead">
                        {t('landing.heroSubtitle')}
                    </motion.p>

                    <motion.div variants={landingSectionReveal} className="landing-hero-actions">
                        <Button to="/room/new" size="lg" className="landing-cta-primary landing-action-primary">
                            {t('landing.roomCta')}
                            <ArrowUpRight className="ml-2 h-5 w-5" aria-hidden="true" />
                        </Button>
                        <Button to="/catalog" variant="secondary" size="lg" className="landing-action-secondary">
                            <Gamepad2 className="mr-2 h-5 w-5" aria-hidden="true" />
                            {t('landing.catalogCta')}
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="lg"
                            className="landing-action-lucky"
                            onClick={onLuckyClick}
                        >
                            <Dices className="mr-2 h-5 w-5" aria-hidden="true" />
                            {t('lucky.button')}
                        </Button>
                    </motion.div>
                </div>

                <motion.aside
                    variants={landingSectionReveal}
                    className="landing-decision-map"
                    aria-hidden="true"
                >
                    <div className="landing-decision-map__header">
                        <span className="flex items-center gap-2">
                            <Radio className="h-4 w-4" />
                            MESA ATIVA
                        </span>
                        <span className="landing-decision-map__live">AO VIVO</span>
                    </div>

                    <div className="landing-decision-map__field">
                        <div className="landing-decision-map__center">
                            <Users className="h-6 w-6" />
                            <span>JOGO</span>
                        </div>
                        {mapLabels.map((label, index) => (
                            <div
                                key={label}
                                className={`landing-decision-map__node landing-decision-map__node--${index + 1}`}
                            >
                                <span>{String(index + 1).padStart(2, '0')}</span>
                                <strong>{label}</strong>
                            </div>
                        ))}
                    </div>

                    <div className="landing-decision-map__footer">
                        <span>{t('landing.badge')}</span>
                        <span>{t('landing.marqueeLucky')}</span>
                    </div>
                </motion.aside>

                <motion.ol variants={landingSectionReveal} className="landing-hero-signals">
                    {signalConfig.map(({ id, labelKey }, index) => (
                        <li key={id}>
                            <span>{String(index + 1).padStart(2, '0')}</span>
                            <strong>{t(labelKey)}</strong>
                        </li>
                    ))}
                </motion.ol>

                {animationsEnabled ? <span className="landing-hero-cursor" aria-hidden="true" /> : null}
            </motion.div>
        </LandingSection>
    );
}
