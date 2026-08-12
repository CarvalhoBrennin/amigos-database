import { describe, expect, it } from 'vitest';
import { buildSetupSteps, resolveStepIndex } from '@/components/room/roomSteps';

const baseInput = { hasPcPlatform: false, hasSubscriptionPlans: true, isHost: false };

function ids(steps: ReturnType<typeof buildSetupSteps>): string[] {
    return steps.map((step) => step.id);
}

describe('buildSetupSteps', () => {
    it('asks every preference on its own step and always ends on the review', () => {
        const steps = buildSetupSteps(baseInput);
        expect(ids(steps)).toEqual([
            'platforms',
            'subscriptions',
            'communication',
            'skill',
            'chaos',
            'strategy',
            'story',
            'owned',
            'history',
            'review',
        ]);
    });

    it('skips the PC tier question until a PC platform is selected', () => {
        expect(ids(buildSetupSteps(baseInput))).not.toContain('pc');
        expect(ids(buildSetupSteps({ ...baseInput, hasPcPlatform: true }))).toContain('pc');
    });

    it('skips the subscription question when the region has no published plans', () => {
        expect(ids(buildSetupSteps({ ...baseInput, hasSubscriptionPlans: false }))).not.toContain('subscriptions');
    });

    it('only offers the room rules to the host', () => {
        expect(ids(buildSetupSteps(baseInput))).not.toContain('rules');
        expect(ids(buildSetupSteps({ ...baseInput, isHost: true }))).toContain('rules');
    });

    it('keeps the PC question right after the platform questions', () => {
        const steps = ids(buildSetupSteps({ ...baseInput, hasPcPlatform: true }));
        expect(steps.indexOf('pc')).toBe(steps.indexOf('subscriptions') + 1);
    });
});

describe('resolveStepIndex', () => {
    it('follows the active step when the sequence changes around it', () => {
        const withPc = buildSetupSteps({ ...baseInput, hasPcPlatform: true });
        const withoutPc = buildSetupSteps(baseInput);
        expect(resolveStepIndex(withPc, 'chaos')).toBe(5);
        expect(resolveStepIndex(withoutPc, 'chaos')).toBe(4);
    });

    it('falls back to the first step when the active one disappears', () => {
        expect(resolveStepIndex(buildSetupSteps(baseInput), 'pc')).toBe(0);
    });
});
