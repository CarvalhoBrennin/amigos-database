import { useEffect, useRef, useState } from 'react';
import { useMinVisible } from '@/hooks/useMinVisible';

/** Máscara breve ao trocar contentKey com modal aberto. */
export function useContentSwapMask(
    contentKey: string | number | null,
    isActive: boolean,
    minDurationMs = 300
): boolean {
    const previousKeyRef = useRef(contentKey);
    const [isSwapping, setIsSwapping] = useState(false);
    const showMask = useMinVisible(isSwapping, minDurationMs);

    useEffect(() => {
        if (!isActive) {
            previousKeyRef.current = contentKey;
            setIsSwapping(false);
            return;
        }

        if (
            contentKey !== null &&
            previousKeyRef.current !== null &&
            previousKeyRef.current !== contentKey
        ) {
            setIsSwapping(true);
        }

        previousKeyRef.current = contentKey;
    }, [contentKey, isActive]);

    useEffect(() => {
        if (isSwapping && !showMask) {
            setIsSwapping(false);
        }
    }, [isSwapping, showMask]);

    return showMask;
}
