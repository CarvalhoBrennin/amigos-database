import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Gamepad2, Globe, Info, Home, Menu, X } from 'lucide-react';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import { useAnimations } from '@/components/animation-context';

const navLinkConfig = [
    { to: '/catalog', labelKey: 'nav.catalog', icon: Home },
    { to: '/browser-games', labelKey: 'nav.webGames', icon: Globe },
    { to: '/about', labelKey: 'nav.about', icon: Info },
] as const;

export function LandingHeader() {
    const { t } = useTranslation();
    const location = useLocation();
    const { animationsEnabled } = useAnimations();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const navLinks = navLinkConfig.map(({ to, labelKey, icon }) => ({
        to,
        label: t(labelKey),
        icon,
    }));

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    return (
        <header className="landing-header sticky top-0 z-50 border-b border-amber-500/20 bg-stone-950/85 backdrop-blur-md">
            <div className="landing-header__inner mx-auto w-full">
                <div className="flex h-16 items-center justify-between gap-4">
                    <Link to="/" className="group flex min-w-0 items-center gap-2.5">
                        <div className="landing-cabinet-icon rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-2 transition-colors group-hover:border-amber-400 group-hover:bg-amber-500/20">
                            <Gamepad2 className="h-5 w-5 text-amber-400" aria-hidden="true" />
                        </div>
                        <div className="flex min-w-0 flex-col leading-tight">
                            <span className="landing-display truncate text-lg font-bold tracking-wide text-white">
                                AMIGOS<span className="text-amber-400">DB</span>
                            </span>
                            <span className="hidden text-[10px] uppercase tracking-[0.2em] text-stone-400 sm:block">
                                {t('nav.catalogSubtitle')}
                            </span>
                        </div>
                    </Link>

                    <nav className="hidden items-center gap-1 md:flex" aria-label={t('landing.navLabel')}>
                        {navLinks.map(({ to, label, icon: Icon }) => (
                            <Link
                                key={to}
                                to={to}
                                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-300 transition-colors hover:bg-amber-500/10 hover:text-amber-300"
                            >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                                {label}
                            </Link>
                        ))}
                    </nav>

                    <div className="flex shrink-0 items-center gap-2">
                        <div className="hidden md:block">
                            <LanguageSelector variant="landing" />
                        </div>
                        <motion.button
                            type="button"
                            onClick={() => setIsMobileMenuOpen((open) => !open)}
                            whileTap={animationsEnabled ? { scale: 0.95 } : undefined}
                            aria-expanded={isMobileMenuOpen}
                            aria-controls="landing-mobile-navigation"
                            aria-label={isMobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
                            className="rounded-lg border border-amber-500/30 bg-stone-900/80 p-2 text-stone-200 md:hidden"
                        >
                            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </motion.button>
                    </div>
                </div>

                <AnimatePresence>
                    {isMobileMenuOpen ? (
                        <motion.nav
                            id="landing-mobile-navigation"
                            aria-label={t('landing.navLabel')}
                            initial={animationsEnabled ? { opacity: 0, height: 0 } : false}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={animationsEnabled ? { opacity: 0, height: 0 } : undefined}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t border-amber-500/20 md:hidden"
                        >
                            <div className="space-y-2 py-4">
                                {navLinks.map(({ to, label, icon: Icon }) => (
                                    <Link
                                        key={to}
                                        to={to}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-stone-300 transition-colors hover:bg-amber-500/10 hover:text-amber-200"
                                    >
                                        <Icon className="h-5 w-5 text-amber-400" aria-hidden="true" />
                                        {label}
                                    </Link>
                                ))}
                                <div className="border-t border-amber-500/15 px-2 pt-4">
                                    <LanguageSelector variant="landing" />
                                </div>
                            </div>
                        </motion.nav>
                    ) : null}
                </AnimatePresence>
            </div>
        </header>
    );
}
