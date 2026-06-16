import { useEffect, useRef, useState } from 'react';

/** Mantém true por pelo menos minDurationMs após ativar. */
export function useMinVisible(active: boolean, minDurationMs = 320): boolean {
    const [visible, setVisible] = useState(active);
    const shownAtRef = useRef<number | null>(active ? Date.now() : null);

    useEffect(() => {
        if (active) {
            shownAtRef.current = Date.now();
            setVisible(true);
            return;
        }

        if (!shownAtRef.current) {
            setVisible(false);
            return;
        }

        const elapsed = Date.now() - shownAtRef.current;
        const remaining = Math.max(0, minDurationMs - elapsed);

        const timeoutId = window.setTimeout(() => {
            setVisible(false);
            shownAtRef.current = null;
        }, remaining);

        return () => window.clearTimeout(timeoutId);
    }, [active, minDurationMs]);

    return visible;
}
