import { z } from 'zod';

const environmentSchema = z.enum(['development', 'test', 'production']);

const rawServerEnvSchema = z.object({
    NODE_ENV: environmentSchema.default('development'),
    HOST: z.string().trim().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    WEB_ORIGIN: z.string().trim().min(1),
    PUBLIC_WEB_URL: z.string().url(),
    API_PUBLIC_URL: z.string().url(),
    DATABASE_URL: z.string().url().refine(
        (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
        'DATABASE_URL must use the PostgreSQL protocol'
    ),
    SESSION_SECRET: z.string().min(32),
    TOKEN_PEPPER: z.string().min(32),
    YOUTUBE_API_KEY: z.string().trim().optional().default(''),
    ROOM_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(168),
    GUEST_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(168),
    ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 7).default(12),
    MAX_ROOM_PARTICIPANTS: z.coerce.number().int().min(2).max(16).default(12),
    BODY_LIMIT_BYTES: z.coerce.number().int().min(1_024).max(1_048_576).default(65_536),
    YOUTUBE_CACHE_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(720),
    YOUTUBE_NEGATIVE_CACHE_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(72),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface ServerConfig {
    nodeEnv: z.infer<typeof environmentSchema>;
    host: string;
    port: number;
    webOrigins: string[];
    publicWebUrl: string;
    apiPublicUrl: string;
    databaseUrl: string;
    sessionSecret: string;
    tokenPepper: string;
    youtubeApiKey: string | null;
    roomTtlHours: number;
    guestSessionTtlHours: number;
    adminSessionTtlHours: number;
    maxRoomParticipants: number;
    bodyLimitBytes: number;
    youtubeCacheTtlHours: number;
    youtubeNegativeCacheTtlHours: number;
    logLevel: z.infer<typeof rawServerEnvSchema>['LOG_LEVEL'];
    isProduction: boolean;
}

export class InvalidEnvironmentError extends Error {
    readonly issues: z.ZodIssue[];

    constructor(issues: z.ZodIssue[]) {
        super('Invalid server environment configuration');
        this.name = 'InvalidEnvironmentError';
        this.issues = issues;
    }
}

function normalizeOrigins(value: string): string[] {
    const origins = value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map((origin) => {
            const parsed = new URL(origin);
            if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin === 'null') {
                throw new Error('WEB_ORIGIN must use HTTP or HTTPS');
            }
            return parsed.origin;
        });

    return [...new Set(origins)];
}

export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerConfig {
    const parsed = rawServerEnvSchema.safeParse(source);
    if (!parsed.success) {
        throw new InvalidEnvironmentError(parsed.error.issues);
    }

    let webOrigins: string[];
    try {
        webOrigins = normalizeOrigins(parsed.data.WEB_ORIGIN);
    } catch {
        throw new InvalidEnvironmentError([
            {
                code: 'custom',
                path: ['WEB_ORIGIN'],
                message: 'WEB_ORIGIN must contain valid absolute origins',
            },
        ]);
    }

    if (webOrigins.length === 0) {
        throw new InvalidEnvironmentError([
            {
                code: 'custom',
                path: ['WEB_ORIGIN'],
                message: 'WEB_ORIGIN must contain at least one origin',
            },
        ]);
    }

    return {
        nodeEnv: parsed.data.NODE_ENV,
        host: parsed.data.HOST,
        port: parsed.data.PORT,
        webOrigins,
        publicWebUrl: new URL(parsed.data.PUBLIC_WEB_URL).origin,
        apiPublicUrl: new URL(parsed.data.API_PUBLIC_URL).origin,
        databaseUrl: parsed.data.DATABASE_URL,
        sessionSecret: parsed.data.SESSION_SECRET,
        tokenPepper: parsed.data.TOKEN_PEPPER,
        youtubeApiKey: parsed.data.YOUTUBE_API_KEY || null,
        roomTtlHours: parsed.data.ROOM_TTL_HOURS,
        guestSessionTtlHours: parsed.data.GUEST_SESSION_TTL_HOURS,
        adminSessionTtlHours: parsed.data.ADMIN_SESSION_TTL_HOURS,
        maxRoomParticipants: parsed.data.MAX_ROOM_PARTICIPANTS,
        bodyLimitBytes: parsed.data.BODY_LIMIT_BYTES,
        youtubeCacheTtlHours: parsed.data.YOUTUBE_CACHE_TTL_HOURS,
        youtubeNegativeCacheTtlHours: parsed.data.YOUTUBE_NEGATIVE_CACHE_TTL_HOURS,
        logLevel: parsed.data.LOG_LEVEL,
        isProduction: parsed.data.NODE_ENV === 'production',
    };
}
