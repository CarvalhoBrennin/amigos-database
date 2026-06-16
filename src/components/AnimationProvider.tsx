import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { AnimationContext, type ReducedMotionSetting } from '@/components/animation-context';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface AnimationProviderProps {
    children: ReactNode;
}

export function AnimationProvider({ children }: AnimationProviderProps) {
    const {
        shouldReduceMotion,
        toggleAnimations,
        userPreference,
    } = useReducedMotion();
    const animationsEnabled = !shouldReduceMotion;
    const performanceMode = shouldReduceMotion;

    const reducedMotionSetting: ReducedMotionSetting = !animationsEnabled
        ? 'always'
        : userPreference === 'enabled'
            ? 'never'
            : 'user';

    useEffect(() => {
        document.documentElement.dataset.animations = animationsEnabled ? 'enabled' : 'disabled';

        return () => {
            delete document.documentElement.dataset.animations;
        };
    }, [animationsEnabled]);

    const handleToggleAnimations = () => {
        toggleAnimations(animationsEnabled);
    };

    return (
        <AnimationContext.Provider
            value={{
                animationsEnabled,
                toggleAnimations: handleToggleAnimations,
                performanceMode,
                reducedMotionSetting,
            }}
        >
            {children}
        </AnimationContext.Provider>
    );
}
