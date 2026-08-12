import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function LandingFooter() {
    const { t } = useTranslation();
    const year = new Date().getFullYear();

    const footerLinks = [
        { to: '/catalog', labelKey: 'nav.catalog' },
        { to: '/browser-games', labelKey: 'nav.webGames' },
        { to: '/about', labelKey: 'nav.about' },
    ] as const;

    return (
        <footer className="landing-footer relative z-10 border-t border-amber-500/15 py-8">
            <div className="landing-footer__inner mx-auto w-full text-center">
                <nav
                    className="mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
                    aria-label={t('landing.navLabel')}
                >
                    {footerLinks.map(({ to, labelKey }) => (
                        <Link
                            key={to}
                            to={to}
                            className="text-sm font-medium text-stone-400 transition-colors hover:text-amber-300"
                        >
                            {t(labelKey)}
                        </Link>
                    ))}
                </nav>
                <p className="font-mono text-xs uppercase tracking-wider text-stone-500">
                    © {year} AMIGOS Database
                </p>
            </div>
        </footer>
    );
}
