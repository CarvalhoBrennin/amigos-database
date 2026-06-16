import { AnimatePresence, motion } from 'framer-motion';
import { Gamepad2 } from 'lucide-react';
import { useMinVisible } from '@/hooks/useMinVisible';
import { cn } from '@/lib/cn';

type GridMaskTone = 'amber' | 'blue';

interface GridLoadingOverlayProps {
    visible: boolean;
    className?: string;
    tone?: GridMaskTone;
    minDurationMs?: number;
}

const toneClasses: Record<GridMaskTone, string> = {
    amber: 'catalog-grid-mask--amber',
    blue: 'catalog-grid-mask--blue',
};

export function GridLoadingOverlay({
    visible,
    className,
    tone = 'amber',
    minDurationMs = 360,
}: GridLoadingOverlayProps) {
    const showMask = useMinVisible(visible, minDurationMs);

    return (
        <AnimatePresence>
            {showMask ? (
                <motion.div
                    key="grid-mask"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                    className={cn(
                        'catalog-grid-mask pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden rounded-xl',
                        toneClasses[tone],
                        className
                    )}
                >
                    <span className="catalog-grid-mask__beam" aria-hidden="true" />
                    <span className="catalog-grid-mask__beam catalog-grid-mask__beam--delayed" aria-hidden="true" />
                    <div
                        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-stone-950/50 shadow-lg backdrop-blur-sm"
                        aria-hidden="true"
                    >
                        <Gamepad2 className="h-5 w-5 animate-pulse text-stone-300/90" />
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
