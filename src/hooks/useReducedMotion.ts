import { useEffect, useState } from 'react';

type AnimationPreference = 'system' | 'enabled' | 'disabled';

export function useReducedMotion() {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
    const [userPreference, setUserPreference] = useState<AnimationPreference>('system');

    useEffect(() => {
        // Track the operating system reduced-motion preference.
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        setPrefersReducedMotion(mediaQuery.matches);

        const handleChange = (e: MediaQueryListEvent) => {
            setPrefersReducedMotion(e.matches);
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    useEffect(() => {
        // Restore the user's saved animation preference.
        let savedPreference: string | null = null;
        let legacyPreference: string | null = null;

        try {
            savedPreference = localStorage.getItem('animations-preference');
            legacyPreference = localStorage.getItem('animations-disabled');
        } catch {
            return;
        }

        if (savedPreference === 'enabled' || savedPreference === 'disabled' || savedPreference === 'system') {
            setUserPreference(savedPreference);
            return;
        }

        if (legacyPreference === 'true') {
            setUserPreference('disabled');
            return;
        }

        if (legacyPreference === 'false') {
            setUserPreference('enabled');
        }
    }, []);

    const userDisabledAnimations = userPreference === 'disabled';
    const userForcedAnimations = userPreference === 'enabled';
    const shouldReduceMotion = userDisabledAnimations || (!userForcedAnimations && prefersReducedMotion);

    const toggleAnimations = (shouldDisable: boolean) => {
        const nextPreference: AnimationPreference = shouldDisable ? 'disabled' : 'enabled';

        try {
            localStorage.setItem('animations-preference', nextPreference);
            localStorage.removeItem('animations-disabled');
        } catch {
            // localStorage indisponível.
        }

        setUserPreference(nextPreference);
    };

    return {
        shouldReduceMotion,
        systemPrefersReduced: prefersReducedMotion,
        userDisabled: userDisabledAnimations,
        userForced: userForcedAnimations,
        userPreference,
        toggleAnimations,
    };
}
