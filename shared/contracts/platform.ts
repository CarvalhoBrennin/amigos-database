import { z } from 'zod';

export const platformFamilySchema = z.enum([
    'PC',
    'XBOX',
    'PLAYSTATION',
    'NINTENDO',
    'MOBILE',
    'BROWSER',
]);

export const platformCodeSchema = z.enum([
    'PC_STEAM',
    'PC_MICROSOFT_STORE',
    'PC_EPIC',
    'XBOX_ONE',
    'XBOX_SERIES',
    'PS4',
    'PS5',
    'NINTENDO_SWITCH',
    'ANDROID',
    'IOS',
    'BROWSER',
]);

export const platformReferenceSchema = z.object({
    code: platformCodeSchema,
    family: platformFamilySchema,
    displayName: z.string().min(1).max(80),
    active: z.boolean(),
    sortOrder: z.number().int().nonnegative(),
});

export const platformsResponseSchema = z.object({
    platforms: z.array(platformReferenceSchema),
});

export type PlatformFamily = z.infer<typeof platformFamilySchema>;
export type PlatformCode = z.infer<typeof platformCodeSchema>;
export type PlatformReference = z.infer<typeof platformReferenceSchema>;
