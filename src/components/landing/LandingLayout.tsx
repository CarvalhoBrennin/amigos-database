import { type ReactNode, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

interface LandingLayoutProps {
    children: ReactNode;
}

function restoreThemeFromStorage() {
    const root = document.documentElement;

    try {
        const savedTheme = localStorage.getItem('theme');
        const theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark';

        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        root.style.colorScheme = theme;
    } catch {
        root.classList.remove('light');
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
    }
}

export function LandingLayout({ children }: LandingLayoutProps) {
    const { t } = useTranslation();

    useLayoutEffect(() => {
        const root = document.documentElement;
        root.classList.add('landing-dark');
        root.classList.remove('light');
        root.classList.add('dark');
        root.style.colorScheme = 'dark';

        return () => {
            root.classList.remove('landing-dark');
            restoreThemeFromStorage();
        };
    }, []);

    return (
        <div className="landing-page relative min-h-screen overflow-x-hidden text-stone-100">
            <a
                href="#landing-main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-amber-500 focus:px-4 focus:py-2 focus:font-semibold focus:text-stone-950"
            >
                {t('common.skipToContent')}
            </a>

            <div className="landing-overlay pointer-events-none fixed inset-0 z-[1]" aria-hidden="true" />

            <div className="landing-page__content relative z-10">{children}</div>
        </div>
    );
}

export function LandingSection({
    children,
    className,
    id,
}: {
    children: ReactNode;
    className?: string;
    id?: string;
}) {
    return (
        <section id={id} className={cn('landing-section mx-auto w-full', className)}>
            {children}
        </section>
    );
}
