import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { setLanguageLoading } from '@/i18n/loading';

import translationPT from './locales/pt/translation.json';

export const SUPPORTED_LANGUAGES = ['pt', 'en', 'es', 'zh', 'hi', 'fr'] as const;

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
type TranslationModule = { default: Record<string, unknown> };

const localeLoaders: Record<SupportedLanguage, () => Promise<TranslationModule>> = {
    pt: async () => ({ default: translationPT as Record<string, unknown> }),
    en: async () => import('./locales/en/translation.json'),
    es: async () => import('./locales/es/translation.json'),
    zh: async () => import('./locales/zh/translation.json'),
    hi: async () => import('./locales/hi/translation.json'),
    fr: async () => import('./locales/fr/translation.json'),
};

const loadedLanguages = new Set<SupportedLanguage>(['pt']);

function normalizeLanguage(language: string | null | undefined): SupportedLanguage {
    const normalized = (language || 'pt').split('-')[0] as SupportedLanguage;
    return SUPPORTED_LANGUAGES.includes(normalized) ? normalized : 'pt';
}

async function ensureLanguageResources(language: string | null | undefined): Promise<void> {
    const normalized = normalizeLanguage(language);

    if (loadedLanguages.has(normalized)) {
        return;
    }

    setLanguageLoading(true);

    try {
        const module = await localeLoaders[normalized]();
        i18n.addResourceBundle(normalized, 'translation', module.default, true, true);
        loadedLanguages.add(normalized);
    } finally {
        setLanguageLoading(false);
    }
}

void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            pt: {
                translation: translationPT,
            },
        },
        fallbackLng: 'pt',
        supportedLngs: SUPPORTED_LANGUAGES,
        nonExplicitSupportedLngs: true,
        load: 'languageOnly',
        debug: false,
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ['localStorage', 'navigator', 'htmlTag'],
            caches: ['localStorage'],
            lookupLocalStorage: 'i18nextLng',
        },
        react: {
            useSuspense: false,
            bindI18nStore: 'added',
        },
    })
    .then(() => ensureLanguageResources(i18n.resolvedLanguage || i18n.language));

i18n.on('languageChanged', (language) => {
    void ensureLanguageResources(language);
});

export default i18n;