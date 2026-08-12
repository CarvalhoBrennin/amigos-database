import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Gamepad2, Info, Home, Globe, Menu, X } from 'lucide-react';
import { navItemActive, transitions } from '@/lib/animations';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export function Navbar() {
    const { t } = useTranslation();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    const navLinks = [
        { to: '/catalog', label: t('nav.catalog'), icon: Home },
        { to: '/browser-games', label: t('nav.webGames'), icon: Globe },
        { to: '/about', label: t('nav.about'), icon: Info },
    ];

    return (
        <header className="app-navbar sticky top-0 z-40 w-full border-b border-stone-800 bg-stone-950/80 backdrop-blur-sm">
            <div className="app-navbar__inner mx-auto w-full px-4">
                <div className="flex h-16 items-center justify-between">
                    <Link to="/catalog" className="app-navbar__brand flex items-center gap-2 group">
                        <div className="app-navbar__mark p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 group-hover:bg-amber-500/20 transition-colors">
                            <Gamepad2 className="h-5 w-5 text-amber-500" />
                        </div>
                        <div className="app-navbar__brand-copy flex flex-col">
                            <span className="font-bold text-lg text-stone-100 leading-tight">
                                AMIGOS<span className="text-amber-500">DB</span>
                            </span>
                            <span className="hidden sm:block text-[10px] uppercase tracking-widest text-stone-500 leading-tight">
                                {t('nav.catalogSubtitle')}
                            </span>
                        </div>
                    </Link>

                    <nav className="hidden md:flex items-center gap-2" aria-label={t('nav.mainNavigation')}>
                        {navLinks.map(({ to, label, icon: Icon }) => {
                            const isActive = location.pathname === to;

                            return (
                                <div key={to}>
                                    <Link
                                        to={to}
                                        className={`
                                            group relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                                            transition-colors duration-200
                                            ${isActive
                                                ? 'text-amber-500'
                                                : 'text-stone-400 hover:text-stone-100 hover:bg-stone-800/50'
                                            }
                                        `}
                                    >
                                        <span className="transition-transform duration-200 group-hover:scale-110">
                                            <Icon className="h-4 w-4" aria-hidden="true" />
                                        </span>
                                        <span>{label}</span>

                                        {isActive && (
                                            <motion.div
                                                layoutId="activeNav"
                                                variants={navItemActive}
                                                initial="initial"
                                                animate="animate"
                                                className="absolute inset-0 bg-amber-500/10 border border-amber-500/30 rounded-lg -z-10"
                                                transition={transitions.springBouncy}
                                            />
                                        )}
                                    </Link>
                                </div>
                            );
                        })}

                        <div className="ml-2 flex items-center gap-2">
                            <ThemeToggle />
                            <LanguageSelector />
                        </div>
                    </nav>

                    <div className="flex md:hidden items-center gap-3">
                        <ThemeToggle />
                        <LanguageSelector />
                        <motion.button
                            type="button"
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            whileTap={{ scale: 0.95 }}
                            aria-expanded={isMobileMenuOpen}
                            aria-controls="mobile-navigation"
                            aria-label={isMobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
                            className="p-2 rounded-lg bg-stone-800/50 border border-stone-700 text-stone-300"
                        >
                            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </motion.button>
                    </div>
                </div>

                <AnimatePresence>
                    {isMobileMenuOpen && (
                        <motion.nav
                            id="mobile-navigation"
                            aria-label={t('nav.mainNavigation')}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="md:hidden overflow-hidden border-t border-stone-800"
                        >
                            <div className="py-4 space-y-2">
                                {navLinks.map(({ to, label, icon: Icon }) => {
                                    const isActive = location.pathname === to;

                                    return (
                                        <Link
                                            key={to}
                                            to={to}
                                            onClick={() => setIsMobileMenuOpen(false)}
                                            className={`
                                                flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium
                                                transition-colors duration-200
                                                ${isActive
                                                    ? 'text-amber-500 bg-amber-500/10'
                                                    : 'text-stone-400 hover:text-stone-100 hover:bg-stone-800/50'
                                                }
                                            `}
                                        >
                                            <Icon className="h-5 w-5" aria-hidden="true" />
                                            <span>{label}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </motion.nav>
                    )}
                </AnimatePresence>
            </div>
        </header>
    );
}
