import { z } from 'zod';

export const gameplayMediaResponseSchema = z.object({
    video: z.object({
        videoId: z.string().min(1).max(32),
        title: z.string().min(1),
        durationSeconds: z.number().int().nonnegative(),
        viewCount: z.number().int().nonnegative(),
    }).nullable(),
    source: z.literal('YOUTUBE'),
    cached: z.boolean(),
});

export type GameplayMediaResponse = z.infer<typeof gameplayMediaResponseSchema>;
