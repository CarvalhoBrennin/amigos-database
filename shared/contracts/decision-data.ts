import { z } from 'zod';
import {
    currencyCodeSchema,
    externalSourceUrlSchema,
    gameIdSchema,
    isoDateTimeSchema,
    regionCodeSchema,
    sourceTypeSchema,
    verificationStatusSchema,
} from './common.js';
import { pcTierSchema } from './participant.js';
import { platformCodeSchema } from './platform.js';
import { priceQualitySchema } from './recommendation.js';
import { accessTypeSchema, subscriptionCapabilitiesSchema, subscriptionPlanCodeSchema } from './subscription.js';

const nullablePositiveIntegerSchema = z.number().int().positive().nullable();
const nullableAxisSchema = z.number().int().min(0).max(10).nullable();

export const decisionDataStatusSchema = z.enum(['COMPLETE', 'PARTIAL', 'UNKNOWN']);

export const gameDecisionProfileSchema = z.object({
    minOnlinePlayers: nullablePositiveIntegerSchema,
    maxOnlinePlayers: nullablePositiveIntegerSchema,
    minSessionMinutes: nullablePositiveIntegerSchema,
    maxSessionMinutes: nullablePositiveIntegerSchema,
    installSizeMb: z.number().int().nonnegative().nullable(),
    minPcTier: pcTierSchema.nullable(),
    freeToPlay: z.boolean(),
    communication: nullableAxisSchema,
    skill: nullableAxisSchema,
    chaos: nullableAxisSchema,
    strategy: nullableAxisSchema,
    story: nullableAxisSchema,
    difficultyCode: z.enum(['EASY', 'MODERATE', 'HARD', 'BRUTAL']).nullable(),
    dataStatus: decisionDataStatusSchema,
    sourceType: sourceTypeSchema.nullable(),
    sourceUrl: externalSourceUrlSchema.nullable(),
    lastVerifiedAt: isoDateTimeSchema.nullable(),
}).superRefine((profile, context) => {
    if (profile.minOnlinePlayers !== null && profile.maxOnlinePlayers !== null
        && profile.minOnlinePlayers > profile.maxOnlinePlayers) {
        context.addIssue({ code: 'custom', path: ['maxOnlinePlayers'], message: 'O máximo de jogadores deve ser pelo menos o mínimo' });
    }
    if (profile.minSessionMinutes !== null && profile.maxSessionMinutes !== null
        && profile.minSessionMinutes > profile.maxSessionMinutes) {
        context.addIssue({ code: 'custom', path: ['maxSessionMinutes'], message: 'A duração máxima deve ser pelo menos a duração mínima' });
    }
    if (profile.dataStatus === 'COMPLETE' && (!profile.sourceUrl || !profile.lastVerifiedAt)) {
        context.addIssue({ code: 'custom', path: ['sourceUrl'], message: 'Perfis completos exigem fonte e data de verificação' });
    }
});

export const gamePlatformOfferingSchema = z.object({
    platformCode: platformCodeSchema,
    regionCode: regionCodeSchema.nullable(),
    onlineSupported: z.boolean(),
    freeToPlay: z.boolean(),
    requiresPaidOnlineSubscription: z.boolean().nullable(),
    onlineRequirementVerificationStatus: verificationStatusSchema,
    sourceType: sourceTypeSchema,
    sourceUrl: externalSourceUrlSchema.nullable(),
    verificationStatus: verificationStatusSchema,
    lastVerifiedAt: isoDateTimeSchema.nullable(),
    validFrom: isoDateTimeSchema.nullable(),
    validUntil: isoDateTimeSchema.nullable(),
}).superRefine(validateTemporalProvenance);

export const gameNetworkPoolSchema = z.object({
    poolCode: z.string().trim().min(1).max(80).regex(/^[A-Z0-9_:-]+$/),
    regionCode: regionCodeSchema.nullable(),
    platforms: z.array(platformCodeSchema).min(1).max(11),
    sourceType: sourceTypeSchema,
    sourceUrl: externalSourceUrlSchema.nullable(),
    verificationStatus: verificationStatusSchema,
    lastVerifiedAt: isoDateTimeSchema.nullable(),
    validFrom: isoDateTimeSchema.nullable(),
    validUntil: isoDateTimeSchema.nullable(),
}).superRefine(validateTemporalProvenance);

export const gameSubscriptionAvailabilitySchema = z.object({
    planCode: subscriptionPlanCodeSchema,
    platformCode: platformCodeSchema,
    regionCode: regionCodeSchema,
    accessType: accessTypeSchema,
    validFrom: isoDateTimeSchema.nullable(),
    validUntil: isoDateTimeSchema.nullable(),
    verificationStatus: verificationStatusSchema,
    sourceType: sourceTypeSchema,
    sourceUrl: externalSourceUrlSchema.nullable(),
    lastVerifiedAt: isoDateTimeSchema.nullable(),
}).superRefine(validateTemporalProvenance);

