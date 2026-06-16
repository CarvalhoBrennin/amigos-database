import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Settings, Zap } from 'lucide-react';
import { useAnimations } from '@/components/animation-context';

export function AnimationToggle() {
    const { t } = useTranslation();
    const { animationsEnabled, toggleAnimations, performanceMode } = useAnimations();
    const label = animationsEnabled ? t('animations.disable') : t('animations.enable');

    return (
        <motion.button
            type="button"
            onClick={() => toggleAnimations()}
            className="fixed bottom-4 right-4 p-3 bg-orange-500 hover:bg-orange-600 text-white rounded-full shadow-lg z-50 flex items-center gap-2 transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label={label}
            title={label}
        >
            <Settings size={20} aria-hidden="true" />
            {performanceMode ? <Zap size={16} aria-hidden="true" /> : null}
            <span className="text-sm font-medium hidden sm:inline">
                {animationsEnabled ? t('animations.on') : t('animations.off')}
            </span>
        </motion.button>
    );
}
