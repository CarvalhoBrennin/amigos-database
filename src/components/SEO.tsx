import { Helmet, HelmetProvider } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { buildCanonicalPath, getSiteUrl } from '@/lib/siteUrl';

const DEFAULT_OG_IMAGE = '/og-default.png';

interface SEOProps {
    title?: string;
    description?: string;
    keywords?: string;
    image?: string;
    type?: 'website' | 'article';
    canonicalPath?: string;
    noIndex?: boolean;
    jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

export function SEOProvider({ children }: { children: React.ReactNode }) {
    return <HelmetProvider>{children}</HelmetProvider>;
}

export function SEO({
    title,
    description,
    keywords,
    image,
    type = 'website',
    canonicalPath,
    noIndex = false,
    jsonLd,
}: SEOProps) {
    const { t, i18n } = useTranslation();

    const defaultTitle = 'AMIGOS Database';
    const defaultDescription = t('landing.subtitle');
    const defaultKeywords = t('seo.defaultKeywords');
    const fullTitle = title ? `${title} | ${defaultTitle}` : defaultTitle;
    const metaDescription = description || defaultDescription;
    const resolvedCanonicalUrl = canonicalPath ? buildCanonicalPath(canonicalPath) : undefined;
    const resolvedImage = image || `${getSiteUrl()}${DEFAULT_OG_IMAGE}`;
    const htmlLang = i18n.language || 'pt';
    const ogLocale = htmlLang.replace('-', '_');

    return (
        <Helmet>
            <html lang={htmlLang} />
            {resolvedCanonicalUrl ? <link rel="canonical" href={resolvedCanonicalUrl} /> : null}
            <link rel="alternate" hrefLang="x-default" href={resolvedCanonicalUrl ?? `${getSiteUrl()}/`} />
            <title>{fullTitle}</title>
            <meta name="description" content={metaDescription} />
            <meta name="keywords" content={keywords || defaultKeywords} />
            <meta name="robots" content={noIndex ? 'noindex,nofollow' : 'index,follow'} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={metaDescription} />
            <meta property="og:type" content={type} />
            {resolvedCanonicalUrl ? <meta property="og:url" content={resolvedCanonicalUrl} /> : null}
            <meta property="og:image" content={resolvedImage} />
            <meta property="og:locale" content={ogLocale} />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={metaDescription} />
            <meta name="twitter:image" content={resolvedImage} />
            {jsonLd ? (
                <script type="application/ld+json">
                    {JSON.stringify(jsonLd)}
                </script>
            ) : null}
        </Helmet>
    );
}
