import { z } from 'zod';
import { gameIdSchema } from './common.js';
import { platformCodeSchema } from './platform.js';
import { subscriptionPlanCodeSchema } from './subscription.js';

function containsControlCharacter(value: string): boolean {
    return [...value].some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    });
}

export const nicknameSchema = z
    .string()
    .trim()
    .min(2)
    .max(32)
    .refine((value) => !containsControlCharacter(value), 'O apelido não pode conter caracteres de controle');

export const participantRoleSchema = z.enum(['HOST', 'MEMBER']);
export const participantStatusSchema = z.enum(['CONFIGURING', 'READY', 'LEFT']);
export const pcTierSchema = z.enum(['LOW', 'MID', 'HIGH']);

export const participantPreferencesSchema = z.object({
    communication: z.number().int().min(0).max(10).nullable(),
    skill: z.number().int().min(0).max(10).nullable(),
    chaos: z.number().int().min(0).max(10).nullable(),
    strategy: z.number().int().min(0).max(10).nullable(),
    story: z.number().int().min(0).max(10).nullable(),
    difficultyTarget: z.enum(['EASY', 'MODERATE', 'HARD', 'BRUTAL']).nullable(),
});

export const defaultParticipantPreferences = {
    communication: null,
    skill: null,
    chaos: null,
    strategy: null,
    story: null,
    difficultyTarget: null,
} as const satisfies z.input<typeof participantPreferencesSchema>;

export const ownedGameSchema = z.object({
    gameId: gameIdSchema,
    platformCode: platformCodeSchema.nullable().optional(),
});

export const participantProfileSchema = z.object({
    platforms: z.array(platformCodeSchema).max(11),
    subscriptions: z.array(subscriptionPlanCodeSchema).max(32),
    ownedGames: z.array(ownedGameSchema).max(500),
    pcTier: pcTierSchema.nullable().optional(),
    preferences: participantPreferencesSchema,
}).superRefine((profile, context) => {
    if (new Set(profile.platforms).size !== profile.platforms.length) {
        context.addIssue({ code: 'custom', path: ['platforms'], message: 'Não é permitido repetir plataformas' });
    }
    if (new Set(profile.subscriptions).size !== profile.subscriptions.length) {
        context.addIssue({ code: 'custom', path: ['subscriptions'], message: 'Não é permitido repetir assinaturas' });
    }
    const ownedKeys = profile.ownedGames.map((game) => `${game.gameId}\u0000${game.platformCode ?? ''}`);
    if (new Set(ownedKeys).size !== ownedKeys.length) {
        context.addIssue({ code: 'custom', path: ['ownedGames'], message: 'Não é permitido repetir jogos possuídos' });
    }
});

export const updateParticipantProfileRequestSchema = participantProfileSchema.safeExtend({
    expectedRoomVersion: z.number().int().positive(),
});

export const setReadyRequestSchema = z.object({
    ready: z.boolean(),
    expectedRoomVersion: z.number().int().positive(),
});

export const participantPublicSnapshotSchema = z.object({
    id: z.string().uuid(),
    nickname: nicknameSchema,
    role: participantRoleSchema,
    status: participantStatusSchema,
    platforms: z.array(platformCodeSchema),
    subscriptions: z.array(subscriptionPlanCodeSchema),
    ownedGames: z.array(ownedGameSchema),
    pcTier: pcTierSchema.nullable(),
    preferences: participantPreferencesSchema,
    joinedAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
});

export type ParticipantRole = z.infer<typeof participantRoleSchema>;
export type ParticipantStatus = z.infer<typeof participantStatusSchema>;
export type PcTier = z.infer<typeof pcTierSchema>;
export type ParticipantPreferences = z.infer<typeof participantPreferencesSchema>;
export type ParticipantProfile = z.infer<typeof participantProfileSchema>;
export type ParticipantPublicSnapshot = z.infer<typeof participantPublicSnapshotSchema>;
