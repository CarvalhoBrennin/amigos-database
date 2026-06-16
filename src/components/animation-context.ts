import { createContext, useContext } from 'react';

export type ReducedMotionSetting = 'always' | 'never' | 'user';

export interface AnimationContextType {
    animationsEnabled: boolean;
    toggleAnimations: () => void;
    performanceMode: boolean;
    reducedMotionSetting: ReducedMotionSetting;
}

const defaultAnimationContext: AnimationContextType = {
    animationsEnabled: true,
    toggleAnimations: () => undefined,
    performanceMode: false,
    reducedMotionSetting: 'user',
};

export const AnimationContext = createContext<AnimationContextType>(defaultAnimationContext);

export function useAnimations() {
    return useContext(AnimationContext);
}
