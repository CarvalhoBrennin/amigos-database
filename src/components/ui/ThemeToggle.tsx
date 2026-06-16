import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/components/ThemeProvider';

export function ThemeToggle() {
    const { t } = useTranslation();
    const { theme, toggleTheme } = useTheme();
    const label =
        theme === 'dark'
            ? t('common.enableLightMode')
            : t('common.enableDarkMode');

    return (
        <motion.button
            type="button"
            onClick={toggleTheme}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label={label}
            className="p-2 rounded-lg bg-stone-800/50 border border-stone-700 hover:border-amber-500/30 transition-all"
            title={label}
        >
            <motion.div
                initial={false}
                animate={{ rotate: theme === 'dark' ? 0 : 180 }}
                transition={{ duration: 0.3 }}
            >
                {theme === 'dark' ? (
                    <Moon className="h-4 w-4 text-stone-300" />
                ) : (
                    <Sun className="h-4 w-4 text-amber-500" />
                )}
            </motion.div>
        </motion.button>
    );
}
