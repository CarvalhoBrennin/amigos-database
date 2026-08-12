import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentError, parseServerEnv } from '../src/config/env.js';

const validEnv = {
    NODE_ENV: 'test',
    WEB_ORIGIN: 'http://localhost:5173,https://preview.example.com',
    PUBLIC_WEB_URL: 'http://localhost:5173',
    API_PUBLIC_URL: 'http://localhost:3001',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/amigos_test',
    SESSION_SECRET: 'session-secret-with-more-than-thirty-two-characters',
    TOKEN_PEPPER: 'token-pepper-with-more-than-thirty-two-characters',
};

describe('parseServerEnv', () => {
    it('normalizes valid configuration and origins', () => {
        const config = parseServerEnv(validEnv);

        expect(config.webOrigins).toEqual([
            'http://localhost:5173',
            'https://preview.example.com',
        ]);
        expect(config.port).toBe(3001);
        expect(config.roomTtlHours).toBe(168);
        expect(config.youtubeApiKey).toBeNull();
    });

    it('fails early when required secrets are weak', () => {
        expect(() => parseServerEnv({ ...validEnv, SESSION_SECRET: 'short' })).toThrow(
            InvalidEnvironmentError
        );
    });

    it('rejects non-PostgreSQL database URLs', () => {
        expect(() => parseServerEnv({ ...validEnv, DATABASE_URL: 'https://example.com/db' })).toThrow(
            InvalidEnvironmentError
        );
    });

    it('rejects malformed origin allowlists', () => {
        expect(() => parseServerEnv({ ...validEnv, WEB_ORIGIN: 'not a url' })).toThrow(
            InvalidEnvironmentError
        );
    });

    it('rejects non HTTP(S) origins', () => {
        expect(() => parseServerEnv({ ...validEnv, WEB_ORIGIN: 'javascript:alert(1)' })).toThrow(
            InvalidEnvironmentError
        );
    });
});
