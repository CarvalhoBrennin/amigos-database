import { z } from 'zod';
import { gameIdSchema, isoDateTimeSchema, regionCodeSchema } from './common.js';
import { platformCodeSchema, platformFamilySchema } from './platform.js';
import { subscriptionCapabilitiesSchema } from './subscription.js';
import {
    gameDecisionProfileSchema,
    gameNetworkPoolSchema,
    gamePlatformOfferingSchema,
    gamePriceSchema,
    gameSubscriptionAvailabilitySchema,
} from './decision-data.js';

export const adminRoleSchema = z.enum(['SUPER_ADMIN', 'EDITOR', 'VIEWER']);
export const adminPermissionSchema = z.enum([
    'ADMIN_USERS_READ',
    'ADMIN_USERS_WRITE',
    'DASHBOARD_READ',
    'ROOMS_READ',
    'ROOMS_WRITE',
    'ROOMS_DELETE',
    'SESSIONS_READ',
    'SESSIONS_WRITE',
    'DECISION_DATA_READ',
    'DECISION_DATA_WRITE',
    'REFERENCES_READ',
    'REFERENCES_WRITE',
    'AUDIT_READ',
    'RETENTION_RUN',
]);

export const adminEmailSchema = z.string().trim().toLowerCase().email().max(254);
export const adminPasswordSchema = z.string().min(12).max(128)
    .refine((value) => !containsControlCharacter(value), 'A senha não pode conter caracteres de controle');
export const adminDisplayNameSchema = z.string().trim().min(2).max(80)
    .refine((value) => !containsControlCharacter(value), 'O nome não pode conter caracteres de controle');

export const adminUserSchema = z.object({
    id: z.string().uuid(),
    email: adminEmailSchema,
    displayName: adminDisplayNameSchema,
    role: adminRoleSchema,
    active: z.boolean(),
    lockedUntil: isoDateTimeSchema.nullable(),
    lastLoginAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
});

export const adminSessionSchema = z.object({
    user: adminUserSchema,
    permissions: z.array(adminPermissionSchema),
    expiresAt: isoDateTimeSchema,
});

export const adminLoginRequestSchema = z.object({
    email: adminEmailSchema,
    password: z.string().min(1).max(128),
}).strict();

export const adminLoginResponseSchema = adminSessionSchema.extend({
    csrfToken: z.string().min(32).max(256),
});

export const adminCreateUserRequestSchema = z.object({
    email: adminEmailSchema,
    displayName: adminDisplayNameSchema,
    password: adminPasswordSchema,
    role: adminRoleSchema,
}).strict();

export const adminUpdateUserRequestSchema = z.object({
    displayName: adminDisplayNameSchema.optional(),
    role: adminRoleSchema.optional(),
    active: z.boolean().optional(),
    newPassword: adminPasswordSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração');

export const adminChangeOwnPasswordRequestSchema = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: adminPasswordSchema,
}).strict();

export const adminPaginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const adminPageMetaSchema = z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
});

export const adminUsersResponseSchema = z.object({
    users: z.array(adminUserSchema),
    meta: adminPageMetaSchema,
});

export const adminDashboardSchema = z.object({
    rooms: z.object({
        total: z.number().int().nonnegative(),
        active: z.number().int().nonnegative(),
        lobby: z.number().int().nonnegative(),
        matching: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
        expiredPendingPurge: z.number().int().nonnegative(),
    }),
    participants: z.object({
        total: z.number().int().nonnegative(),
        active: z.number().int().nonnegative(),
    }),
    sessions: z.object({
        guestActive: z.number().int().nonnegative(),
        adminActive: z.number().int().nonnegative(),
    }),
    decisionData: z.object({
        catalogGames: z.number().int().nonnegative(),
        complete: z.number().int().nonnegative(),
        partial: z.number().int().nonnegative(),
        unknown: z.number().int().nonnegative(),
        missing: z.number().int().nonnegative(),
        staleRecords: z.number().int().nonnegative(),
    }),
    generatedAt: isoDateTimeSchema,
});

export const adminRoomStatusSchema = z.enum(['LOBBY', 'MATCHING', 'SHORTLIST', 'COMPLETED', 'CANCELLED', 'EXPIRED']);

export const adminRoomListItemSchema = z.object({
    id: z.string().uuid(),
    code: z.string(),
    status: adminRoomStatusSchema,
    version: z.number().int().positive(),
    regionCode: regionCodeSchema,
    participantCount: z.number().int().nonnegative(),
    readyCount: z.number().int().nonnegative(),
    candidateCount: z.number().int().nonnegative(),
    voteCount: z.number().int().nonnegative(),
    matchCount: z.number().int().nonnegative(),
    decisionGameId: gameIdSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema,
});

