import { z } from 'zod';
import { expectedRoomVersionSchema, gameIdSchema, regionCodeSchema } from './common.js';
import { nicknameSchema, participantPublicSnapshotSchema } from './participant.js';
import { prefilterSummarySchema } from './recommendation.js';

export const roomStatusSchema = z.enum([
    'LOBBY',
    'MATCHING',
    'SHORTLIST',
    'COMPLETED',
    'CANCELLED',
    'EXPIRED',
]);

export const accessPolicySchema = z.enum(['ALLOW_PURCHASE', 'NO_PURCHASE_REQUIRED']);
export const budgetModeSchema = z.enum(['STRICT', 'FLEXIBLE']);

export const roomConstraintsSchema = z.object({
    schemaVersion: z.literal(1),
    regionCode: regionCodeSchema.default('BR'),
    connectionMode: z.literal('ONLINE').default('ONLINE'),
    accessPolicy: accessPolicySchema,
    budgetMode: budgetModeSchema,
    maxPricePerPersonMinor: z.number().int().nonnegative().nullable(),
    maxGroupSpendMinor: z.number().int().nonnegative().nullable(),
    maxSessionMinutes: z.number().int().positive().max(24 * 60).nullable(),
    excludePreviouslyPlayed: z.boolean(),
    matchTarget: z.number().int().min(1).max(20).default(5),
    maxEvaluationsPerParticipant: z.number().int().min(5).max(100).default(30),
    requireVerifiedCompatibility: z.boolean().default(true),
});

export const defaultRoomConstraints = {
    schemaVersion: 1,
    regionCode: 'BR',
    connectionMode: 'ONLINE',
    accessPolicy: 'ALLOW_PURCHASE',
    budgetMode: 'FLEXIBLE',
    maxPricePerPersonMinor: null,
    maxGroupSpendMinor: null,
    maxSessionMinutes: null,
    excludePreviouslyPlayed: true,
    matchTarget: 5,
    maxEvaluationsPerParticipant: 30,
    requireVerifiedCompatibility: true,
} as const satisfies z.input<typeof roomConstraintsSchema>;

export const roomGameHistoryDispositionSchema = z.enum(['PLAYED', 'DO_NOT_SHOW', 'REPLAY_OK']);
export const roomGameHistoryEntrySchema = z.object({
    gameId: gameIdSchema,
    title: z.string().min(1),
    disposition: roomGameHistoryDispositionSchema,
    createdByParticipantId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
});

export const roomDecisionSchema = z.object({
    gameId: gameIdSchema,
    selectedByParticipantId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
});

export const roomPublicSnapshotSchema = z.object({
    id: z.string().uuid(),
    code: z.string().min(4).max(12),
    status: roomStatusSchema,
    version: z.number().int().positive(),
    regionCode: regionCodeSchema,
    constraints: roomConstraintsSchema,
    currentParticipantId: z.string().uuid(),
    participants: z.array(participantPublicSnapshotSchema),
    history: z.array(roomGameHistoryEntrySchema),
    prefilterSummary: prefilterSummarySchema.nullable(),
    decision: roomDecisionSchema.nullable(),
    createdAt: z.string().datetime({ offset: true }),
    startedAt: z.string().datetime({ offset: true }).nullable(),
    completedAt: z.string().datetime({ offset: true }).nullable(),
    expiresAt: z.string().datetime({ offset: true }),
});

export const createRoomRequestSchema = z.object({
    hostNickname: nicknameSchema,
    regionCode: regionCodeSchema.optional().default('BR'),
});

export const createRoomResponseSchema = z.object({
    room: roomPublicSnapshotSchema,
    invite: z.object({
        shareUrl: z.string().url(),
    }),
});

export const joinRoomRequestSchema = z.object({
    nickname: nicknameSchema,
    inviteToken: z.string().min(32).max(256).optional(),
});

export const joinRoomResponseSchema = z.object({
    room: roomPublicSnapshotSchema,
});

export const updateRoomConstraintsRequestSchema = z.object({
    expectedRoomVersion: expectedRoomVersionSchema,
    constraints: roomConstraintsSchema,
});

export const updateRoomHistoryRequestSchema = z.object({
    gameId: gameIdSchema,
    disposition: roomGameHistoryDispositionSchema,
    expectedRoomVersion: expectedRoomVersionSchema,
});

export const expectedRoomVersionRequestSchema = z.object({
    expectedRoomVersion: expectedRoomVersionSchema,
});

export const startRoomResponseSchema = z.object({
    roomVersion: z.number().int().positive(),
    status: z.literal('MATCHING'),
    prefilterSummary: prefilterSummarySchema,
});

export const completeRoomRequestSchema = z.object({
    gameId: gameIdSchema,
    expectedRoomVersion: expectedRoomVersionSchema,
});

export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type AccessPolicy = z.infer<typeof accessPolicySchema>;
export type BudgetMode = z.infer<typeof budgetModeSchema>;
export type RoomConstraints = z.infer<typeof roomConstraintsSchema>;
export type RoomGameHistoryDisposition = z.infer<typeof roomGameHistoryDispositionSchema>;
export type RoomGameHistoryEntry = z.infer<typeof roomGameHistoryEntrySchema>;
export type RoomPublicSnapshot = z.infer<typeof roomPublicSnapshotSchema>;
export type StartRoomResponse = z.infer<typeof startRoomResponseSchema>;
