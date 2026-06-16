import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Home, Frown } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/Button';
import { Magnet } from '@/components/react-bits';

export function NotFoundPage() {
    const { t } = useTranslation();

    return (
        <PageContainer>
            <SEO title={t('notFound.heading')} description={t('notFound.description')} canonicalPath="/" noIndex />
            <div className="container mx-auto px-4 py-20">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center"
                >
                    <motion.div
                        className="inline-block p-6 rounded-full bg-stone-800 mb-6"
                        animate={{
                            scale: [1, 1.05, 1],
                            rotate: [0, -5, 5, 0],
                        }}
                        transition={{
                            duration: 3,
                            repeat: Infinity,
                            ease: 'easeInOut'
                        }}
                    >
                        <Frown className="h-16 w-16 text-stone-500" />
                    </motion.div>

                    <p className="text-8xl font-bold mb-4 text-gradient" aria-hidden="true">
                        {t('notFound.title')}
                    </p>
                    <h1 className="text-2xl font-bold text-stone-300 mb-4">{t('notFound.heading')}</h1>
                    <p className="text-stone-500 max-w-md mx-auto mb-8">
                        {t('notFound.description')}
                    </p>

                    <Magnet padding={30} magnetStrength={0.2}>
                        <Button to="/">
                            <Home className="h-4 w-4 mr-2" />
                            {t('notFound.backHome')}
                        </Button>
                    </Magnet>
                </motion.div>
            </div>
        </PageContainer>
    );
}
