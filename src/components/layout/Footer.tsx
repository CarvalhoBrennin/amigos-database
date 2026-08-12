import { useTranslation } from 'react-i18next';
import { Heart, Github } from 'lucide-react';
import { toSafeExternalUrl } from '@/utils/url';

export function Footer() {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear();
    const repositoryUrl = toSafeExternalUrl(import.meta.env.VITE_REPOSITORY_URL);

    return (
        <footer className="app-footer mt-auto border-t border-stone-800 bg-stone-950">
            <div className="container mx-auto px-4 py-8">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    {/* copyright */}
                    <div className="flex items-center gap-2 text-sm text-stone-500">
                        <span>© {currentYear} AMIGOS Database.</span>
                        <span className="hidden sm:inline">{t('footer.madeWith')}</span>
                        <Heart className="h-4 w-4 text-red-500 hidden sm:inline" />
                        <span className="hidden sm:inline">{t('footer.forGamers')}</span>
                    </div>

                    {/* versão */}
                    <div className="flex items-center gap-4 text-xs text-stone-600">
                        <span className="px-2 py-1 bg-stone-900 rounded border border-stone-800">
                            {t('footer.version')}
                        </span>
                    </div>

                    {/* links */}
                    <div className="flex items-center gap-4">
                        {repositoryUrl ? (
                            <a
                                href={repositoryUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={t('footer.repository')}
                                className="text-stone-500 hover:text-stone-300 transition-colors"
                            >
                                <Github className="h-5 w-5" />
                            </a>
                        ) : null}
                    </div>
                </div>
            </div>
        </footer>
    );
}
