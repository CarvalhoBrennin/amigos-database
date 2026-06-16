import { SUPPORTED_LANGUAGES } from '@/i18n';

const languageMetadata = {
    pt: { name: 'Português', flag: '🇧🇷' },
    en: { name: 'English', flag: '🇺🇸' },
    es: { name: 'Español', flag: '🇪🇸' },
    zh: { name: '中文', flag: '🇨🇳' },
    hi: { name: 'हिन्दी', flag: '🇮🇳' },
    fr: { name: 'Français', flag: '🇫🇷' },
} as const satisfies Record<(typeof SUPPORTED_LANGUAGES)[number], { name: string; flag: string }>;

export const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map((code) => ({
    code,
    ...languageMetadata[code],
}));
