import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Github } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { SEO } from '@/components/SEO';
import { games, gameTypeIds } from '@/data/games';
import { browserGames } from '@/data/browserGames';
import { toSafeExternalUrl } from '@/utils/url';

function AboutSection({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <section className="border-t border-stone-800 pt-8 first:border-t-0 first:pt-0">
            <h2 className="text-base font-semibold uppercase tracking-wide text-stone-500 mb-3">
                {title}
            </h2>
            <div className="space-y-3 text-[15px] leading-relaxed text-stone-400">{children}</div>
        </section>
    );
}

export function AboutPage() {
    const { t } = useTranslation();
    const repositoryUrl = toSafeExternalUrl(import.meta.env.VITE_REPOSITORY_URL);

    const stats = [
        t('about.statsCatalog', { count: games.length }),
        t('about.statsBrowser', { count: browserGames.length }),
        t('about.statsCategories', { count: gameTypeIds.length }),
    ];

    const includes: Array<
        | { text: string; to: '/catalog' | '/browser-games' }
        | { text: string; to?: undefined }
    > = [
        { text: t('about.includesCatalog'), to: '/catalog' },
        { text: t('about.includesBrowser'), to: '/browser-games' },
        { text: t('about.includesDeals') },
        { text: t('about.includesGameplay') },
    ];

    return (
        <PageContainer>
            <SEO
                title={t('nav.about')}
                description={t('about.metaDescription')}
                canonicalPath="/about"
            />

            <div className="container mx-auto max-w-3xl px-4 py-8">
                <Breadcrumbs />

                <header className="mb-10 mt-6">
                    <p className="mb-2 text-sm font-medium uppercase tracking-widest text-stone-500">
                        {t('about.title')}
                    </p>
                    <h1 className="mb-4 text-3xl font-bold tracking-tight text-stone-100 sm:text-4xl">
                        {t('about.projectName')}
                    </h1>
                    <p className="text-lg leading-relaxed text-stone-400">{t('about.lead')}</p>
                </header>

                <dl className="mb-12 flex flex-wrap gap-2">
                    {stats.map((label) => (
                        <div
                            key={label}
                            className="rounded-md border border-stone-800 bg-stone-900/40 px-3 py-1.5 text-sm text-stone-300"
                        >
                            <dd>{label}</dd>
                        </div>
                    ))}
                </dl>

                <div className="space-y-8">
                    <AboutSection title={t('about.whatTitle')}>
                        <p>{t('about.whatBody')}</p>
                    </AboutSection>

                    <AboutSection title={t('about.includesTitle')}>
                        <ul className="space-y-2">
                            {includes.map((item) => (
                                <li key={item.text} className="flex flex-wrap items-baseline gap-x-2">
                                    <span className="text-stone-500" aria-hidden="true">
                                        —
                                    </span>
                                    <span>{item.text}</span>
                                    {item.to ? (
                                        <Link
                                            to={item.to}
                                            className="text-amber-500/90 hover:text-amber-400 underline-offset-2 hover:underline"
                                        >
                                            {item.to === '/catalog'
                                                ? t('about.linkCatalog')
                                                : t('about.linkBrowser')}
                                        </Link>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </AboutSection>

                    <AboutSection title={t('about.ratingsTitle')}>
                        <p>{t('about.ratingsBody')}</p>
                    </AboutSection>

                    <AboutSection title={t('about.techTitle')}>
                        <p>{t('about.techStack')}</p>
                    </AboutSection>

                    <AboutSection title={t('about.sourcesTitle')}>
                        <p>{t('about.sourcesBody')}</p>
                    </AboutSection>

                    {repositoryUrl ? (
                        <div className="border-t border-stone-800 pt-8">
                            <a
                                href={repositoryUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-lg border border-stone-700 bg-stone-900/60 px-4 py-2.5 text-sm font-medium text-stone-200 transition-colors hover:border-stone-600 hover:bg-stone-800"
                            >
                                <Github className="h-4 w-4" aria-hidden="true" />
                                {t('about.viewSource')}
                                <ExternalLink className="h-3.5 w-3.5 text-stone-500" aria-hidden="true" />
                            </a>
                        </div>
                    ) : null}
                </div>
            </div>
        </PageContainer>
    );
}
