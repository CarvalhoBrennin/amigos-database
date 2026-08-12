import { z } from 'zod';
import {
    candidateEvaluationSchema,
    catalogGameSummarySchema,
    swipeGameCardSchema,
} from './recommendation.js';

export const voteValueSchema = z.enum(['NO', 'MAYBE', 'YES']);
export const matchKindSchema = z.enum(['PERFECT', 'STRONG']);

export const submitVoteRequestSchema = z.object({
    value: voteValueSchema,
});

export const voteProgressSchema = z.object({
    voted: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    matches: z.number().int().nonnegative(),
    target: z.number().int().positive(),
});

export const roomMatchSchema = z.object({
    gameId: z.string().min(1).max(64),
    kind: matchKindSchema,
    matchScore: z.number().min(0).max(100),
    baseScore: z.number().min(0).max(100),
    yesCount: z.number().int().nonnegative(),
    maybeCount: z.number().int().nonnegative(),
    game: catalogGameSummarySchema,
    evaluation: candidateEvaluationSchema,
    createdAt: z.string().datetime({ offset: true }),
});

export const nextCardResponseSchema = z.object({
    card: swipeGameCardSchema.nullable(),
    progress: voteProgressSchema,
});

export const matchesResponseSchema = z.object({
    matches: z.array(roomMatchSchema),
});

export const submitVoteResponseSchema = z.object({
    roomVersion: z.number().int().positive(),
    finalized: z.boolean(),
    match: z.object({
        gameId: z.string().min(1).max(64),
        kind: matchKindSchema,
        matchScore: z.number().min(0).max(100),
    }).nullable(),
    progress: voteProgressSchema,
});

export const finalistDetailsSchema = z.object({
    match: roomMatchSchema,
    description: z.string(),
    mechanic: z.string(),
    verdict: z.string(),
    tags: z.array(z.string()),
    stats: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
    storeUrl: z.string().url().nullable(),
    participantAccess: z.array(z.object({
        participantId: z.string().uuid(),
        nickname: z.string().min(1).max(32),
        platformCode: z.string().min(1),
        accessKind: z.string().min(1),
        subscriptionPlanCode: z.string().nullable(),
        amountMinor: z.number().int().nonnegative().nullable(),
        currency: z.string().nullable(),
        onlineMultiplayer: z.string().min(1),
    })),
});

export type VoteValue = z.infer<typeof voteValueSchema>;
export type MatchKind = z.infer<typeof matchKindSchema>;
export type VoteProgress = z.infer<typeof voteProgressSchema>;
export type RoomMatch = z.infer<typeof roomMatchSchema>;
export type SubmitVoteResponse = z.infer<typeof submitVoteResponseSchema>;
export type NextCardResponse = z.infer<typeof nextCardResponseSchema>;
export type FinalistDetails = z.infer<typeof finalistDetailsSchema>;
