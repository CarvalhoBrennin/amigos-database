import { Suspense } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { PageTransition } from '@/components/ui/PageTransition';
import { AnimationToggle } from '@/components/ui/AnimationToggle';
import { RouteFallback } from '@/components/ui/RouteFallback';
import { ContentLoadingOverlay } from '@/components/ui/loading/ContentLoadingOverlay';
import { useI18nLanguageLoading } from '@/hooks/useI18nLanguageLoading';
import { LoadingSpinner } from '@/components/ui/loading/LoadingSpinner';
import { cn } from '@/lib/cn';

export function AppLayout() {
    const { t } = useTranslation();
    const isLanguageLoading = useI18nLanguageLoading();

    return (
        <div className="app-frame min-h-screen flex flex-col bg-transparent">
            {isLanguageLoading ? (
                <div
                    className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-stone-950/90 py-1.5 text-xs text-stone-400"
                    role="status"
                    aria-live="polite"
                >
                    <LoadingSpinner size="sm" tone="amber" />
                    <span>{t('common.loading')}</span>
                </div>
            ) : null}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-amber-500 focus:px-4 focus:py-2 focus:text-stone-950 focus:font-semibold"
            >
                {t('common.skipToContent')}
            </a>
            <Navbar />
            <div id="main-content" className="app-content flex-1 relative z-10">
                <div className="app-route-frame relative min-h-full">
                    <ContentLoadingOverlay
                        visible={isLanguageLoading}
                        tone="amber"
                        className="min-h-[40vh] rounded-none"
                    />
                    <motion.div
                        className={cn('app-route-surface', isLanguageLoading && 'pointer-events-none')}
                        animate={{
                            opacity: isLanguageLoading ? 0.6 : 1,
                            filter: isLanguageLoading ? 'blur(4px) saturate(0.9)' : 'blur(0px) saturate(1)',
                        }}
                        transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
                    >
                        <Suspense fallback={<RouteFallback variant="content" />}>
                            <PageTransition />
                        </Suspense>
                    </motion.div>
                </div>
            </div>
            <Footer />
            <AnimationToggle />
        </div>
    );
}
