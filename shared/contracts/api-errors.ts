import { z } from 'zod';

export const fieldErrorSchema = z.object({
    field: z.string(),
    code: z.string(),
    message: z.string().optional(),
});

export const apiProblemSchema = z.object({
    type: z.string(),
    title: z.string(),
    status: z.number().int().min(400).max(599),
    code: z.string(),
    detail: z.string().optional(),
    requestId: z.string(),
    fieldErrors: z.array(fieldErrorSchema).optional(),
    currentVersion: z.number().int().positive().optional(),
});

export type ApiProblem = z.infer<typeof apiProblemSchema>;
export type ApiFieldError = z.infer<typeof fieldErrorSchema>;
