import { z } from 'zod';
import { currencyCodeSchema, gameIdSchema } from './common.js';
import { platformCodeSchema } from './platform.js';
import { subscriptionPlanCodeSchema } from './subscription.js';

export const accessKindSchema = z.enum([
    'OWNED',
    'SUBSCRIPTION_DOWNLOAD',
    'FREE_TO_PLAY',
    'PURCHASE_REQUIRED',
    'UNKNOWN',
]);

export const onlineMultiplayerResolutionSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('NOT_REQUIRED') }),
    z.object({
        kind: z.literal('INCLUDED_BY_SUBSCRIPTION'),
        planCode: subscriptionPlanCodeSchema,
    }),
    z.object({ kind: z.literal('MISSING_REQUIRED_SUBSCRIPTION') }),
    z.object({ kind: z.literal('UNKNOWN_REQUIREMENT') }),
]);

export const priceQualitySchema = z.enum([
    'VERIFIED_LOCAL',
    'PROVIDER_ESTIMATE',
    'LEGACY_STATIC',
]);

export const participantGameAssignmentSchema = z.object({
    participantId: z.string().uuid(),
    platformCode: platformCodeSchema,
    accessKind: accessKindSchema,
    subscriptionPlanCode: subscriptionPlanCodeSchema.nullable(),
    amountMinor: z.number().int().nonnegative().nullable(),
    currency: currencyCodeSchema.nullable(),
    priceQuality: priceQualitySchema.nullable(),
    onlineMultiplayer: onlineMultiplayerResolutionSchema,
});

export const rejectionReasonSchema = z.enum([
    'INSUFFICIENT_DECISION_DATA',
    'PLAYER_COUNT_NOT_SUPPORTED',
    'NO_PLATFORM_ASSIGNMENT',
    'NO_COMMON_NETWORK_POOL',
    'NO_PURCHASE_REQUIRED_NOT_SATISFIED',
    'PER_PERSON_BUDGET_EXCEEDED',
    'GROUP_BUDGET_EXCEEDED',
    'PRICE_UNKNOWN_FOR_STRICT_BUDGET',
    'PREVIOUSLY_PLAYED_EXCLUDED',
    'DO_NOT_SHOW',
    'SESSION_TOO_LONG',
    'SUBSCRIPTION_NOT_VALID_FOR_REGION',
    'SUBSCRIPTION_ENTITLEMENT_EXPIRED',
    'ONLINE_MULTIPLAYER_SUBSCRIPTION_REQUIRED',
    'ONLINE_MULTIPLAYER_REQUIREMENT_UNKNOWN',
    'PC_REQUIREMENTS_NOT_MET',
]);

export const warningReasonSchema = z.enum([
    'ACCESS_UNKNOWN',
    'PRICE_ESTIMATE_ONLY',
    'LEGACY_PRICE_ONLY',
    'PC_REQUIREMENTS_UNKNOWN',
    'PARTIAL_DECISION_DATA',
    'PREVIOUSLY_PLAYED',
]);

const scoreDimensionSchema = z.object({
    points: z.number().min(0),
    max: z.number().positive(),
    reasons: z.array(z.string().min(1).max(120)),
});

export const scoreBreakdownSchema = z.object({
    preference: scoreDimensionSchema,
    access: scoreDimensionSchema,
    session: scoreDimensionSchema,
    price: scoreDimensionSchema,
    novelty: scoreDimensionSchema,
});

export const candidateEvaluationSchema = z.object({
    gameId: gameIdSchema,
    eligible: z.boolean(),
    rejectionReasons: z.array(rejectionReasonSchema),
    warnings: z.array(warningReasonSchema),
    baseScore: z.number().min(0).max(100),
    scoreBreakdown: scoreBreakdownSchema,
    assignment: z.array(participantGameAssignmentSchema),
    groupSpendMinor: z.number().int().nonnegative().nullable(),
    currency: currencyCodeSchema.nullable(),
    confidence: z.enum(['VERIFIED', 'PARTIAL', 'UNKNOWN']),
});

export const prefilterSummarySchema = z.object({
    totalConsidered: z.number().int().nonnegative(),
    eligible: z.number().int().nonnegative(),
    rejectedByReason: z.record(z.string(), z.number().int().nonnegative()),
});

export const catalogGameSummarySchema = z.object({
    id: gameIdSchema,
    title: z.string().min(1),
    imageUrl: z.string().url().nullable(),
    playerMin: z.number().int().positive(),
    playerMax: z.number().int().positive(),
    session: z.string().min(1),
    difficulty: z.string().min(1),
    rating: z.number().min(0).max(10),
    summary: z.string(),
});

export const swipeGameCardSchema = catalogGameSummarySchema.extend({
    baseScore: z.number().min(0).max(100),
    relevantPlatforms: z.array(platformCodeSchema),
    accessKinds: z.array(accessKindSchema),
    warnings: z.array(warningReasonSchema),
});

export type AccessKind = z.infer<typeof accessKindSchema>;
export type OnlineMultiplayerResolution = z.infer<typeof onlineMultiplayerResolutionSchema>;
export type PriceQuality = z.infer<typeof priceQualitySchema>;
export type ParticipantGameAssignment = z.infer<typeof participantGameAssignmentSchema>;
export type RejectionReason = z.infer<typeof rejectionReasonSchema>;
export type WarningReason = z.infer<typeof warningReasonSchema>;
export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>;
export type CandidateEvaluation = z.infer<typeof candidateEvaluationSchema>;
export type PrefilterSummary = z.infer<typeof prefilterSummarySchema>;
export type CatalogGameSummary = z.infer<typeof catalogGameSummarySchema>;
export type SwipeGameCard = z.infer<typeof swipeGameCardSchema>;
