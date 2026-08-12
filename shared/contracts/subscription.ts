import { z } from 'zod';
import {
    externalSourceUrlSchema,
    isoDateTimeSchema,
    regionCodeSchema,
    uuidSchema,
} from './common.js';
import { platformCodeSchema } from './platform.js';

export const subscriptionServiceCodeSchema = z.enum([
    'XBOX_GAME_PASS',
    'PLAYSTATION_PLUS',
]);

export const subscriptionPlanCodeSchema = z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/);

export const subscriptionCapabilitiesSchema = z.object({
    onlineMultiplayer: z.boolean(),
    gameCatalogDownload: z.boolean(),
    monthlyClaimedGames: z.boolean(),
    cloudStreaming: z.boolean(),
});

export const subscriptionPlanReferenceSchema = z.object({
    id: uuidSchema,
    serviceCode: subscriptionServiceCodeSchema,
    serviceDisplayName: z.string().min(1).max(80),
    code: subscriptionPlanCodeSchema,
    displayName: z.string().min(1).max(100),
    regionCode: regionCodeSchema,
    active: z.boolean(),
    capabilities: subscriptionCapabilitiesSchema,
    sortOrder: z.number().int().nonnegative(),
    sourceUrl: externalSourceUrlSchema.nullable(),
    verifiedAt: isoDateTimeSchema.nullable(),
});

export const subscriptionPlansResponseSchema = z.object({
    regionCode: regionCodeSchema,
    plans: z.array(subscriptionPlanReferenceSchema),
});

export const accessTypeSchema = z.enum(['DOWNLOAD', 'CLOUD_STREAM']);

export type SubscriptionServiceCode = z.infer<typeof subscriptionServiceCodeSchema>;
export type SubscriptionPlanCode = z.infer<typeof subscriptionPlanCodeSchema>;
export type SubscriptionCapabilities = z.infer<typeof subscriptionCapabilitiesSchema>;
export type SubscriptionPlanReference = z.infer<typeof subscriptionPlanReferenceSchema>;
export type SubscriptionAccessType = z.infer<typeof accessTypeSchema>;

export const subscriptionAvailabilityImportRecordSchema = z.object({
    gameId: z.string().trim().min(1).max(64),
    planCode: subscriptionPlanCodeSchema,
    platformCode: platformCodeSchema,
    regionCode: regionCodeSchema,
    accessType: accessTypeSchema,
    validFrom: isoDateTimeSchema.nullable(),
    validUntil: isoDateTimeSchema.nullable(),
    verificationStatus: z.enum(['VERIFIED', 'UNVERIFIED']),
    sourceType: z.enum(['OFFICIAL', 'LICENSED_PROVIDER', 'MANUAL_REVIEW']),
    sourceUrl: externalSourceUrlSchema,
    lastVerifiedAt: isoDateTimeSchema,
}).superRefine((record, context) => {
    if (record.validFrom && record.validUntil && new Date(record.validFrom) > new Date(record.validUntil)) {
        context.addIssue({ code: 'custom', path: ['validUntil'], message: 'A validade não pode terminar antes de começar' });
    }
});

export const subscriptionAvailabilityImportSchema = z.object({
    schemaVersion: z.literal(1),
    records: z.array(subscriptionAvailabilityImportRecordSchema).max(100_000),
});