export const adminRoomsResponseSchema = z.object({
    rooms: z.array(adminRoomListItemSchema),
    meta: adminPageMetaSchema,
});

export const adminRoomParticipantSchema = z.object({
    id: z.string().uuid(),
    nickname: z.string(),
    role: z.enum(['HOST', 'MEMBER']),
    status: z.enum(['CONFIGURING', 'READY', 'LEFT']),
    platforms: z.array(z.string()),
    subscriptions: z.array(z.string()),
    ownedGamesCount: z.number().int().nonnegative(),
    joinedAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
});

export const adminRoomDetailsSchema = adminRoomListItemSchema.extend({
    constraints: z.record(z.string(), z.unknown()),
    prefilterSummary: z.record(z.string(), z.unknown()).nullable(),
    participants: z.array(adminRoomParticipantSchema),
    historyCount: z.number().int().nonnegative(),
    decision: z.object({
        gameId: gameIdSchema,
        selectedByParticipantId: z.string().uuid(),
        createdAt: isoDateTimeSchema,
    }).nullable(),
    startedAt: isoDateTimeSchema.nullable(),
    completedAt: isoDateTimeSchema.nullable(),
});

export const adminUpdateRoomRequestSchema = z.object({
    action: z.enum(['CANCEL', 'EXPIRE', 'EXTEND']),
    extendHours: z.number().int().min(1).max(24 * 30).optional(),
}).strict().superRefine((value, context) => {
    if (value.action === 'EXTEND' && value.extendHours === undefined) {
        context.addIssue({ code: 'custom', path: ['extendHours'], message: 'Informe quantas horas devem ser adicionadas' });
    }
    if (value.action !== 'EXTEND' && value.extendHours !== undefined) {
        context.addIssue({ code: 'custom', path: ['extendHours'], message: 'Horas só podem ser usadas ao estender uma sala' });
    }
});

export const adminGuestSessionSchema = z.object({
    id: z.string().uuid(),
    activeRoomCount: z.number().int().nonnegative(),
    createdAt: isoDateTimeSchema,
    lastSeenAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema,
});

export const adminGuestSessionsResponseSchema = z.object({
    sessions: z.array(adminGuestSessionSchema),
    meta: adminPageMetaSchema,
});

export const adminManagedSessionSchema = z.object({
    id: z.string().uuid(),
    user: z.object({
        id: z.string().uuid(),
        email: adminEmailSchema,
        displayName: adminDisplayNameSchema,
        role: adminRoleSchema,
    }),
    current: z.boolean(),
    createdAt: isoDateTimeSchema,
    lastSeenAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema,
    revokedAt: isoDateTimeSchema.nullable(),
});

export const adminManagedSessionsResponseSchema = z.object({
    sessions: z.array(adminManagedSessionSchema),
    meta: adminPageMetaSchema,
});

export const adminAuditEntrySchema = z.object({
    id: z.string().uuid(),
    actor: z.object({ id: z.string().uuid(), displayName: z.string(), email: adminEmailSchema }).nullable(),
    action: z.string(),
    entityType: z.string(),
    entityId: z.string().nullable(),
    requestId: z.string(),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: isoDateTimeSchema,
});

export const adminAuditResponseSchema = z.object({
    entries: z.array(adminAuditEntrySchema),
    meta: adminPageMetaSchema,
});

export const adminCatalogGameSchema = z.object({
    id: gameIdSchema,
    title: z.string().min(1),
    imageUrl: z.string().url().nullable(),
    type: z.string(),
    year: z.number().int(),
    decisionDataStatus: z.enum(['COMPLETE', 'PARTIAL', 'UNKNOWN', 'MISSING']),
    offeringsCount: z.number().int().nonnegative(),
    networkPoolsCount: z.number().int().nonnegative(),
    subscriptionRecordsCount: z.number().int().nonnegative(),
    priceRecordsCount: z.number().int().nonnegative(),
});

export const adminCatalogResponseSchema = z.object({
    games: z.array(adminCatalogGameSchema),
    meta: adminPageMetaSchema,
});

const identifiedPlatformOfferingSchema = gamePlatformOfferingSchema.extend({ id: z.string().uuid() });
const identifiedNetworkPoolSchema = gameNetworkPoolSchema.extend({ id: z.string().uuid() });
const identifiedSubscriptionAvailabilitySchema = gameSubscriptionAvailabilitySchema.extend({ id: z.string().uuid() });
const identifiedPriceSchema = gamePriceSchema.extend({ id: z.string().uuid() });

