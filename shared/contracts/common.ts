import { z } from 'zod';

export const regionCodeSchema = z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/, 'Region code must use ISO 3166-1 alpha-2 uppercase format');

export const currencyCodeSchema = z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/, 'Currency code must use ISO 4217 uppercase format');

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const uuidSchema = z.string().uuid();
export const gameIdSchema = z.string().trim().min(1).max(64);
export const expectedRoomVersionSchema = z.number().int().positive();

export const verificationStatusSchema = z.enum(['VERIFIED', 'STALE', 'UNKNOWN']);
export const sourceTypeSchema = z.enum([
    'OFFICIAL_MANUAL',
    'LICENSED_PROVIDER',
    'ADMIN_IMPORT',
]);

export const externalSourceUrlSchema = z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === 'https:', 'A fonte externa deve usar HTTPS');

export type RegionCode = z.infer<typeof regionCodeSchema>;
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type SourceType = z.infer<typeof sourceTypeSchema>;
