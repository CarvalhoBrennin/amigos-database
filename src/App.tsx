import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AnimationProvider } from '@/components/AnimationProvider';
import { useAnimations } from '@/components/animation-context';
import { AppLayout } from '@/components/layout/AppLayout';
import { createAppQueryClient } from '@/lib/queryClient';
import { SEOProvider } from '@/components/SEO';
import { RouteFallback } from '@/components/ui/RouteFallback';
import { WallpaperBackground } from '@/components/ui/WallpaperBackground';
import { preloadDetailChunks } from '@/utils/preloadDetailChunks';

const queryClient = createAppQueryClient();

const loadLandingPage = () => import('@/pages/LandingPage');
const loadHomePage = () => import('@/pages/HomePage');
const loadGamePage = () => import('@/pages/GamePage');
const loadAboutPage = () => import('@/pages/AboutPage');
const loadBrowserGamesPage = () => import('@/pages/BrowserGamesPage');
const loadNotFoundPage = () => import('@/pages/NotFoundPage');

const LandingPage = lazy(async () => {
    const module = await loadLandingPage();
    return { default: module.LandingPage };
});

const HomePage = lazy(async () => {
    const module = await loadHomePage();
    return { default: module.HomePage };
});

const GamePage = lazy(async () => {
    const module = await loadGamePage();
    return { default: module.GamePage };
});

const AboutPage = lazy(async () => {
    const module = await loadAboutPage();
    return { default: module.AboutPage };
});

const BrowserGamesPage = lazy(async () => {
    const module = await loadBrowserGamesPage();
    return { default: module.BrowserGamesPage };
});

const NotFoundPage = lazy(async () => {
    const module = await loadNotFoundPage();
    return { default: module.NotFoundPage };
});

function AppMotionConfig({ children }: { children: ReactNode }) {
    const { reducedMotionSetting } = useAnimations();

    return (
        <MotionConfig reducedMotion={reducedMotionSetting}>
            {children}
        </MotionConfig>
    );
}

function App() {
    useEffect(() => {
        const preloadRoutes = () => {
            void loadHomePage();
            preloadDetailChunks();
        };

        let idleCallbackId: number | null = null;
        let timeoutId: number | null = null;

        if (typeof window.requestIdleCallback === 'function') {
            idleCallbackId = window.requestIdleCallback(preloadRoutes, { timeout: 2000 });
        } else {
            timeoutId = window.setTimeout(preloadRoutes, 1500);
        }

        return () => {
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }

            if (idleCallbackId !== null) {
                window.cancelIdleCallback(idleCallbackId);
            }
        };
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <SEOProvider>
                <ThemeProvider>
                    <AnimationProvider>
                        <AppMotionConfig>
                            <BrowserRouter>
                                <WallpaperBackground />
                                <Routes>
                                        <Route
                                            path="/"
                                            element={
                                                <Suspense fallback={<RouteFallback />}>
                                                    <LandingPage />
                                                </Suspense>
                                            }
                                        />
                                        <Route path="/inicio" element={<Navigate to="/" replace />} />
                                        <Route element={<AppLayout />}>
                                            <Route path="/catalog" element={<HomePage />} />
                                            <Route path="/browser-games" element={<BrowserGamesPage />} />
                                            <Route path="/game/:id" element={<GamePage />} />
                                            <Route path="/about" element={<AboutPage />} />
                                            <Route path="*" element={<NotFoundPage />} />
                                        </Route>
                                    </Routes>
                            </BrowserRouter>
                        </AppMotionConfig>
                    </AnimationProvider>
                </ThemeProvider>
            </SEOProvider>
        </QueryClientProvider>
    );
}

export default App;