export const adminGameDecisionDataSchema = z.object({
    game: z.object({ id: gameIdSchema, title: z.string(), imageUrl: z.string().url().nullable() }),
    profile: gameDecisionProfileSchema.nullable(),
    offerings: z.array(identifiedPlatformOfferingSchema),
    networkPools: z.array(identifiedNetworkPoolSchema),
    subscriptionAvailability: z.array(identifiedSubscriptionAvailabilitySchema),
    prices: z.array(identifiedPriceSchema),
});

export const adminUpsertDecisionProfileRequestSchema = gameDecisionProfileSchema;
export const adminCreatePlatformOfferingRequestSchema = gamePlatformOfferingSchema;
export const adminCreateNetworkPoolRequestSchema = gameNetworkPoolSchema;
export const adminCreateSubscriptionAvailabilityRequestSchema = gameSubscriptionAvailabilitySchema;
export const adminCreatePriceRequestSchema = gamePriceSchema;

export const adminReferenceDataSchema = z.object({
    platforms: z.array(z.object({
        code: platformCodeSchema,
        family: z.string(),
        displayName: z.string(),
        active: z.boolean(),
        sortOrder: z.number().int(),
    })),
    services: z.array(z.object({
        id: z.string().uuid(),
        code: z.string(),
        displayName: z.string(),
        publisher: z.string(),
        active: z.boolean(),
    })),
    plans: z.array(z.object({
        id: z.string().uuid(),
        serviceId: z.string().uuid(),
        serviceCode: z.string(),
        code: z.string(),
        displayName: z.string(),
        active: z.boolean(),
        sortOrder: z.number().int(),
    })),
    planRegions: z.array(z.object({
        id: z.string().uuid(),
        planId: z.string().uuid(),
        planCode: z.string(),
        regionCode: regionCodeSchema,
        active: z.boolean(),
        capabilities: z.record(z.string(), z.unknown()),
        validFrom: isoDateTimeSchema.nullable(),
        validUntil: isoDateTimeSchema.nullable(),
        sourceUrl: z.string().url().nullable(),
        lastVerifiedAt: isoDateTimeSchema.nullable(),
    })),
});

export const adminReferenceResourceSchema = z.enum(['platforms', 'services', 'plans', 'plan-regions']);
export const adminReferenceMutationRequestSchema = z.object({ data: z.record(z.string(), z.unknown()) }).strict();
export const adminPlatformMutationSchema = z.object({
    code: platformCodeSchema,
    family: platformFamilySchema,
    displayName: z.string().trim().min(2).max(80),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(10_000),
}).strict();
export const adminSubscriptionServiceMutationSchema = z.object({
    code: z.string().trim().min(2).max(64).regex(/^[A-Z0-9_:-]+$/),
    displayName: z.string().trim().min(2).max(80),
    publisher: z.string().trim().min(2).max(80),
    active: z.boolean(),
}).strict();
export const adminSubscriptionPlanMutationSchema = z.object({
    serviceId: z.string().uuid(),
    code: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_:-]+$/),
    displayName: z.string().trim().min(2).max(100),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(10_000),
}).strict();
export const adminPlanRegionMutationSchema = z.object({
    planId: z.string().uuid(),
    regionCode: regionCodeSchema,
    active: z.boolean(),
    capabilities: subscriptionCapabilitiesSchema,
    validFrom: isoDateTimeSchema.nullable(),
    validUntil: isoDateTimeSchema.nullable(),
    sourceUrl: z.string().url().startsWith('https://').nullable(),
    lastVerifiedAt: isoDateTimeSchema.nullable(),
}).strict().superRefine((value, context) => {
    if (value.validFrom && value.validUntil && new Date(value.validFrom) > new Date(value.validUntil)) {
        context.addIssue({ code: 'custom', path: ['validUntil'], message: 'A validade não pode terminar antes de começar' });
    }
});

export const adminRetentionResultSchema = z.object({
    rooms: z.number().int().nonnegative(),
    guestSessions: z.number().int().nonnegative(),
    adminSessions: z.number().int().nonnegative(),
    idempotencyKeys: z.number().int().nonnegative(),
});

export type AdminRole = z.infer<typeof adminRoleSchema>;
export type AdminPermission = z.infer<typeof adminPermissionSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminSession = z.infer<typeof adminSessionSchema>;
export type AdminDashboard = z.infer<typeof adminDashboardSchema>;
export type AdminRoomStatus = z.infer<typeof adminRoomStatusSchema>;

function containsControlCharacter(value: string): boolean {
    return Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint < 32 || codePoint === 127;
    });
}
