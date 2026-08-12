import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { LANGUAGE_OPTIONS } from '@/constants/languages';
import { useAnimations } from '@/components/animation-context';
import { useI18nLanguageLoading } from '@/hooks/useI18nLanguageLoading';
import { LoadingSpinner } from '@/components/ui/loading/LoadingSpinner';

interface LanguageSelectorProps {
    variant?: 'navbar' | 'landing';
}

export function LanguageSelector({ variant = 'navbar' }: LanguageSelectorProps) {
    const { i18n } = useTranslation();
    const { animationsEnabled } = useAnimations();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const activeLanguage = (i18n.resolvedLanguage || i18n.language || 'pt').split('-')[0];
    const isLanguageLoading = useI18nLanguageLoading();

    const currentLanguage = LANGUAGE_OPTIONS.find((lang) => lang.code === activeLanguage) || LANGUAGE_OPTIONS[0];

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLanguageChange = (langCode: string) => {
        void i18n.changeLanguage(langCode);

        try {
            localStorage.setItem('i18nextLng', langCode);
        } catch {
            // localStorage indisponível.
        }

        setIsOpen(false);
    };

    if (variant === 'landing') {
        return (
            <div className="flex flex-wrap gap-1 sm:gap-2" role="group" aria-label={i18n.t('common.availableLanguages')}>
                {LANGUAGE_OPTIONS.map((lang) => (
                    <motion.button
                        key={lang.code}
                        type="button"
                        onClick={() => handleLanguageChange(lang.code)}
                        whileHover={animationsEnabled ? { scale: 1.05 } : undefined}
                        whileTap={animationsEnabled ? { scale: 0.95 } : undefined}
                        aria-label={`${lang.name} (${lang.code.toUpperCase()})`}
                        aria-pressed={activeLanguage === lang.code}
                        aria-busy={isLanguageLoading || undefined}
                        disabled={isLanguageLoading}
                        className={`
                            px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all
                            ${activeLanguage === lang.code
                                ? 'bg-amber-500 text-stone-900 shadow-lg shadow-amber-500/25'
                                : 'bg-stone-800/50 text-stone-400 hover:bg-stone-700/50 hover:text-stone-200'
                            }
                        `}
                    >
                        <span className="mr-1">{lang.flag}</span>
                        {lang.code.toUpperCase()}
                    </motion.button>
                ))}
            </div>
        );
    }

    return (
        <div ref={dropdownRef} className="app-language-selector relative">
            <motion.button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                whileHover={animationsEnabled ? { scale: 1.02 } : undefined}
                whileTap={animationsEnabled ? { scale: 0.98 } : undefined}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label={i18n.t('common.selectLanguage')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-800/50 border border-stone-700 hover:border-amber-500/30 transition-all text-sm"
            >
                <Globe className="h-4 w-4 text-stone-400" />
                {isLanguageLoading ? <LoadingSpinner size="sm" tone="amber" /> : null}
                <span className="text-stone-200">{currentLanguage.flag} {currentLanguage.code.toUpperCase()}</span>
                <ChevronDown className={`h-3 w-3 text-stone-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </motion.button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={animationsEnabled ? { opacity: 0, y: -10, scale: 0.95 } : false}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={animationsEnabled ? { opacity: 0, y: -10, scale: 0.95 } : undefined}
                        transition={{ duration: 0.15 }}
                        role="listbox"
                        aria-label={i18n.t('common.availableLanguages')}
                        className="absolute right-0 top-full mt-2 w-48 bg-stone-900 border border-stone-700 rounded-lg shadow-xl overflow-hidden z-50"
                    >
                        {LANGUAGE_OPTIONS.map((lang) => (
                            <button
                                key={lang.code}
                                type="button"
                                onClick={() => handleLanguageChange(lang.code)}
                                role="option"
                                aria-selected={activeLanguage === lang.code}
                                className={`
                                    w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors
                                    ${activeLanguage === lang.code
                                        ? 'bg-amber-500/10 text-amber-500'
                                        : 'text-stone-300 hover:bg-stone-800'
                                    }
                                `}
                            >
                                <span className="text-lg">{lang.flag}</span>
                                <span className="flex-1">{lang.name}</span>
                                {activeLanguage === lang.code && (
                                    <Check className="h-4 w-4 text-amber-500" />
                                )}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
