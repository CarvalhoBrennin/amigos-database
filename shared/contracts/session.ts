import { z } from 'zod';

export const guestSessionResponseSchema = z.object({
    csrfToken: z.string().min(32).max(256),
    expiresAt: z.string().datetime({ offset: true }),
});

export type GuestSessionResponse = z.infer<typeof guestSessionResponseSchema>;
