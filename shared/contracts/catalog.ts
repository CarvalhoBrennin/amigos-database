import { z } from 'zod';
import { gameIdSchema } from './common.js';

export const catalogSearchItemSchema = z.object({
    id: gameIdSchema,
    title: z.string().min(1),
    imageUrl: z.string().url().nullable(),
});

export const catalogSearchResponseSchema = z.object({
    games: z.array(catalogSearchItemSchema).max(20),
});

export type CatalogSearchItem = z.infer<typeof catalogSearchItemSchema>;
