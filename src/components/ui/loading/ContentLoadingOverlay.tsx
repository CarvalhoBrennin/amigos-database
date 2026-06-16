import { GridLoadingOverlay } from '@/components/ui/loading/GridLoadingOverlay';
import { cn } from '@/lib/cn';

type ContentMaskTone = 'amber' | 'blue';

interface ContentLoadingOverlayProps {
    visible: boolean;
    tone?: ContentMaskTone;
    className?: string;
    minDurationMs?: number;
}

/** Máscara de loading em modais, painéis e rotas. */
export function ContentLoadingOverlay({
    visible,
    tone = 'amber',
    className,
    minDurationMs = 280,
}: ContentLoadingOverlayProps) {
    return (
        <GridLoadingOverlay
            visible={visible}
            tone={tone}
            minDurationMs={minDurationMs}
            className={cn('z-30 rounded-none', className)}
        />
    );
}