export const gamePriceSchema = z.object({
    platformCode: platformCodeSchema,
    regionCode: regionCodeSchema,
    storeCode: z.string().trim().min(2).max(64).regex(/^[A-Z0-9_:-]+$/),
    amountMinor: z.number().int().nonnegative(),
    currency: currencyCodeSchema,
    regularAmountMinor: z.number().int().nonnegative().nullable(),
    quality: priceQualitySchema,
    sourceUrl: externalSourceUrlSchema,
    observedAt: isoDateTimeSchema,
    validUntil: isoDateTimeSchema.nullable(),
}).superRefine((price, context) => {
    if (price.validUntil && new Date(price.observedAt) > new Date(price.validUntil)) {
        context.addIssue({ code: 'custom', path: ['validUntil'], message: 'A validade do preço não pode terminar antes da observação' });
    }
});

export const decisionDataGameImportSchema = z.object({
    gameId: gameIdSchema,
    profile: gameDecisionProfileSchema,
    offerings: z.array(gamePlatformOfferingSchema).max(50),
    networkPools: z.array(gameNetworkPoolSchema).max(50),
});

export const decisionDataImportSchema = z.object({
    schemaVersion: z.literal(1),
    games: z.array(decisionDataGameImportSchema).max(100_000),
}).superRefine((data, context) => {
    const ids = data.games.map((game) => game.gameId);
    if (new Set(ids).size !== ids.length) {
        context.addIssue({ code: 'custom', path: ['games'], message: 'Não é permitido repetir IDs de jogos' });
    }
});

export const priceImportSchema = z.object({
    schemaVersion: z.literal(1),
    records: z.array(gamePriceSchema.safeExtend({ gameId: gameIdSchema })).max(100_000),
});

export const decisionParticipantSchema = z.object({
    id: z.string().uuid(),
    platforms: z.array(platformCodeSchema).min(1),
    subscriptions: z.array(z.object({
        planCode: subscriptionPlanCodeSchema,
        capabilities: subscriptionCapabilitiesSchema,
        regionCode: regionCodeSchema,
    })),
    ownedGames: z.array(z.object({
        gameId: gameIdSchema,
        platformCode: platformCodeSchema.nullable(),
    })),
    pcTier: pcTierSchema.nullable(),
    preferences: z.object({
        communication: nullableAxisSchema,
        skill: nullableAxisSchema,
        chaos: nullableAxisSchema,
        strategy: nullableAxisSchema,
        story: nullableAxisSchema,
        difficultyTarget: z.enum(['EASY', 'MODERATE', 'HARD', 'BRUTAL']).nullable(),
    }),
});

export const candidateDecisionDataSchema = z.object({
    gameId: gameIdSchema,
    profile: gameDecisionProfileSchema,
    offerings: z.array(gamePlatformOfferingSchema),
    networkPools: z.array(gameNetworkPoolSchema),
    subscriptionAvailability: z.array(gameSubscriptionAvailabilitySchema),
    prices: z.array(gamePriceSchema),
});

function validateTemporalProvenance(
    value: {
        verificationStatus: 'VERIFIED' | 'STALE' | 'UNKNOWN';
        sourceUrl: string | null;
        lastVerifiedAt: string | null;
        validFrom: string | null;
        validUntil: string | null;
    },
    context: z.RefinementCtx
): void {
    if (value.validFrom && value.validUntil && new Date(value.validFrom) > new Date(value.validUntil)) {
        context.addIssue({ code: 'custom', path: ['validUntil'], message: 'A validade não pode terminar antes de começar' });
    }
    if (value.verificationStatus === 'VERIFIED' && (!value.sourceUrl || !value.lastVerifiedAt)) {
        context.addIssue({ code: 'custom', path: ['sourceUrl'], message: 'Registros verificados exigem fonte e data de verificação' });
    }
}

export type DecisionDataStatus = z.infer<typeof decisionDataStatusSchema>;
export type GameDecisionProfile = z.infer<typeof gameDecisionProfileSchema>;
export type DecisionDataGameImport = z.infer<typeof decisionDataGameImportSchema>;
export type GamePlatformOffering = z.infer<typeof gamePlatformOfferingSchema>;
export type GameNetworkPool = z.infer<typeof gameNetworkPoolSchema>;
export type GameSubscriptionAvailability = z.infer<typeof gameSubscriptionAvailabilitySchema>;
export type GamePrice = z.infer<typeof gamePriceSchema>;
export type DecisionParticipant = z.infer<typeof decisionParticipantSchema>;
export type CandidateDecisionData = z.infer<typeof candidateDecisionDataSchema>;
